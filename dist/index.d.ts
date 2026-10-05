import { a as ClockPort, c as QueueJob, d as RealtimeConnection, f as RealtimeEvents, i as IdsPort, l as QueuePort, m as EnvPort, n as LogLevel, o as ObjectPort, p as RealtimePort, r as LoggerPort, s as ObjectPutOptions, t as PubSubPort, u as CachePort } from "./pubsub-6-hdisbt.js";
import { i as DatabasePort, n as RuntimeMode, r as EnvConfig, t as RuntimeEnv } from "./types-CD7cOcEI.js";
import { i as EdgeQueueBatch, n as runWorker, s as QueueJobMessage, t as JobHandler } from "./worker-gAtgeNKB.js";
import { i as createGraphqlWs, n as GraphqlWsHandler, r as GraphqlWsPeer, t as CreateGraphqlWsOptions } from "./graphql-ws-CfFshk4T.js";
import { a as ormOf, i as EmptyRelations, n as AppDrizzleDb, o as requireOrm, r as AppRuntime, t as AnyRelations } from "./types-Jztq4f-9.js";
import { a as MemoryRealtimeClient, c as createMemoryPubSub, d as createMapEnv, f as createConsoleLogger, i as MemoryRealtime, l as createMemoryObjects, n as createSystemClock, o as createMemoryRealtime, p as createNoopLogger, r as createNoopCache, s as createMemoryQueue, t as createUuidIds, u as createMemoryCache } from "./uuid-ids-DGCnUEpZ.js";
//#region src/core/cache-json.d.ts
type CacheKeyPart = string | number;
interface CacheJson {
  key(...parts: CacheKeyPart[]): string;
  get<T>(...parts: CacheKeyPart[]): Promise<T | null>;
  put<T>(value: T, parts: CacheKeyPart[], opts?: {
    ttl?: number;
  }): Promise<void>;
  invalidate(...parts: CacheKeyPart[]): Promise<void>;
}
/**
 * JSON over CachePort under a namespace. Reads never throw (miss, corrupt
 * payload or backend error all resolve to null); writes propagate errors so
 * silent cache loss stays visible — callers add .catch() only for
 * fire-and-forget writes.
 */
export declare function cacheJson(cache: CachePort, namespace: string): CacheJson;
//#endregion
//#region src/core/define-adapter.d.ts
interface AdapterDefinition<Name extends string, TPort> {
  name: Name;
  port: TPort;
  isConfigured?: () => boolean;
}
export declare function defineAdapter<const Name extends string, TPort>(def: AdapterDefinition<Name, TPort>): AdapterDefinition<Name, TPort>;
//#endregion
//#region src/core/realtime-hub.d.ts
interface RealtimeSender {
  send(message: string): void;
  close(code?: number, reason?: string): void;
}
interface RealtimeConnectOptions {
  id?: string;
  meta?: unknown;
}
export declare function isWebSocketUpgradeRequest(request: {
  headers: {
    get(name: string): string | null;
  };
}): boolean;
export declare function decodeRealtimeMessage(data: unknown): string;
export declare class RealtimeHub implements RealtimePort {
  private readonly events;
  private readonly entries;
  private counter;
  constructor(events?: RealtimeEvents);
  connect(sender: RealtimeSender, options?: RealtimeConnectOptions): Promise<RealtimeConnection>;
  incoming(id: string, message: string): Promise<boolean>;
  disconnect(id: string, code?: number, reason?: string): Promise<boolean>;
  broadcast(message: string): Promise<void>;
  sendTo(connectionId: string, message: string): Promise<boolean>;
  connectionCount(): Promise<number>;
  closeAll(code?: number, reason?: string): Promise<void>;
  private drop;
}
//#endregion
//#region src/core/registry.d.ts
interface CreateInfraOptions<TRaw = unknown, TOrm = unknown> extends RuntimeEnv<TRaw, TOrm> {}
export declare function createInfra<TRaw = unknown, TOrm = unknown>(options: CreateInfraOptions<TRaw, TOrm>): RuntimeEnv<TRaw, TOrm>;
//#endregion
//#region src/http/response.d.ts
/**
 * Re-wraps a Response as a native global Response. Frameworks (Yoga, Hono)
 * may return cross-realm Response objects that break `instanceof` checks in
 * adapters like TanStack Start; re-wrapping fixes the prototype chain.
 * Note: buffers the body, so it is not suitable for SSE/streaming responses.
 */
