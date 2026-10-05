import { t as RuntimeEnv } from "./types-CD7cOcEI.js";
import { n as GraphqlWsHandler } from "./graphql-ws-CfFshk4T.js";
//#region src/runtime/nitro-helpers.d.ts
type NitroWsRoute = `/${string}`;
interface NitroMicroinfraConfig {
  preset: "bun" | "cloudflare-module";
  features: {
    websocket: boolean;
  };
  handlers: Array<{
    route: NitroWsRoute;
    handler: string;
  }>;
  plugins: string[];
  alias?: Record<string, string>;
  isEdge: boolean;
}
/**
 * Single source of truth for the Nitro switch (bun <-> cloudflare-module).
 * Returns plain data — no nitro import — so the app's vite.config.ts is 3 lines.
 * Encapsulates: websocket:false on CF (else crossws intercepts the DO proxy),
 * ws-handler vs cf-ws-handler, worker vs cf-queue plugin, and the
 * @whatwg-node/fetch esm-ponyfill alias required in workerd.
 */
export declare function nitroMicroinfraConfig(opts?: {
  wsRoute?: NitroWsRoute;
  esmPonyfillPath?: string;
}): NitroMicroinfraConfig;
interface NitroWsPeer {
  id: string;
  send(text: string): void;
  context?: unknown;
}
interface NitroWsEvents {
  open(peer: NitroWsPeer): void;
  message(peer: NitroWsPeer, raw: string | {
    text(): string;
  }): Promise<void>;
  close(peer: NitroWsPeer): Promise<void>;
}
interface GraphqlWsHandlerLike {
  open(peerId: string): void;
  message(peer: {
    id: string;
    send(t: string): void;
    context?: unknown;
  }, text: string): Promise<void>;
  close(peerId: string): Promise<void>;
}
/**
 * Adapts the transport-agnostic graphql-ws machine to Nitro CrossWS events.
 * The app still calls defineWebSocketHandler (keeps `nitro` out of microinfra
 * deps) but the peer adaptation lives here, HMR-safe via once().
 */
export declare function createNitroWsEvents(getHandler: () => GraphqlWsHandlerLike, singletonKey?: string): NitroWsEvents;
/**
 * Framework-free CF WS proxy: Worker doesn't terminate the socket, it forwards
 * the upgrade to the RealtimeDO singleton. Usable inside defineEventHandler.
 */
export declare function cfWsProxyFetch(request: Request, opts?: {
  bindingName?: string;
  key?: string;
}): Promise<Response>;
interface NitroAppLike {
  hooks: {
    hook(name: string, fn: (payload: {
      batch: unknown;
    }) => Promise<void>): void;
  };
}
/**
 * Node worker plugin with retries (never fails silently when Redis wasn't up
 * before dev). Skips on edge — CF consumes via the queue hook instead.
 */
export declare function defineWorkerPlugin(getRuntime: () => RuntimeEnv, start: (rt: RuntimeEnv) => Promise<() => Promise<void>>, opts?: {
  retries?: number;
  retryDelayMs?: number;
}): () => Promise<void>;
/** CF queue consumer plugin (wires the Nitro `cloudflare:queue` hook). */
export declare function defineCfQueuePlugin(runQueueBatch: (payload: {
  batch: never;
}) => Promise<void>): (nitroApp: NitroAppLike) => void;
//#endregion
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
export declare function defineRealtimeDO(opts: DefineRealtimeDoOptions): {
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
//#endregion
export type { DefineRealtimeDoOptions, NitroMicroinfraConfig, NitroWsRoute, RealtimeDoEnv, RealtimeDoState };
//# sourceMappingURL=nitro.d.ts.map