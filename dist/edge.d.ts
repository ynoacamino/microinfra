import { f as RealtimeEvents, l as QueuePort, o as ObjectPort, p as RealtimePort, s as ObjectPutOptions, t as PubSubPort, u as CachePort } from "./pubsub-6-hdisbt.js";
import { a as cfVars, i as cfEnv, n as CfEnvMap, r as CloudflareEnv, t as CfBindings } from "./cf-env-KpSLbRKQ.js";
import { i as DatabasePort, r as EnvConfig, t as RuntimeEnv } from "./types-CD7cOcEI.js";
import { a as EdgeQueueBinding, c as createQueueConsumer, i as EdgeQueueBatch, l as createQueuesQueue, o as EdgeQueueMessage, r as EdgeJobHandler, s as QueueJobMessage, t as JobHandler, u as isQueueBindingConfigured } from "./worker-gAtgeNKB.js";
import { a as defineRealtimeDO, i as defineDoExports, n as RealtimeDoEnv, r as RealtimeDoState, t as DefineRealtimeDoOptions } from "./realtime-do-DzH-XYSp.js";
import { AnyD1Database, AnyD1Database as AnyD1Database$1, DrizzleD1Database, DrizzleD1Database as DrizzleD1Database$1 } from "drizzle-orm/d1";
import { LibSQLDatabase } from "drizzle-orm/libsql";
import { AnyRelations, AnyRelations as AnyRelations$1, EmptyRelations, EmptyRelations as EmptyRelations$1 } from "drizzle-orm";
//#region src/adapters/edge/d1-db.d.ts
export declare function isD1Configured(bindings?: CfBindings): boolean;
export declare function createD1Port<TRaw = unknown, TOrm = unknown>(client: TRaw, close?: () => Promise<void>, orm?: TOrm): DatabasePort<TRaw, TOrm>;
//#endregion
//#region src/adapters/edge/drizzle.d.ts
/** Drizzle over a D1 database binding. Shares the SQLite dialect (and relations) with libsql. */
export declare function createD1DrizzleDb<TRelations extends AnyRelations = EmptyRelations>(binding: AnyD1Database, relations?: TRelations): DrizzleD1Database<TRelations>;
/** Union of every drizzle client microinfra can build. Apps type their db port with this. */
type AnyDrizzleDb<TRelations extends AnyRelations = EmptyRelations> = LibSQLDatabase<TRelations> | DrizzleD1Database<TRelations>;
//#endregion
//#region src/adapters/edge/durable-realtime.d.ts
interface DurableSocketLike {
  send(message: string): void;
  close(code?: number, reason?: string): void;
  serializeAttachment?(data: unknown): void;
  deserializeAttachment?(): unknown;
}
interface DurableStateLike {
  acceptWebSocket(socket: DurableSocketLike, tags?: string[]): void;
  getWebSockets(tag?: string): DurableSocketLike[];
}
interface DurableSocketPair {
  client: unknown;
  server: DurableSocketLike;
}
interface DurableUpgradeSockets {
  createPair?: () => DurableSocketPair;
  respond?: (client: unknown) => Response;
}
interface DurableRealtime extends RealtimePort {
  handleUpgrade(request: Request, meta?: unknown, sockets?: DurableUpgradeSockets): Response;
  handleMessage(ws: DurableSocketLike, message: string | ArrayBuffer): Promise<void>;
  handleClose(ws: DurableSocketLike, code: number, reason: string): Promise<void>;
}
export declare function createDurableRealtime(state: DurableStateLike, events?: RealtimeEvents): DurableRealtime;
//#endregion
//#region src/adapters/edge/kv-cache.d.ts
interface KvBinding {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: {
    expirationTtl?: number;
  }): Promise<void>;
  delete(key: string): Promise<void>;
  list(opts?: {
    prefix?: string;
  }): Promise<{
    keys: Array<{
      name: string;
    }>;
  }>;
}
export declare function isKvConfigured(bindings?: CfBindings): boolean;
export declare function createKvCache(binding: KvBinding): CachePort;
//#endregion
//#region src/adapters/edge/r2-objects.d.ts
export declare function isR2Configured(bindings?: CfBindings): boolean;
export declare function createR2Port(deps: {
  port: ObjectPort;
}): ObjectPort;
interface R2GetResult {
  arrayBuffer(): Promise<ArrayBuffer>;
}
interface R2Binding {
  put(key: string, body: Uint8Array | ReadableStream, options?: Record<string, unknown>): Promise<unknown>;
  get(key: string): Promise<R2GetResult | null>;
  delete(key: string): Promise<void>;
}
interface R2PortOptions {
  ids?: () => string;
  publicUrl?: string;
}
export declare class R2Objects implements ObjectPort {
  private readonly bucket;
  private readonly ids;
  private readonly publicUrl;
  constructor(bucket: R2Binding, opts?: R2PortOptions);
  put(key: string, body: Uint8Array | ReadableStream, options: ObjectPutOptions): Promise<string>;
  delete(key: string): Promise<void>;
  read(key: string): Promise<Uint8Array>;
  getSignedUrl(key: string): Promise<string>;
  getPublicUrl(key: string): string;
  generateKey(prefix: string): string;
}
export declare function createR2PortFromBinding(bucket: R2Binding, opts?: R2PortOptions): ObjectPort;
//#endregion
//#region src/runtime/app-runtime-edge.d.ts
interface AppRuntimeEdgeOptions<TRelations extends AnyRelations$1 = EmptyRelations$1> {
  /**
   * Relations built with drizzle-orm `defineRelations` (tables included).
   * Optional — defaults to no relations.
   */
  relations?: TRelations;
  /** Explicit D1 binding. Default: bindings.DB. */
  dbBinding?: AnyD1Database$1;
  /** Fallback env vars (local dev). Default: none. */
  vars?: Record<string, string | undefined>;
  /** Prebuilt config (tests). Default: parsed from bindings + vars. */
  config?: EnvConfig;
}
/**
 * One-line edge runtime: resolves the D1 binding (KV/R2/Queues auto-resolved
 * from bindings by createEdgeInfra), builds Drizzle with the app relations.
 */
