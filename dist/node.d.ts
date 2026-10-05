import { c as QueueJob, f as RealtimeEvents, l as QueuePort, m as EnvPort, o as ObjectPort, p as RealtimePort, r as LoggerPort, t as PubSubPort, u as CachePort } from "./pubsub-6-hdisbt.js";
import { i as DatabasePort, r as EnvConfig, t as RuntimeEnv } from "./types-CD7cOcEI.js";
import { LibSQLDatabase, LibSQLDatabase as LibSQLDatabase$1 } from "drizzle-orm/libsql";
import { Client } from "@libsql/client";
import { AnyRelations, AnyRelations as AnyRelations$1, EmptyRelations, EmptyRelations as EmptyRelations$1 } from "drizzle-orm";
import { Client as Client$1 } from "@libsql/client/http";
//#region src/adapters/node/bun-realtime.d.ts
interface BunSocketLike<TData = unknown> {
  readonly data: TData;
  sendText(message: string): void;
  close(code?: number, reason?: string): void;
}
interface BunServerLike<TData = unknown> {
  upgrade(request: Request, options?: {
    data?: TData;
    headers?: Record<string, string>;
  }): boolean;
}
interface BunWsHandler<TData = unknown> {
  open(ws: BunSocketLike<TData>): void | Promise<void>;
  message(ws: BunSocketLike<TData>, message: string | ArrayBuffer | Uint8Array): void | Promise<void>;
  close(ws: BunSocketLike<TData>, code: number, reason: string): void | Promise<void>;
}
export declare function handleBunUpgrade<TData>(server: BunServerLike<TData>, request: Request, data: TData): Response | null;
export declare function createBunRealtimeHandler<TData = unknown>(events?: RealtimeEvents): {
  handler: BunWsHandler<TData>;
  port: RealtimePort;
};
//#endregion
//#region src/adapters/node/drizzle.d.ts
/** Drizzle over a local/embedded libsql client (`file:` URLs). */
export declare function createLibsqlDrizzleDb<TRelations extends AnyRelations = EmptyRelations>(client: Client, relations?: TRelations): LibSQLDatabase<TRelations>;
/** Drizzle over a remote libsql client (`http(s):`/`libsql:` URLs: libsql-server, Turso). */
export declare function createLibsqlHttpDrizzleDb<TRelations extends AnyRelations = EmptyRelations>(client: Client$1, relations?: TRelations): LibSQLDatabase<TRelations>;
//#endregion
//#region src/adapters/node/libsql-db.d.ts
export declare function isLibsqlConfigured(config: EnvConfig): boolean;
export declare function createLibsqlPort<TRaw = unknown, TOrm = unknown>(client: TRaw, close?: () => Promise<void>, orm?: TOrm): DatabasePort<TRaw, TOrm>;
//#endregion
//#region src/adapters/node/node-env.d.ts
export declare class NodeEnv implements EnvPort {
  private readonly vars;
  constructor(vars?: Record<string, string | undefined>);
  get(key: string): string | undefined;
  getRequired(key: string): string;
  all(): Record<string, string | undefined>;
  static isConfigured(): boolean;
}
//#endregion
//#region src/adapters/node/redis-cache.d.ts
export declare function isRedisConfigured(config: EnvConfig): boolean;
export declare function createHttpRedisCache(config: EnvConfig): CachePort;
//#endregion
//#region src/adapters/node/redis-pubsub.d.ts
interface RedisPubSubOptions {
  prefix?: string;
  pollIntervalMs?: number;
  batchSize?: number;
  maxLen?: number;
  logger?: LoggerPort;
}
/**
 * Fan-out PubSub over Redis Streams via HTTP (SRH/Upstash).
 * Each channel maps to a stream; subscribers poll with XREAD from a cursor
 * captured eagerly at subscribe() time, so only messages published after
 * subscribing are delivered (memory parity, at-least-once within the
 * subscribe handshake window, deduplicated by message id).
 */
