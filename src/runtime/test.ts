import { createConsoleLogger, createNoopLogger } from "../adapters/memory/loggers";
import { createMapEnv } from "../adapters/memory/map-env";
import { createMemoryCache } from "../adapters/memory/memory-cache";
import { createMemoryObjects } from "../adapters/memory/memory-objects";
import { createMemoryPubSub } from "../adapters/memory/memory-pubsub";
import { createMemoryQueue } from "../adapters/memory/memory-queue";
import { createMemoryRealtime } from "../adapters/memory/memory-realtime";
import { createSystemClock } from "../adapters/memory/system-clock";
import { createUuidIds } from "../adapters/memory/uuid-ids";
import { createInfra } from "../core/registry";
import type { RuntimeEnv, RuntimeMode } from "../core/types";
import type { EnvConfig } from "../ports/config";
import { createEnvConfig } from "../schema/env-schema";

export interface TestInfraOptions {
  env?: Record<string, string>;
  mode?: RuntimeMode;
  silent?: boolean;
}

export function createTestInfra<TDb = { tag: "memory-test-db" }>(opts: TestInfraOptions = {}): RuntimeEnv<TDb> {
  const env = createMapEnv(opts.env ?? {});
  const config: EnvConfig = createEnvConfig(env);
  const db = { client: { tag: "memory-test-db" } as TDb };
  return createInfra({
    mode: opts.mode ?? "test",
    env,
    config,
    logger: opts.silent === false ? createConsoleLogger("test") : createNoopLogger(),
    clock: createSystemClock(),
    ids: createUuidIds(),
    db,
    cache: createMemoryCache(),
    objects: createMemoryObjects(),
    queue: createMemoryQueue(),
    pubsub: createMemoryPubSub(),
    realtime: createMemoryRealtime(),
  });
}
