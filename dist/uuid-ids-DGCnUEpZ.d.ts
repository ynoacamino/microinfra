import { a as ClockPort, f as RealtimeEvents, i as IdsPort, l as QueuePort, m as EnvPort, o as ObjectPort, p as RealtimePort, r as LoggerPort, t as PubSubPort, u as CachePort } from "./pubsub-6-hdisbt.js";
//#region src/adapters/memory/loggers.d.ts
declare function createNoopLogger(): LoggerPort;
declare function createConsoleLogger(context?: string): LoggerPort;
//#endregion
//#region src/adapters/memory/map-env.d.ts
declare function createMapEnv(seed?: Record<string, string>): EnvPort;
//#endregion
//#region src/adapters/memory/memory-cache.d.ts
declare function createMemoryCache(): CachePort;
//#endregion
//#region src/adapters/memory/memory-objects.d.ts
declare function createMemoryObjects(): ObjectPort & {
  size(): number;
};
//#endregion
//#region src/adapters/memory/memory-pubsub.d.ts
declare function createMemoryPubSub(): PubSubPort;
//#endregion
//#region src/adapters/memory/memory-queue.d.ts
declare function createMemoryQueue(): QueuePort;
//#endregion
//#region src/adapters/memory/memory-realtime.d.ts
interface MemoryRealtimeClient {
  readonly id: string;
  readonly received: string[];
  readonly closed: boolean;
  sendToServer(message: string): Promise<void>;
  closeFromClient(code?: number, reason?: string): Promise<void>;
}
interface MemoryRealtime extends RealtimePort {
  connectClient(id?: string): Promise<MemoryRealtimeClient>;
}
declare function createMemoryRealtime(events?: RealtimeEvents): MemoryRealtime;
//#endregion
//#region src/adapters/memory/noop-cache.d.ts
declare function createNoopCache(): CachePort;
//#endregion
//#region src/adapters/memory/system-clock.d.ts
declare function createSystemClock(): ClockPort;
//#endregion
//#region src/adapters/memory/uuid-ids.d.ts
declare function createUuidIds(): IdsPort;
//#endregion
export { MemoryRealtimeClient as a, createMemoryPubSub as c, createMapEnv as d, createConsoleLogger as f, MemoryRealtime as i, createMemoryObjects as l, createSystemClock as n, createMemoryRealtime as o, createNoopLogger as p, createNoopCache as r, createMemoryQueue as s, createUuidIds as t, createMemoryCache as u };
//# sourceMappingURL=uuid-ids-DGCnUEpZ.d.ts.map