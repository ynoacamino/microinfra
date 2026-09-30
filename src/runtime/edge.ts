import { type CfBindings, CloudflareEnv } from "../adapters/edge/cf-env";
import { createD1Port } from "../adapters/edge/d1-db";
import { createKvCache, isKvConfigured, type KvBinding } from "../adapters/edge/kv-cache";
import { createR2Port } from "../adapters/edge/r2-objects";
import { createNoopLogger } from "../adapters/memory/loggers";
import { createMemoryCache } from "../adapters/memory/memory-cache";
import { createMemoryPubSub } from "../adapters/memory/memory-pubsub";
import { createMemoryRealtime } from "../adapters/memory/memory-realtime";
import { createSystemClock } from "../adapters/memory/system-clock";
import { createUuidIds } from "../adapters/memory/uuid-ids";
import { createInfra } from "../core/registry";
import type { RuntimeEnv } from "../core/types";
import type { ObjectPort } from "../ports/object-storage";
import { createEnvConfig } from "../schema/env-schema";

export interface EdgeInfraOptions<TDb = unknown> {
  bindings?: CfBindings;
  dbClient: TDb;
  kvBinding?: KvBinding;
  objectPort: ObjectPort;
}

export function createEdgeInfra<TDb = unknown>(opts: EdgeInfraOptions<TDb>): RuntimeEnv<TDb> {
  const env = new CloudflareEnv(opts.bindings);
  const config = createEnvConfig(env);
  const cache = isKvConfigured(opts.bindings) && opts.kvBinding ? createKvCache(opts.kvBinding) : createMemoryCache();
  const db = createD1Port(opts.dbClient);
  const objects = createR2Port({ port: opts.objectPort });
  return createInfra({
    mode: "edge",
    env,
    config,
    logger: createNoopLogger(),
    clock: createSystemClock(),
    ids: createUuidIds(),
    db,
    cache,
    objects,
    pubsub: createMemoryPubSub(),
    realtime: createMemoryRealtime(),
  });
}
