import {
  type DocumentNode,
  type ExecutionResult,
  execute,
  type GraphQLSchema,
  getOperationAST,
  parse,
  subscribe,
  validate,
} from "graphql";

/**
 * Minimal peer surface any WebSocket transport can adapt to (CrossWS, Bun.serve,
 * node:ws, ...). The protocol machine never imports a framework.
 */
export interface GraphqlWsPeer {
  id: string;
  send(text: string): void;
  context?: unknown;
}

export interface CreateGraphqlWsOptions {
  schema: GraphQLSchema;
  /** Builds the graphql-js contextValue for one operation. May be async. */
  getContext: (peer: GraphqlWsPeer) => unknown | Promise<unknown>;
}

export interface GraphqlWsHandler {
  open(peerId: string): void;
  message(peer: GraphqlWsPeer, data: string): Promise<void>;
  close(peerId: string): Promise<void>;
}

interface OpState {
  iterator: AsyncIterator<unknown>;
  done: boolean;
}

interface IncomingMessage {
  type?: string;
  id?: string;
  payload?: { query?: unknown; variables?: unknown; operationName?: unknown };
}

function errPayload(err: unknown): Array<{ message: string }> {
  return [{ message: err instanceof Error ? err.message : "Subscription failed" }];
}

/**
 * graphql-ws protocol machine (connection_init/ack, ping/pong, subscribe with
 * query/mutation/subscription, complete). State lives on the instance, so each
 * handler owns its peer/operation registry and is independently testable with
 * fake peers — no transport involved.
 */
export function createGraphqlWs({ schema, getContext }: CreateGraphqlWsOptions): GraphqlWsHandler {
  const ops = new Map<string, Map<string, OpState>>();

  function peerOps(peerId: string): Map<string, OpState> {
    let m = ops.get(peerId);
    if (!m) {
      m = new Map();
      ops.set(peerId, m);
    }
    return m;
  }

  async function stopOp(peerId: string, id: string): Promise<void> {
    const op = ops.get(peerId)?.get(id);
    if (!op) return;
    ops.get(peerId)?.delete(id);
    stopOpState(op);
  }

  async function stopAll(peerId: string): Promise<void> {
    const m = ops.get(peerId);
    if (!m) return;
    ops.delete(peerId);
    for (const op of m.values()) stopOpState(op);
  }

  // Fire-and-forget on purpose: awaiting iterator.return() can deadlock when
  // the source is suspended on a pending next() (return queues behind it).
  // The op is already marked done + deregistered, so the pump loop breaks as
  // soon as the source settles and no more values are sent.
  function stopOpState(op: OpState): void {
    if (op.done) return;
    op.done = true;
    try {
      const result = op.iterator.return?.();
      if (result && typeof (result as Promise<unknown>).catch === "function") {
        (result as Promise<unknown>).catch(() => {});
      }
    } catch {
      // iterator already finished
    }
  }

  return {
    open(peerId: string): void {
      peerOps(peerId);
    },

    async message(peer: GraphqlWsPeer, data: string): Promise<void> {
      let msg: IncomingMessage;
      try {
        msg = JSON.parse(data) as IncomingMessage;
      } catch {
        return;
      }

      if (msg.type === "connection_init") {
        peer.send(JSON.stringify({ type: "connection_ack" }));
        return;
      }
      if (msg.type === "ping") {
        peer.send(JSON.stringify({ type: "pong" }));
        return;
      }
      if (msg.type === "complete") {
        if (msg.id) await stopOp(peer.id, msg.id);
        return;
      }
      if (msg.type !== "subscribe" || !msg.id || typeof msg.payload?.query !== "string") return;

      const id = msg.id;
      const send = (type: string, payload?: unknown): void => {
        peer.send(JSON.stringify(payload === undefined ? { type, id } : { type, id, payload }));
      };

      const contextValue = await getContext(peer);

      let document: DocumentNode;
      try {
        document = parse(msg.payload.query);
      } catch (err) {
        send("error", errPayload(err));
        return;
      }
      const validationErrors = validate(schema, document);
      if (validationErrors.length > 0) {
        send(
          "error",
          validationErrors.map((e) => ({ message: e.message })),
        );
        return;
      }
      const operation = getOperationAST(document, msg.payload.operationName as string | undefined);
      const variableValues = (msg.payload.variables ?? undefined) as Record<string, unknown> | undefined;

      try {
        if (operation?.operation === "subscription") {
          const result = await subscribe({ schema, document, variableValues, contextValue });
          if (typeof (result as AsyncIterable<unknown>)[Symbol.asyncIterator] !== "function") {
            send(
              "error",
              (result as ExecutionResult).errors?.map((e) => ({ message: e.message })) ??
                errPayload("subscribe failed"),
            );
            send("complete");
            return;
          }
          const iterator = (result as AsyncIterable<ExecutionResult>)[Symbol.asyncIterator]();
          peerOps(peer.id).set(id, { iterator: iterator as AsyncIterator<unknown>, done: false });
          try {
            while (true) {
              const { value, done } = await iterator.next();
              const state = peerOps(peer.id).get(id);
              if (!state || state.done) break;
              if (done) break;
              send("next", value);
            }
          } catch (err) {
            send("error", errPayload(err));
          } finally {
            peerOps(peer.id).delete(id);
            send("complete");
          }
          return;
        }

        const result = await execute({ schema, document, variableValues, contextValue });
        if (typeof (result as AsyncIterable<unknown>)[Symbol.asyncIterator] === "function") {
          send("error", errPayload("@stream/@defer is not supported over WS"));
        } else {
          send("next", result);
        }
        send("complete");
      } catch (err) {
        send("error", errPayload(err));
        send("complete");
      }
    },

    async close(peerId: string): Promise<void> {
      await stopAll(peerId);
    },
  };
}