export declare function createAppRuntimeEdge<TRelations extends AnyRelations$1 = EmptyRelations$1>(bindings: CfBindings | undefined, opts?: AppRuntimeEdgeOptions<TRelations>): RuntimeEnv<AnyD1Database$1, DrizzleD1Database$1<TRelations>>;
//#endregion
//#region src/runtime/cf-hooks.d.ts
/**
 * Framework-agnostic Cloudflare entrypoint helpers. They operate on plain data
 * shapes and `globalThis` — no Nitro/Hono/Bun import — so any runtime wires
 * them to its own hooks with a few lines.
 */
/** Queue message as delivered by the CF runtime (readonly in the real type). */
interface CfQueueMessageShape<T = unknown> {
  body: T;
  ack(): void;
  retry(): void;
}
/** Queue batch as delivered by the CF runtime. */
interface CfQueueBatchShape<T = unknown> {
  queue: string;
  messages: CfQueueMessageShape<T>[];
}
interface BatchRunnerOptions<TRuntime extends RuntimeEnv> {
  createRuntime: (bindings: Record<string, unknown>) => TRuntime;
  createHandlers: (runtime: TRuntime) => Record<string, JobHandler>;
}
/**
 * Saves Durable Object `env` for code running inside the DO (WS handlers,
 * internal stub.fetch), where the worker entrypoints that populate
 * `globalThis.__env__` never run. Wire it to your runtime's DO-init hook.
 */
export declare function stashDoEnv(payload: unknown): void;
/**
 * CF Queues consumer: builds the edge runtime from worker bindings and runs
 * the universal worker batch. Wire the returned function to your runtime's
 * queue hook (e.g. Nitro `cloudflare:queue`). Throws when bindings are absent,
 * same as a misconfigured worker.
 */
export declare function createBatchRunner<TRuntime extends RuntimeEnv>({ createRuntime, createHandlers }: BatchRunnerOptions<TRuntime>): (payload: {
  batch: CfQueueBatchShape<QueueJobMessage>;
}) => Promise<void>;
//#endregion
//#region src/runtime/edge.d.ts
interface EdgeInfraOptions<TRaw = unknown, TOrm = unknown> {
  bindings?: CfBindings;
  vars?: Record<string, string | undefined>;
  dbClient: TRaw;
  dbClose?: () => Promise<void>;
  dbOrm?: TOrm;
  kvBinding?: KvBinding;
  objectPort?: ObjectPort;
  r2Binding?: R2Binding;
  queuePort?: QueuePort;
  queueBinding?: EdgeQueueBinding;
  realtimePort?: RealtimePort;
  pubsubPort?: PubSubPort;
  config?: EnvConfig;
}
export declare function createEdgeInfra<TRaw = unknown, TOrm = unknown>(opts: EdgeInfraOptions<TRaw, TOrm>): RuntimeEnv<TRaw, TOrm>;
//#endregion
export { type AnyD1Database, type AnyDrizzleDb, type AnyRelations, type AppRuntimeEdgeOptions, type BatchRunnerOptions, type CfBindings, type CfEnvMap, type CfQueueBatchShape, type CfQueueMessageShape, CloudflareEnv, type DefineRealtimeDoOptions, type DrizzleD1Database, type DurableRealtime, type DurableSocketLike, type DurableSocketPair, type DurableStateLike, type DurableUpgradeSockets, type EdgeInfraOptions, type EdgeJobHandler, type EdgeQueueBatch, type EdgeQueueBinding, type EdgeQueueMessage, type EmptyRelations, type KvBinding, type QueueJobMessage, type R2Binding, type R2GetResult, type R2PortOptions, type RealtimeDoEnv, type RealtimeDoState, cfEnv, cfVars, createQueueConsumer, createQueuesQueue, defineDoExports, defineRealtimeDO, isQueueBindingConfigured };
//# sourceMappingURL=edge.d.ts.map