export declare function toNativeResponse(res: Response): Promise<Response>;
//#endregion
//#region src/runtime/queue-helpers.d.ts
/**
 * Enqueue + await. En Workers el trabajo flotante sin `waitUntil` se congela
 * al responder (en Node seguía corriendo). Este helper fuerza el `await` y, si
 * el runtime expone `waitUntil` (CF), lo registra además para mayor seguridad.
 */
export declare function enqueueJobAndWait(rt: RuntimeEnv, jobId: string, jobType: string, data?: string): Promise<boolean>;
interface EnsureWorkerOptions {
  retries?: number;
  retryDelayMs?: number;
  logPrefix?: string;
}
/**
 * Starts the node worker with retries instead of failing silently when Redis
 * wasn't up before dev. Returns the stop function. Throws after `retries`.
 */
export declare function ensureWorkerStarted(rt: RuntimeEnv, start: (rt: RuntimeEnv) => Promise<() => Promise<void>>, opts?: EnsureWorkerOptions): Promise<() => Promise<void>>;
//#endregion
//#region src/runtime/singleton.d.ts
/**
 * Process-wide singleton keyed by name. Survives Vite/Nitro dev HMR and
 * serverless module re-evaluation because state lives on globalThis.
 */
export declare function once<T>(key: string, init: () => T): T;
//#endregion
//#region src/runtime/test.d.ts
interface TestInfraOptions {
  env?: Record<string, string>;
  mode?: RuntimeMode;
  silent?: boolean;
}
export declare function createTestInfra<TDb = {
  tag: "memory-test-db";
}>(opts?: TestInfraOptions): RuntimeEnv<TDb>;
//#endregion
//#region src/runtime/universal-worker.d.ts
type UniversalWorker = {
  kind: "local";
  stop: () => Promise<void>;
} | {
  kind: "edge";
  onBatch: (batch: EdgeQueueBatch<QueueJobMessage>) => Promise<void>;
};
/**
 * Starts background job processing on any runtime. On node/test it polls via
 * runWorker and returns a stop function; on edge (no polling allowed) it
 * returns an onBatch consumer for the worker queue() entrypoint.
 */
export declare function runUniversalWorker(rt: RuntimeEnv, handlers: Record<string, JobHandler>): Promise<UniversalWorker>;
//#endregion
//#region src/schema/env-schema.d.ts
export declare function createEnvConfig(env: EnvPort): EnvConfig;
//#endregion
//#region src/service/context.d.ts
interface ServiceUser {
  id: string;
  email?: string | null;
  name?: string | null;
}
interface ServiceContext<TDb = unknown> {
  db: TDb;
  runtime: RuntimeEnv;
  user: ServiceUser | null;
  request: Request;
}
/** Maps a better-auth style session to a ServiceUser (null when signed out). */
export declare function sessionUser(session: {
  user: {
    id: string;
    email?: string | null;
    name?: string | null;
  };
} | null): ServiceUser | null;
/** Builds the shared GraphQL/WS service context from a runtime. */
export declare function contextFromRuntime<TDb>(rt: RuntimeEnv, opts: {
  db: TDb;
  user: ServiceUser | null;
  request: Request;
}): ServiceContext<TDb>;
/** Placeholder request for transports without one (e.g. WebSocket upgrade). */
export declare function syntheticRequest(url?: string): Request;
//#endregion
export { type AdapterDefinition, type AnyRelations, type AppDrizzleDb, type AppRuntime, type CacheJson, type CacheKeyPart, type CachePort, type ClockPort, type CreateGraphqlWsOptions, type CreateInfraOptions, type DatabasePort, type EmptyRelations, type EnsureWorkerOptions, type EnvConfig, type EnvPort, type GraphqlWsHandler, type GraphqlWsPeer, type IdsPort, type JobHandler, type LogLevel, type LoggerPort, type MemoryRealtime, type MemoryRealtimeClient, type ObjectPort, type ObjectPutOptions, type PubSubPort, type QueueJob, type QueuePort, type RealtimeConnectOptions, type RealtimeConnection, type RealtimeEvents, type RealtimePort, type RealtimeSender, type RuntimeEnv, type RuntimeMode, type ServiceContext, type ServiceUser, type TestInfraOptions, type UniversalWorker, createConsoleLogger, createGraphqlWs, createMapEnv, createMemoryCache, createMemoryObjects, createMemoryPubSub, createMemoryQueue, createMemoryRealtime, createNoopCache, createNoopLogger, createSystemClock, createUuidIds, ormOf, requireOrm, runWorker };
//# sourceMappingURL=index.d.ts.map