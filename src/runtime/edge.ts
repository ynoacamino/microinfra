import { type CfBindings, CloudflareEnv } from "../adapters/edge/cf-env";
import { createD1Port } from "../adapters/edge/d1-db";
import { createKvCache, type KvBinding } from "../adapters/edge/kv-cache";
import { createQueuesQueue, type EdgeQueueBinding } from "../adapters/edge/queues";
import { createR2PortFromBinding, type R2Binding } from "../adapters/edge/r2-objects";
import { createConsoleLogger } from "../adapters/memory/loggers";
import { createMemoryCache } from "../adapters/memory/memory-cache";
import { createMemoryObjects } from "../adapters/memory/memory-objects";
import { createMemoryPubSub } from "../adapters/memory/memory-pubsub";
import { createMemoryRealtime } from "../adapters/memory/memory-realtime";
import { createSystemClock } from "../adapters/memory/system-clock";
import { createUuidIds } from "../adapters/memory/uuid-ids";
import { createInfra } from "../core/registry";
import type { RuntimeEnv } from "../core/types";
import type { CachePort } from "../ports/cache";
import type { EnvConfig } from "../ports/config";
import type { ObjectPort } from "../ports/object-storage";
import type { PubSubPort } from "../ports/pubsub";
import type { QueuePort } from "../ports/queue";
import type { RealtimePort } from "../ports/realtime";
import { createEnvConfig } from "../schema/env-schema";

export interface EdgeInfraOptions<TRaw = unknown, TOrm = unknown> {
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

function isKvBindingLike(value: unknown): value is KvBinding {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const binding = value as Record<string, unknown>;
  return typeof binding.get === "function" && typeof binding.put === "function" && typeof binding.delete === "function";
}

function isR2BindingLike(value: unknown): value is R2Binding {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const binding = value as Record<string, unknown>;
  return typeof binding.put === "function" && typeof binding.get === "function" && typeof binding.delete === "function";
}

function isQueueBindingLike(value: unknown): value is EdgeQueueBinding {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return typeof (value as Record<string, unknown>).send === "function";
}

export function createEdgeInfra<TRaw = unknown, TOrm = unknown>(
  opts: EdgeInfraOptions<TRaw, TOrm>,
): RuntimeEnv<TRaw, TOrm> {
  const env = new CloudflareEnv(opts.bindings, opts.vars);
  const config = opts.config ?? createEnvConfig(env);

  let kvBinding = opts.kvBinding;
  const kvFromBindings = opts.bindings?.KV;
  if (!kvBinding && isKvBindingLike(kvFromBindings)) {
    kvBinding = kvFromBindings;
  }
  let cache: CachePort = createMemoryCache();
  if (kvBinding) {
    cache = createKvCache(kvBinding);
  }

  let objectPort = opts.objectPort;
  if (!objectPort) {
    const r2FromBindings = opts.bindings?.MY_BUCKET;
    if (opts.r2Binding) {
      objectPort = createR2PortFromBinding(opts.r2Binding);
    } else if (isR2BindingLike(r2FromBindings)) {
      objectPort = createR2PortFromBinding(r2FromBindings);
    } else {
      objectPort = createMemoryObjects();
    }
  }

  let queuePort = opts.queuePort;
  if (!queuePort) {
    const queueFromBindings = opts.bindings?.QUEUE;
    if (opts.queueBinding) {
      queuePort = createQueuesQueue(opts.queueBinding);
    } else if (isQueueBindingLike(queueFromBindings)) {
      queuePort = createQueuesQueue(queueFromBindings);
    }
  }

  const db = createD1Port<TRaw, TOrm>(opts.dbClient, opts.dbClose, opts.dbOrm);
  return createInfra({
    mode: "edge",
    env,
    config,
    logger: createConsoleLogger("edge"),
    clock: createSystemClock(),
    ids: createUuidIds(),
    db,
    cache,
    objects: objectPort,
    queue: queuePort,
    pubsub: opts.pubsubPort ?? createMemoryPubSub(),
    realtime: opts.realtimePort ?? createMemoryRealtime(),
  });
}
