import { describe, expect, it } from "vitest";
import { CloudflareEnv } from "../adapters/edge/cf-env";
import { isD1Configured } from "../adapters/edge/d1-db";
import { isKvConfigured } from "../adapters/edge/kv-cache";
import { isR2Configured } from "../adapters/edge/r2-objects";
import { createMapEnv } from "../adapters/memory/map-env";
import { isLibsqlConfigured } from "../adapters/node/libsql-db";
import { NodeEnv } from "../adapters/node/node-env";
import { isRedisConfigured } from "../adapters/node/redis-cache";
import { isS3Configured } from "../adapters/node/s3-objects";
import { createEnvConfig } from "../schema/env-schema";

describe("isConfigured cascade", () => {
  it("node: detects libsql/redis/s3 from config", () => {
    const withAll = createEnvConfig(
      createMapEnv({ DATABASE_URL: "libsql://x", UPSTASH_REDIS_REST_URL: "u", UPSTASH_REDIS_REST_TOKEN: "t" }),
    );
    expect(isLibsqlConfigured(withAll)).toBe(true);
    expect(isRedisConfigured(withAll)).toBe(true);
    expect(isS3Configured(withAll)).toBe(false);
    const empty = createEnvConfig(createMapEnv({}));
    expect(isLibsqlConfigured(empty)).toBe(false);
    expect(isRedisConfigured(empty)).toBe(false);
  });

  it("node-env reads injected vars", () => {
    const env = new NodeEnv({ PORT: "7000" });
    expect(env.get("PORT")).toBe("7000");
    expect(NodeEnv.isConfigured()).toBe(true);
  });

  it("edge: detects bindings", () => {
    expect(isKvConfigured({ KV: {} })).toBe(true);
    expect(isKvConfigured({})).toBe(false);
    expect(isD1Configured({ DB: {} })).toBe(true);
    expect(isR2Configured({ MY_BUCKET: {} })).toBe(true);
    expect(CloudflareEnv.isConfigured({ DB: {} })).toBe(true);
    expect(CloudflareEnv.isConfigured({ QUEUE: {} })).toBe(true);
    expect(CloudflareEnv.isConfigured({ REALTIME_DO: {} })).toBe(true);
    expect(CloudflareEnv.isConfigured({})).toBe(false);
    expect(CloudflareEnv.isConfigured(undefined)).toBe(false);
    const env = new CloudflareEnv({ DB: {}, TOKEN: "abc" }, { PORT: "8787" });
    expect(env.get("TOKEN")).toBe("abc");
    expect(env.all().PORT).toBe("8787");
    expect(() => env.getRequired("MISSING")).toThrow();
  });
});
