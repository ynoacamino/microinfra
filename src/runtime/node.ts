import { createConsoleLogger } from "../adapters/memory/loggers";
import { createMemoryCache } from "../adapters/memory/memory-cache";
import { createMemoryObjects } from "../adapters/memory/memory-objects";
import { createMemoryPubSub } from "../adapters/memory/memory-pubsub";
import { createMemoryQueue } from "../adapters/memory/memory-queue";
import { createMemoryRealtime } from "../adapters/memory/memory-realtime";
import { createSystemClock } from "../adapters/memory/system-clock";
import { createUuidIds } from "../adapters/memory/uuid-ids";
import { createLibsqlPort } from "../adapters/node/libsql-db";
import { NodeEnv } from "../adapters/node/node-env";
import { createHttpRedisCache, isRedisConfigured } from "../adapters/node/redis-cache";
import { createRedisStreamsQueue, isStreamsConfigured } from "../adapters/node/redis-streams";
import { createInfra } from "../core/registry";
import type { RuntimeEnv } from "../core/types";
import type { EnvConfig } from "../ports/config";
import type { ObjectPort } from "../ports/object-storage";
import type { RealtimePort } from "../ports/realtime";
import { createEnvConfig } from "../schema/env-schema";

export interface NodeInfraOptions<TDb = unknown> {
  vars?: Record<string, string | undefined>;
  dbClient: TDb;
  dbClose?: () => Promise<void>;
  objectPort?: ObjectPort;
  realtimePort?: RealtimePort;
  config?: EnvConfig;
}

export function createNodeInfra<TDb = unknown>(opts: NodeInfraOptions<TDb>): RuntimeEnv<TDb> {
  const env = new NodeEnv(opts.vars);
  const config = opts.config ?? createEnvConfig(env);
  const cache = isRedisConfigured(config) ? createHttpRedisCache(config) : createMemoryCache();
  const db = createLibsqlPort(opts.dbClient, opts.dbClose);
  const objects = opts.objectPort ?? createMemoryObjects();
  return createInfra({
    mode: "node",
    env,
    config,
    logger: createConsoleLogger("node"),
    clock: createSystemClock(),
    ids: createUuidIds(),
    db,
    cache,
    objects,
    queue: isStreamsConfigured(config) ? createRedisStreamsQueue(config) : createMemoryQueue(),
    pubsub: createMemoryPubSub(),
    realtime: opts.realtimePort ?? createMemoryRealtime(),
  });
}
