import { n as GraphqlWsHandler } from "./graphql-ws-CfFshk4T.js";
//#region src/runtime/realtime-do.d.ts
interface RealtimeDoEnv {
  [key: string]: unknown;
}
interface RealtimeDoState {
  acceptWebSocket(ws: WebSocket): void;
}
interface DefineRealtimeDoOptions {
  createHandler: () => GraphqlWsHandler;
  onUpgrade?: (request: Request, env: RealtimeDoEnv) => void | Promise<void>;
}
/**
 * Base class factory for the GraphQL realtime Durable Object. Encapsulates:
 * stashDoEnv, WebSocketPair + hibernation, graphql-transport-ws negotiation in
 * the 101, accept→serializeAttachment ordering, and peerId routing.
 * Subscriptions still don't survive DO eviction (documented) — re-subscribe
 * from the client; attachment only carries peerId (auth via upgrade hook).
 */
declare function defineRealtimeDO(opts: DefineRealtimeDoOptions): {
  new (state: RealtimeDoState, env: RealtimeDoEnv): {
    gql: GraphqlWsHandler | undefined;
    readonly state: RealtimeDoState;
    readonly env: RealtimeDoEnv;
    handler(): GraphqlWsHandler;
    fetch(request: Request): Promise<Response>;
    webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void>;
    webSocketClose(ws: WebSocket): Promise<void>;
    webSocketError(ws: WebSocket): Promise<void>;
  };
};
/** Helper for `exports.cloudflare.ts`: re-export DO classes for the CF entrypoint. */
declare function defineDoExports(classes: Record<string, unknown>): Record<string, unknown>;
//#endregion
export { defineRealtimeDO as a, defineDoExports as i, RealtimeDoEnv as n, RealtimeDoState as r, DefineRealtimeDoOptions as t };
//# sourceMappingURL=realtime-do-DzH-XYSp.d.ts.map