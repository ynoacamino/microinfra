import { describe, expect, it } from "vitest";
import { createEnvConfig } from "../../schema/env-schema";
import { createConsoleLogger } from "./loggers";
import { createMapEnv } from "./map-env";
import { createMemoryCache } from "./memory-cache";
import { createMemoryPubSub } from "./memory-pubsub";

describe("memory-cache ttl", () => {
  it("expires entries with a past ttl", async () => {
    const cache = createMemoryCache();
    await cache.put("tmp", "v", { ttl: -1 });
    expect(await cache.get("tmp")).toBeNull();
  });
});

describe("memory-pubsub unsubscribe", () => {
  it("a departed subscriber stops receiving messages", async () => {
    const pubsub = createMemoryPubSub();
    const subA = pubsub.subscribe<string>("ch");
    const subB = pubsub.subscribe<string>("ch");
    const itA = subA[Symbol.asyncIterator]();
    const itB = subB[Symbol.asyncIterator]();
    pubsub.publish("ch", "1");
    expect((await itA.next()).value).toBe("1");
    expect((await itB.next()).value).toBe("1");
    await itA.return?.(undefined);
    pubsub.publish("ch", "2");
    expect((await itB.next()).value).toBe("2");
    await itB.return?.(undefined);
  });
});

describe("console logger levels", () => {
  it("debug/warn never throw", () => {
    const log = createConsoleLogger("x");
    expect(() => log.debug("d")).not.toThrow();
    expect(() => log.warn("w", { a: 1 })).not.toThrow();
  });
});

describe("env-schema s3 flags", () => {
  it("accepts S3_FORCE_PATH_STYLE as a string", () => {
    const config = createEnvConfig(createMapEnv({ S3_FORCE_PATH_STYLE: "true" }));
    expect(config.s3.forcePathStyle).toBe(true);
  });
});
