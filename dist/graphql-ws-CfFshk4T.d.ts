import { GraphQLSchema } from "graphql";
//#region src/service/graphql-ws.d.ts
/**
 * Minimal peer surface any WebSocket transport can adapt to (CrossWS, Bun.serve,
 * node:ws, ...). The protocol machine never imports a framework.
 */
interface GraphqlWsPeer {
  id: string;
  send(text: string): void;
  context?: unknown;
}
interface CreateGraphqlWsOptions {
  schema: GraphQLSchema;
  /** Builds the graphql-js contextValue for one operation. May be async. */
  getContext: (peer: GraphqlWsPeer) => unknown | Promise<unknown>;
}
interface GraphqlWsHandler {
  open(peerId: string): void;
  message(peer: GraphqlWsPeer, data: string): Promise<void>;
  close(peerId: string): Promise<void>;
}
/**
 * graphql-ws protocol machine (connection_init/ack, ping/pong, subscribe with
 * query/mutation/subscription, complete). State lives on the instance, so each
 * handler owns its peer/operation registry and is independently testable with
 * fake peers — no transport involved.
 */
declare function createGraphqlWs({ schema, getContext }: CreateGraphqlWsOptions): GraphqlWsHandler;
//#endregion
export { createGraphqlWs as i, GraphqlWsHandler as n, GraphqlWsPeer as r, CreateGraphqlWsOptions as t };
//# sourceMappingURL=graphql-ws-CfFshk4T.d.ts.map