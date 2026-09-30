import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMapEnv } from "../../../adapters/memory/map-env";
import { createRedisStreamsQueue, isStreamsConfigured } from "../../../adapters/node/redis-streams";
import { createEnvConfig } from "../../../schema/env-schema";
import { describeQueueContract } from "../../contract/queue.contract";
import { type RedisStack, startRedisStack } from "./containers";

let stack!: RedisStack;

beforeAll(async () => {
  stack = await startRedisStack();
}, 180_000);

afterAll(async () => {
  await stack.stop();
});

function streamsConfig() {
  return createEnvConfig(createMapEnv({ UPSTASH_REDIS_REST_URL: stack.url, UPSTASH_REDIS_REST_TOKEN: stack.token }));
}

describe("redis streams stack", () => {
  it("detects the containerized streams endpoint", () => {
    expect(isStreamsConfigured(streamsConfig())).toBe(true);
  });
});

describeQueueContract("redis-streams", () =>
  createRedisStreamsQueue(streamsConfig(), { stream: "microinfra-tests:queue", pollIntervalMs: 50 }),
);
