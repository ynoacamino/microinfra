import { afterEach, describe, expect, it, vi } from "vitest";
import { createEnvConfig } from "../../schema/env-schema";
import { createMapEnv } from "../memory/map-env";
import { createRedisStreamsPubSub } from "./redis-pubsub";

function testConfig() {
  return createEnvConfig(
    createMapEnv({ UPSTASH_REDIS_REST_URL: "http://redis.test", UPSTASH_REDIS_REST_TOKEN: "token" }),
  );
}

function jsonResponse(result: unknown): Response {
  return new Response(JSON.stringify({ result }), { status: 200 });
}

async function collect<T>(iterable: AsyncIterable<T>, count: number, timeoutMs = 2000): Promise<T[]> {
  const iterator = iterable[Symbol.asyncIterator]();
  const collected: T[] = [];
  const deadline = Date.now() + timeoutMs;
  try {
    while (collected.length < count && Date.now() < deadline) {
      const next = await Promise.race([
        iterator.next(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 50)),
      ]);
      if (next && !next.done) {
        collected.push(next.value);
      }
    }
  } finally {
    (iterable as { close?: () => void | Promise<void> }).close?.();
    await iterator.return?.(undefined);
  }
  return collected;
}

describe("RedisStreamsPubSub", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws when redis is not configured", () => {
    const config = createEnvConfig(createMapEnv({}));
    expect(() => createRedisStreamsPubSub(config)).toThrow("[pubsub]");
  });

  it("publishes through a pipeline of XADD + XTRIM", async () => {
    const seen: unknown[][] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init: { body: string }) => {
        seen.push(JSON.parse(init.body) as unknown[][]);
        return jsonResponse("ok");
      }),
    );
    const pubsub = createRedisStreamsPubSub(testConfig(), { prefix: "test:ps" });
    pubsub.publish("chat", { hello: "world" });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(seen).toHaveLength(1);
    const pipeline = seen[0] as unknown[][];
    expect(pipeline[0]?.[0]).toBe("XADD");
    expect(pipeline[0]?.[1]).toBe("test:ps:chat");
    expect(pipeline[0]).toContain(JSON.stringify({ data: { hello: "world" } }));
    const midIndex = (pipeline[0] as unknown[]).indexOf("mid");
    expect(midIndex).toBeGreaterThan(-1);
    expect(typeof (pipeline[0] as unknown[])[midIndex + 1]).toBe("string");
    expect(pipeline[1]?.[0]).toBe("XTRIM");
  });

  it("subscribes from the latest id and yields parsed payloads", async () => {
    const calls: unknown[][] = [];
    const reads: unknown[] = [
      [["100-0", ["data", JSON.stringify({ data: "first" })]]],
      [["101-0", ["data", JSON.stringify({ data: "second" })]]],
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init: { body: string }) => {
        const command = JSON.parse(init.body) as unknown[];
        calls.push(command);
        if (command[0] === "XREVRANGE") {
          return jsonResponse([["99-0", ["data", "old"]]]);
        }
        const next = reads.shift();
        if (next) {
          return jsonResponse([["test:ps:chat", next]]);
        }
        return jsonResponse(null);
      }),
    );
    const pubsub = createRedisStreamsPubSub(testConfig(), { prefix: "test:ps", pollIntervalMs: 10 });
    const received = await collect(pubsub.subscribe<string>("chat"), 2);
    expect(received).toEqual(["first", "second"]);
    const readCommands = calls.filter((command) => command[0] === "XREAD");
    expect(readCommands.length).toBeGreaterThan(0);
    for (const command of readCommands) {
      expect(command[command.length - 1]).not.toBe("0-0");
    }
  });

  it("deduplicates stream entries already delivered from the local outbox", async () => {
    let capturedMid = "";
    const bodies: unknown[][] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown, init: { body: string }) => {
        const raw = String(url);
        const command = JSON.parse(init.body) as unknown[];
        bodies.push(command);
        if (raw.endsWith("/pipeline")) {
          const pipeline = command as unknown[][];
          const midIndex = (pipeline[0] as unknown[]).indexOf("mid");
          capturedMid = String((pipeline[0] as unknown[])[midIndex + 1]);
          return jsonResponse("ok");
        }
        if (command[0] === "XREVRANGE") {
          return jsonResponse([]);
        }
        return jsonResponse([
          ["test:ps:chat", [["200-0", ["data", JSON.stringify({ data: "dup" }), "mid", capturedMid]]]],
        ]);
      }),
    );
    const pubsub = createRedisStreamsPubSub(testConfig(), { prefix: "test:ps", pollIntervalMs: 10 });
    pubsub.publish("chat", "dup");
    const received = await collect(pubsub.subscribe<string>("chat"), 2, 400);
    expect(received).toEqual(["dup"]);
    expect(bodies.some((command) => command[0] === "XREAD")).toBe(true);
  });

  it("falls back to zero cursor when the latest id lookup fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init: { body: string }) => {
        const command = JSON.parse(init.body) as unknown[];
        if (command[0] === "XREVRANGE") {
          throw new Error("boom");
        }
        return jsonResponse([["s", [["7-0", ["data", JSON.stringify({ data: "recovered" })]]]]]);
      }),
    );
    const pubsub = createRedisStreamsPubSub(testConfig(), { pollIntervalMs: 10 });
    const received = await collect(pubsub.subscribe<string>("chat"), 1);
    expect(received).toEqual(["recovered"]);
  });

  it("ignores unserializable payloads without throwing", async () => {
    const calls: unknown[][] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init: { body: string }) => {
        calls.push(JSON.parse(init.body) as unknown[]);
        return jsonResponse("ok");
      }),
    );
    const pubsub = createRedisStreamsPubSub(testConfig(), { pollIntervalMs: 10 });
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => pubsub.publish("chat", circular)).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(calls).toHaveLength(0);
  });

  it("survives publish and poll failures", async () => {
    let polls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown, init: { body: string }) => {
        if (String(url).endsWith("/pipeline")) {
          throw new Error("publish failed");
        }
        const command = JSON.parse(init.body) as unknown[];
        if (command[0] === "XREVRANGE") {
          return jsonResponse([]);
        }
        polls += 1;
        if (polls === 1) {
          throw new Error("poll failed");
        }
        return jsonResponse([["s", [["9-0", ["data", JSON.stringify({ data: "late" })]]]]]);
      }),
    );
    const pubsub = createRedisStreamsPubSub(testConfig(), { pollIntervalMs: 10 });
    expect(() => pubsub.publish("chat", "late")).not.toThrow();
    const sub = pubsub.subscribe<string>("chat") as AsyncIterable<string> & {
      close(): void | Promise<void>;
    };
    const iterator = sub[Symbol.asyncIterator]();
    const first = await iterator.next();
    expect(first.value).toBe("late");
    sub.close();
    await iterator.return?.(undefined);
  });

  it("yields undefined for entries without data and closes promptly", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init: { body: string }) => {
        const command = JSON.parse(init.body) as unknown[];
        if (command[0] === "XREVRANGE") {
          return jsonResponse([]);
        }
        return jsonResponse([["s", [["3-0", ["mid", "m1"]]]]]);
      }),
    );
    const pubsub = createRedisStreamsPubSub(testConfig(), { pollIntervalMs: 10 });
    const sub = pubsub.subscribe<unknown>("chat") as AsyncIterable<unknown> & {
      close(): void | Promise<void>;
    };
    const iterator = sub[Symbol.asyncIterator]();
    const first = await iterator.next();
    expect(first.done).toBe(false);
    expect(first.value).toBeUndefined();
    const started = Date.now();
    sub.close();
    await iterator.return?.(undefined);
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it("delivers raw strings when the payload is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init: { body: string }) => {
        const command = JSON.parse(init.body) as unknown[];
        if (command[0] === "XREVRANGE") {
          return jsonResponse([]);
        }
        return jsonResponse([["s", [["5-0", ["data", "plain-text"]]]]]);
      }),
    );
    const pubsub = createRedisStreamsPubSub(testConfig(), { pollIntervalMs: 10 });
    const received = await collect(pubsub.subscribe<string>("chat"), 1);
    expect(received).toEqual(["plain-text"]);
  });
});