export declare class RedisStreamsPubSub implements PubSubPort {
  private readonly baseUrl;
  private readonly token;
  private readonly prefix;
  private readonly pollIntervalMs;
  private readonly batchSize;
  private readonly maxLen;
  private readonly logger;
  private readonly outbox;
  constructor(config: EnvConfig, opts?: RedisPubSubOptions);
  private streamFor;
  private pruneOutbox;
  private drainOutbox;
  private latestId;
  private readSince;
  publish(channel: string, data: unknown): void;
  subscribe<T = unknown>(channel: string): AsyncIterable<T> & {
    close(): void | Promise<void>;
  };
}
export declare function createRedisStreamsPubSub(config: EnvConfig, opts?: RedisPubSubOptions): PubSubPort;
//#endregion
//#region src/adapters/node/redis-streams.d.ts
interface RedisStreamsOptions {
  stream?: string;
  group?: string;
  consumer?: string;
  pollIntervalMs?: number;
  staleMinIdleMs?: number;
  logger?: LoggerPort;
}
export declare function isStreamsConfigured(config: EnvConfig): boolean;
export declare class RedisStreamsQueue implements QueuePort {
  private readonly baseUrl;
  private readonly token;
  private readonly stream;
  private readonly group;
  private readonly consumer;
  private readonly pollIntervalMs;
  private readonly staleMinIdleMs;
  private readonly logger;
  private running;
  private pollTimer;
  private groupReady;
  constructor(config: EnvConfig, opts?: RedisStreamsOptions);
  private ensureGroup;
  enqueueJob(jobId: string, jobType: string, data?: string): Promise<boolean>;
  processNextJob(): Promise<QueueJob | null>;
  ackJob(streamId: string): Promise<void>;
  reclaimStaleEntries(minIdleMs?: number): Promise<QueueJob[]>;
  startWorker(onJob: (job: QueueJob) => Promise<void>): Promise<void>;
  stopWorker(): Promise<void>;
  isWorkerRunning(): boolean;
  private runJob;
}
export declare function createRedisStreamsQueue(config: EnvConfig, opts?: RedisStreamsOptions): QueuePort;
//#endregion
//#region src/adapters/node/s3-objects.d.ts
interface S3PortOptions {
  ids?: () => string;
}
export declare function isS3Configured(config: EnvConfig): boolean;
export declare function createS3Port(config: EnvConfig, opts?: S3PortOptions): ObjectPort;
//#endregion
//#region src/adapters/node/ws-realtime.d.ts
interface WsSocketLike {
  on(event: "message", listener: (data: unknown, isBinary: boolean) => void): unknown;
  on(event: "close", listener: (code: number, reason: unknown) => void): unknown;
  on(event: "error", listener: (error: unknown) => void): unknown;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}
interface WsServerLike {
  on(event: "connection", listener: (socket: WsSocketLike) => void): unknown;
}
export declare function attachWsRealtime(server: WsServerLike, events?: RealtimeEvents): RealtimePort;
//#endregion
//#region src/runtime/app-runtime.d.ts
interface AppRuntimeOptions<TRelations extends AnyRelations$1 = EmptyRelations$1> {
  /**
   * Relations built with drizzle-orm `defineRelations` (tables included).
   * Optional — defaults to no relations. microinfra picks the driver
   * (embedded vs http) by URL scheme, so callers never touch drizzle constructors.
   */
  relations?: TRelations;
  /** "auto" (default): S3 when S3 env is configured, memory otherwise. Pass a port to force one. */
  objects?: "auto" | ObjectPort;
  /** Reject file: DATABASE_URL with a clear error. Default true. */
  forbidFileDb?: boolean;
  /** Prebuilt config (tests). Default: parsed from vars. */
  config?: EnvConfig;
}
/**
 * One-line node runtime: parses env, opens the libsql client (branching by
 * URL scheme), builds Drizzle with the app relations, and wires cache/queue/
 * pubsub/objects with the standard fallbacks (memory unless Redis/S3 configured).
 */
export declare function createAppRuntime<TRelations extends AnyRelations$1 = EmptyRelations$1>(vars: Record<string, string | undefined> | undefined, opts?: AppRuntimeOptions<TRelations>): RuntimeEnv<Client, LibSQLDatabase$1<TRelations>>;
//#endregion
//#region src/runtime/node.d.ts
interface NodeInfraOptions<TRaw = unknown, TOrm = unknown> {
  vars?: Record<string, string | undefined>;
  dbClient: TRaw;
  dbClose?: () => Promise<void>;
  dbOrm?: TOrm;
  objectPort?: ObjectPort;
  realtimePort?: RealtimePort;
  config?: EnvConfig;
}
export declare function createNodeInfra<TRaw = unknown, TOrm = unknown>(opts: NodeInfraOptions<TRaw, TOrm>): RuntimeEnv<TRaw, TOrm>;
//#endregion
export type { AnyRelations, AppRuntimeOptions, BunServerLike, BunSocketLike, BunWsHandler, EmptyRelations, LibSQLDatabase, NodeInfraOptions, RedisPubSubOptions, RedisStreamsOptions, WsServerLike, WsSocketLike };
//# sourceMappingURL=node.d.ts.map