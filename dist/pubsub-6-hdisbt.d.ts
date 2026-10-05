//#region src/ports/env.d.ts
interface EnvPort {
  get(key: string): string | undefined;
  getRequired(key: string): string;
  all(): Record<string, string | undefined>;
}
//#endregion
//#region src/ports/realtime.d.ts
interface RealtimeConnection {
  readonly id: string;
  readonly meta?: unknown;
  send(message: string): void;
  close(code?: number, reason?: string): void;
}
interface RealtimeEvents {
  onConnect(connection: RealtimeConnection): void | Promise<void>;
  onMessage(connection: RealtimeConnection, message: string): void | Promise<void>;
  onDisconnect(connection: RealtimeConnection, code?: number, reason?: string): void | Promise<void>;
}
interface RealtimePort {
  broadcast(message: string): Promise<void>;
  sendTo(connectionId: string, message: string): Promise<boolean>;
  connectionCount(): Promise<number>;
  closeAll(code?: number, reason?: string): Promise<void>;
}
//#endregion
//#region src/ports/cache.d.ts
interface CachePort {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: {
    ttl?: number;
  }): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
}
//#endregion
//#region src/ports/queue.d.ts
interface QueueJob {
  jobId: string;
  jobType: string;
  streamId: string;
  /** Optional opaque payload (JSON recommended). Transport limits may apply. */
  data?: string;
}
interface QueuePort {
  enqueueJob(jobId: string, jobType: string, data?: string): Promise<boolean>;
  processNextJob(): Promise<QueueJob | null>;
  ackJob(streamId: string): Promise<void>;
  startWorker(onJob: (job: QueueJob) => Promise<void>): Promise<void>;
  stopWorker(): Promise<void>;
  isWorkerRunning(): boolean;
}
//#endregion
//#region src/ports/object-storage.d.ts
interface ObjectPutOptions {
  contentType: string;
  metadata?: Record<string, string>;
}
interface ObjectPort {
  put(key: string, body: Uint8Array | ReadableStream, options: ObjectPutOptions): Promise<string>;
  delete(key: string): Promise<void>;
  read(key: string): Promise<Uint8Array>;
  getSignedUrl(key: string, expiresIn?: number): Promise<string>;
  getPublicUrl(key: string): string;
  generateKey(prefix: string): string;
}
//#endregion
//#region src/ports/clock.d.ts
interface ClockPort {
  now(): Date;
  nowMs(): number;
}
//#endregion
//#region src/ports/ids.d.ts
interface IdsPort {
  createId(): string;
}
//#endregion
//#region src/ports/logger.d.ts
type LogLevel = "debug" | "info" | "warn" | "error";
interface LoggerPort {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, errorOrData?: Error | Record<string, unknown> | unknown, extraData?: Record<string, unknown>): void;
  child(contextName: string): LoggerPort;
}
//#endregion
//#region src/ports/pubsub.d.ts
interface PubSubPort {
  publish<T = unknown>(channel: string, data: T): void;
  subscribe<T = unknown>(channel: string): AsyncIterable<T>;
}
//#endregion
export { ClockPort as a, QueueJob as c, RealtimeConnection as d, RealtimeEvents as f, IdsPort as i, QueuePort as l, EnvPort as m, LogLevel as n, ObjectPort as o, RealtimePort as p, LoggerPort as r, ObjectPutOptions as s, PubSubPort as t, CachePort as u };
//# sourceMappingURL=pubsub-6-hdisbt.d.ts.map