import { afterEach, describe, expect, it, vi } from "vitest";
import { createEnvConfig } from "../../schema/env-schema";
import { createMapEnv } from "../memory/map-env";
import { createLibsqlPort, isLibsqlConfigured } from "./libsql-db";
import { NodeEnv } from "./node-env";
import { createHttpRedisCache, isRedisConfigured } from "./redis-cache";
import { isS3Configured } from "./s3-objects";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("libsql/s3 wrappers", () => {
  it("wraps injected clients (DIP, no SDK imports)", async () => {
    let closed = false;
    const markClosed = (): void => {
      closed = true;
    };
    const db = createLibsqlPort({ tag: "libsql" }, async () => markClosed());
    expect(db.client).toEqual({ tag: "libsql" });
    await db.close?.();
    expect(closed).toBe(true);

    const config = createEnvConfig(createMapEnv({ DATABASE_URL: "libsql://x" }));
    expect(isLibsqlConfigured(config)).toBe(true);
    expect(isS3Configured(config)).toBe(false);

    const s3Config = createEnvConfig(
      createMapEnv({ S3_ACCESS_KEY_ID: "k", S3_SECRET_ACCESS_KEY: "s", S3_BUCKET_NAME: "b" }),
    );
    expect(isS3Configured(s3Config)).toBe(true);
  });
});

describe("node-env", () => {
  it("reads process.env by default and enforces required keys", () => {
    const env = new NodeEnv();
    expect(typeof env.all()).toBe("object");
    const scoped = new NodeEnv({ A: "1" });
    expect(scoped.get("A")).toBe("1");
    expect(scoped.get("ZZZ")).toBeUndefined();
    expect(() => scoped.getRequired("ZZZ")).toThrow();
    expect(scoped.all()).toEqual({ A: "1" });
  });
});

describe("http-redis-cache", () => {
  it("talks Upstash REST over global fetch (zero deps)", async () => {
    const commands: unknown[][] = [];
    vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
      const raw = typeof input === "string" ? init?.body : await (input as Request).text();
      const command = JSON.parse(String(raw)) as unknown[];
      commands.push(command);
      if (command[0] === "KEYS") return { ok: true, json: async () => ({ result: ["a"] }) };
      if (command[0] === "GET") return { ok: true, json: async () => ({ result: "v" }) };
      return { ok: true, json: async () => ({ result: "OK" }) };
    });
    const config = createEnvConfig(
      createMapEnv({ UPSTASH_REDIS_REST_URL: "https://upstash.io", UPSTASH_REDIS_REST_TOKEN: "t" }),
    );
    expect(isRedisConfigured(config)).toBe(true);
    const cache = createHttpRedisCache(config);
    expect(await cache.get("k")).toBe("v");
    await cache.put("k", "v", { ttl: 10 });
    await cache.delete("k");
    expect(await cache.list("a")).toEqual(["a"]);
    expect(commands).toEqual([
      ["GET", "k"],
      ["SET", "k", "v", "EX", "10"],
      ["DEL", "k"],
      ["KEYS", "a*"],
    ]);
  });

  it("propagates HTTP errors", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: false, status: 500, json: async () => ({}) }));
    const config = createEnvConfig(
      createMapEnv({ UPSTASH_REDIS_REST_URL: "https://upstash.io", UPSTASH_REDIS_REST_TOKEN: "t" }),
    );
    await expect(createHttpRedisCache(config).get("k")).rejects.toThrow("[cache]");
  });
});
