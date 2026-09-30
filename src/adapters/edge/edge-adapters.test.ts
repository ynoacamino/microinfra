import { describe, expect, it } from "vitest";
import { createMemoryObjects } from "../memory/memory-objects";
import { CloudflareEnv } from "./cf-env";
import { createD1Port, isD1Configured } from "./d1-db";
import { createKvCache, isKvConfigured } from "./kv-cache";
import { createR2Port, isR2Configured } from "./r2-objects";

function makeKv() {
  const store = new Map<string, string>();
  return {
    binding: {
      get: async (k: string) => store.get(k) ?? null,
      put: async (k: string, v: string) => void store.set(k, v),
      delete: async (k: string) => void store.delete(k),
      list: async (opts?: { prefix?: string }) => ({
        keys: [...store.keys()].filter((k) => k.startsWith(opts?.prefix ?? "")).map((name) => ({ name })),
      }),
    },
    store,
  };
}

describe("kv-cache", () => {
  it("supports put/get/delete/list with ttl", async () => {
    const { binding } = makeKv();
    const cache = createKvCache(binding);
    await cache.put("s:1", "a", { ttl: 60 });
    await cache.put("s:2", "b");
    expect(await cache.get("s:1")).toBe("a");
    expect(await cache.list("s:")).toEqual(["s:1", "s:2"]);
    await cache.delete("s:1");
    expect(await cache.get("s:1")).toBeNull();
    expect(isKvConfigured({ KV: {} })).toBe(true);
  });
});

describe("d1/r2 wrappers", () => {
  it("wraps the injected client without coupling to the SDK", async () => {
    const db = createD1Port({ tag: "d1" }, async () => {});
    expect(db.client).toEqual({ tag: "d1" });
    await db.close?.();
    expect(isD1Configured({ DB: {} })).toBe(true);
    expect(isD1Configured({})).toBe(false);

    const objects = createMemoryObjects();
    const r2 = createR2Port({ port: objects });
    const key = r2.generateKey("f");
    await r2.put(key, new TextEncoder().encode("x"), { contentType: "text/plain" });
    expect(await r2.read(key)).toHaveLength(1);
    expect(isR2Configured({ MY_BUCKET: {} })).toBe(true);
    expect(isR2Configured({})).toBe(false);
  });
});

describe("cf-env extra", () => {
  it("getRequired throws and all merges string bindings", () => {
    const env = new CloudflareEnv({ TOKEN: "abc", DB: {} }, { PORT: "8787" });
    expect(env.getRequired("TOKEN")).toBe("abc");
    expect(() => env.getRequired("MISSING")).toThrow();
    expect(env.all().PORT).toBe("8787");
    expect(env.get("MISSING")).toBeUndefined();
  });
});
