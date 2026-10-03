import { GraphQLInt, GraphQLObjectType, GraphQLSchema, GraphQLString } from "graphql";
import { describe, expect, it, vi } from "vitest";
import { createGraphqlWs, type GraphqlWsPeer } from "./graphql-ws";

interface FakePeer extends GraphqlWsPeer {
  sent: string[];
  messages(): Array<{ type: string; id?: string; payload?: unknown }>;
}

function fakePeer(id = "p1", context?: unknown): FakePeer {
  const sent: string[] = [];
  return {
    id,
    context,
    sent,
    send(text: string): void {
      sent.push(text);
    },
    messages() {
      return sent.map((s) => JSON.parse(s) as { type: string; id?: string; payload?: unknown });
    },
  };
}

// Controllable subscription source: each release() lets one value through.
let releases: Array<() => void> = [];
let tickClosed = false;
const TICK_VALUES = [10, 20, 30];

const schema = new GraphQLSchema({
  query: new GraphQLObjectType({
    name: "Query",
    fields: {
      hello: {
        type: GraphQLString,
        args: { name: { type: GraphQLString } },
        resolve: (_src, args) => `hi ${(args.name as string | undefined) ?? "anon"}`,
      },
      fail: {
        type: GraphQLString,
        resolve: () => {
          throw new Error("resolver boom");
        },
      },
    },
  }),
  mutation: new GraphQLObjectType({
    name: "Mutation",
    fields: {
      echo: {
        type: GraphQLString,
        args: { text: { type: GraphQLString } },
        resolve: (_src, args) => args.text,
      },
    },
  }),
  subscription: new GraphQLObjectType({
    name: "Subscription",
    fields: {
      tick: {
        type: GraphQLInt,
        subscribe: async function* () {
          try {
            for (const v of TICK_VALUES) {
              await new Promise<void>((resolve) => releases.push(resolve));
              yield { tick: v };
            }
          } finally {
            tickClosed = true;
          }
        },
      },
      boom: {
        type: GraphQLInt,
        subscribe: () => {
          throw new Error("cannot subscribe");
        },
      },
    },
  }),
});

function setup(context?: unknown) {
  releases = [];
  tickClosed = false;
  const getContext = vi.fn((peer: GraphqlWsPeer) => ({
    user: (peer.context as { user?: unknown } | undefined)?.user ?? null,
  }));
  const handler = createGraphqlWs({ schema, getContext });
  const peer = fakePeer("p1", context);
  handler.open(peer.id);
  return { handler, peer, getContext };
}

const sub = (id: string, query: string, variables?: unknown) =>
  JSON.stringify({ type: "subscribe", id, payload: { query, variables } });

describe("createGraphqlWs handshake", () => {
  it("acks connection_init and answers ping", async () => {
    const { handler, peer } = setup();
    await handler.message(peer, JSON.stringify({ type: "connection_init" }));
    await handler.message(peer, JSON.stringify({ type: "ping" }));
    expect(peer.messages()).toEqual([{ type: "connection_ack" }, { type: "pong" }]);
  });

  it("ignores garbage, unknown types and id-less complete", async () => {
    const { handler, peer } = setup();
    await handler.message(peer, "not-json{{{");
    await handler.message(peer, JSON.stringify({ type: "whatever" }));
    await handler.message(peer, JSON.stringify({ type: "complete" }));
    await handler.message(peer, JSON.stringify({ type: "subscribe" }));
    expect(peer.sent).toEqual([]);
  });
});

describe("createGraphqlWs query/mutation", () => {
  it("runs a query with variables and completes", async () => {
    const { handler, peer, getContext } = setup({ user: "u1" });
    await handler.message(peer, sub("q1", 'query { hello(name: "Ada") }'));
    expect(peer.messages()).toEqual([
      { type: "next", id: "q1", payload: { data: { hello: "hi Ada" } } },
      { type: "complete", id: "q1" },
    ]);
    expect(getContext).toHaveBeenCalledWith(peer);
  });

  it("runs a mutation and completes", async () => {
    const { handler, peer } = setup();
    await handler.message(peer, sub("m1", "mutation ($t: String) { echo(text: $t) }", { t: "hey" }));
    expect(peer.messages()).toEqual([
      { type: "next", id: "m1", payload: { data: { echo: "hey" } } },
      { type: "complete", id: "m1" },
    ]);
  });

  it("reports field errors as next with errors + complete", async () => {
    const { handler, peer } = setup();
    await handler.message(peer, sub("q9", "query { fail }"));
    const [next, complete] = peer.messages();
    expect(next?.type).toBe("next");
    expect(next?.payload).toMatchObject({ data: { fail: null }, errors: [{ message: "resolver boom" }] });
    expect(complete).toEqual({ type: "complete", id: "q9" });
  });

  it("reports parse errors without completing", async () => {
    const { handler, peer } = setup();
    await handler.message(peer, sub("bad", "query {{{"));
    expect(peer.messages()).toEqual([{ type: "error", id: "bad", payload: [{ message: expect.any(String) }] }]);
  });

  it("reports validation errors without completing", async () => {
    const { handler, peer } = setup();
    await handler.message(peer, sub("bad", "query { noSuchField }"));
    const [err] = peer.messages();
    expect(err?.type).toBe("error");
    expect(peer.messages()).toHaveLength(1);
  });
});

describe("createGraphqlWs subscription", () => {
  it("streams values and completes when the source ends", async () => {
    const { handler, peer } = setup();
    const run = handler.message(peer, sub("s1", "subscription { tick }"));
    for (let i = 0; i < TICK_VALUES.length; i += 1) {
      await vi.waitFor(() => expect(releases.length).toBeGreaterThan(0));
      releases.shift()?.();
    }
    await run;
    expect(peer.messages()).toEqual([
      ...TICK_VALUES.map((v) => ({ type: "next", id: "s1", payload: { data: { tick: v } } })),
      { type: "complete", id: "s1" },
    ]);
    expect(tickClosed).toBe(true);
  });

  it("stops streaming on client complete", async () => {
    const { handler, peer } = setup();
    const run = handler.message(peer, sub("s1", "subscription { tick }"));
    await vi.waitFor(() => expect(releases.length).toBeGreaterThan(0));
    releases.shift()?.();
    await vi.waitFor(() => expect(peer.messages()).toHaveLength(1));
    await handler.message(peer, JSON.stringify({ type: "complete", id: "s1" }));
    for (const release of releases.splice(0)) release();
    await run;
    // one value, then stopped: no error, exactly one complete
    expect(peer.messages().filter((m) => m.type === "next")).toHaveLength(1);
    expect(peer.messages().at(-1)).toEqual({ type: "complete", id: "s1" });
    expect(tickClosed).toBe(true);
  });

  it("stops every operation on close", async () => {
    const { handler, peer } = setup();
    const run = handler.message(peer, sub("s1", "subscription { tick }"));
    await vi.waitFor(() => expect(releases.length).toBeGreaterThan(0));
    await handler.close(peer.id);
    for (const release of releases.splice(0)) release();
    await run;
    // close terminates the iterator: no values leak afterwards
    expect(peer.messages().filter((m) => m.type === "next")).toHaveLength(0);
    expect(tickClosed).toBe(true);
  });

  it("reports subscribe failures as error + complete", async () => {
    const { handler, peer } = setup();
    await handler.message(peer, sub("s9", "subscription { boom }"));
    const [err, complete] = peer.messages();
    expect(err?.type).toBe("error");
    expect(complete).toEqual({ type: "complete", id: "s9" });
  });
});
