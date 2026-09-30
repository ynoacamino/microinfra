import { describe, expect, it } from "vitest";
import { createMapEnv } from "../adapters/memory/map-env";
import { createMemoryObjects } from "../adapters/memory/memory-objects";
import { createEnvConfig } from "../schema/env-schema";
import { createEdgeInfra } from "./edge";
import { createNodeInfra } from "./node";
import { createTestInfra } from "./test";

describe("createTestInfra", () => {
  it("assembles a full in-memory runtime", async () => {
    const rt = createTestInfra({ env: { PORT: "7001" } });
    expect(rt.mode).toBe("test");
    expect(rt.config.port).toBe(7001);
    await rt.cache.put("k", "v");
    expect(await rt.cache.get("k")).toBe("v");
    expect(rt.ids.createId()).toHaveLength(36);
  });
});

describe("createNodeInfra", () => {
  it("falls back to memory without redis and wires the injected db", async () => {
    const rt = createNodeInfra({ vars: {}, dbClient: { tag: "libsql" } });
    expect(rt.mode).toBe("node");
    await rt.cache.put("k", "v");
    expect(await rt.cache.get("k")).toBe("v");
    expect(rt.db.client).toEqual({ tag: "libsql" });
  });
});

describe("createEdgeInfra", () => {
  it("uses KV when bound, memory otherwise", async () => {
    const store = new Map<string, string>();
    const kv = {
      get: async (k: string) => store.get(k) ?? null,
      put: async (k: string, v: string) => void store.set(k, v),
      delete: async (k: string) => void store.delete(k),
      list: async (opts?: { prefix?: string }) => ({
        keys: [...store.keys()].filter((k) => k.startsWith(opts?.prefix ?? "")).map((name) => ({ name })),
      }),
    };
    const objects = createMemoryObjects();
    const rt = createEdgeInfra({
      bindings: { KV: {}, DB: {} },
      dbClient: { tag: "d1" },
      kvBinding: kv,
      objectPort: objects,
    });
    expect(rt.mode).toBe("edge");
    await rt.cache.put("x", "1");
    expect(await rt.cache.get("x")).toBe("1");
  });

  it("falls back to memory without bindings and accepts an explicit config on node", async () => {
    const edgeRt = createEdgeInfra({ dbClient: { tag: "d1" }, objectPort: createMemoryObjects() });
    await edgeRt.cache.put("m", "1");
    expect(await edgeRt.cache.get("m")).toBe("1");

    const nodeRt = createNodeInfra({
      vars: {},
      dbClient: { tag: "libsql" },
      config: createEnvConfig(createMapEnv({})),
    });
    expect(nodeRt.mode).toBe("node");
    expect(nodeRt.db.client).toEqual({ tag: "libsql" });
  });
});
