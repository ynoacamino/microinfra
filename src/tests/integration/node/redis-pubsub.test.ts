import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 15_000 });

import { createMapEnv } from "../../../adapters/memory/map-env";
import { createRedisStreamsPubSub, type RedisPubSubOptions } from "../../../adapters/node/redis-pubsub";
import { createEnvConfig } from "../../../schema/env-schema";
import { describePubSubContract } from "../../contract/pubsub.contract";
import { type RedisStack, startRedisStack } from "./containers";

let stack!: RedisStack;

beforeAll(async () => {
  stack = await startRedisStack();
}, 180_000);

afterAll(async () => {
  await stack.stop();
});

function pubsubConfig() {
  return createEnvConfig(createMapEnv({ UPSTASH_REDIS_REST_URL: stack.url, UPSTASH_REDIS_REST_TOKEN: stack.token }));
}

function makePubSub(channel: string, opts: RedisPubSubOptions = {}) {
  return createRedisStreamsPubSub(pubsubConfig(), {
    prefix: `microinfra-tests:ps:${channel}`,
    pollIntervalMs: 50,
    ...opts,
  });
}

describePubSubContract("redis-streams-pubsub", () => makePubSub(crypto.randomUUID()));

describe("redis pubsub distribution", () => {
  it("does not replay history published before subscribing", async () => {
    const prefix = `microinfra-tests:noreplay:${crypto.randomUUID()}`;
    const early = createRedisStreamsPubSub(pubsubConfig(), { prefix, pollIntervalMs: 50 });
    early.publish("chat", "before-subscribe");
    await new Promise((resolve) => setTimeout(resolve, 300));

    const late = createRedisStreamsPubSub(pubsubConfig(), { prefix, pollIntervalMs: 50 });
    const iterator = late.subscribe<string>("chat")[Symbol.asyncIterator]();
    late.publish("chat", "after-subscribe");
    const first = await iterator.next();
    expect(first.value).toBe("after-subscribe");
    await iterator.return?.(undefined);
  });

  it("fans out from one publisher instance to another subscriber instance", async () => {
    const prefix = `microinfra-tests:fanout:${crypto.randomUUID()}`;
    const publisher = createRedisStreamsPubSub(pubsubConfig(), { prefix, pollIntervalMs: 50 });
    const subscriber = createRedisStreamsPubSub(pubsubConfig(), { prefix, pollIntervalMs: 50 });
    const iterator = subscriber.subscribe<string>("chat")[Symbol.asyncIterator]();
    await new Promise((resolve) => setTimeout(resolve, 100));
    publisher.publish("chat", "cross-instance");
    const first = await iterator.next();
    expect(first.value).toBe("cross-instance");
    await iterator.return?.(undefined);
  });
});
