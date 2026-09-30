import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMapEnv } from "../../../adapters/memory/map-env";
import { createHttpRedisCache, isRedisConfigured } from "../../../adapters/node/redis-cache";
import { createEnvConfig } from "../../../schema/env-schema";
import { describeCacheContract } from "../../contract/cache.contract";
import { type RedisStack, startRedisStack } from "./containers";

let stack!: RedisStack;

beforeAll(async () => {
  stack = await startRedisStack();
}, 180_000);

afterAll(async () => {
  await stack.stop();
});

function redisConfig() {
  return createEnvConfig(createMapEnv({ UPSTASH_REDIS_REST_URL: stack.url, UPSTASH_REDIS_REST_TOKEN: stack.token }));
}

describe("redis stack", () => {
  it("detects the containerized Upstash-compatible endpoint", () => {
    expect(isRedisConfigured(redisConfig())).toBe(true);
  });
});

describeCacheContract("upstash-rest", () => createHttpRedisCache(redisConfig()));
