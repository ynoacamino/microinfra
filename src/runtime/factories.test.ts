import { describe, expect, it } from "vitest";
import type { KvBinding } from "../adapters/edge/kv-cache";
import type { EdgeQueueBinding } from "../adapters/edge/queues";
import type { R2Binding } from "../adapters/edge/r2-objects";
import { createMapEnv } from "../adapters/memory/map-env";
import { createMemoryObjects } from "../adapters/memory/memory-objects";
import { createMemoryPubSub } from "../adapters/memory/memory-pubsub";
import { createMemoryRealtime } from "../adapters/memory/memory-realtime";
import { RedisStreamsPubSub } from "../adapters/node/redis-pubsub";
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

  it("wires redis streams pubsub when redis is configured, memory otherwise", () => {
    const config = createEnvConfig(
      createMapEnv({ UPSTASH_REDIS_REST_URL: "http://redis.test", UPSTASH_REDIS_REST_TOKEN: "token" }),
    );
    const redis = createNodeInfra({ vars: {}, dbClient: { tag: "libsql" }, config });
    expect(redis.pubsub).toBeInstanceOf(RedisStreamsPubSub);
    const memory = createNodeInfra({ vars: {}, dbClient: { tag: "libsql" } });
    expect(memory.pubsub).not.toBeInstanceOf(RedisStreamsPubSub);
  });

  it("wires redis cache and streams queue when node config has redis", async () => {
    const config = createEnvConfig(
      createMapEnv({ UPSTASH_REDIS_REST_URL: "http://redis.test", UPSTASH_REDIS_REST_TOKEN: "token" }),
    );
    const rt = createNodeInfra({ vars: {}, dbClient: { tag: "libsql" }, config, objectPort: createMemoryObjects() });
    expect(rt.mode).toBe("node");
    expect(rt.queue).toBeDefined();
  });

  it("resolves KV, R2 and Queues from bindings or explicit ports", async () => {
    const kvStore = new Map<string, string>();
    const kvLike: KvBinding = {
      get: async (k: string) => kvStore.get(k) ?? null,
      put: async (k: string, v: string) => void kvStore.set(k, v),
      delete: async (k: string) => void kvStore.delete(k),
      list: async (opts?: { prefix?: string }) => ({
        keys: [...kvStore.keys()].filter((k) => k.startsWith(opts?.prefix ?? "")).map((name) => ({ name })),
      }),
    };
    const r2Store = new Map<string, Uint8Array>();
    const r2Like: R2Binding = {
      put: async (k: string, v: Uint8Array | ReadableStream) => void r2Store.set(k, v as Uint8Array),
      get: async (k: string) => {
        const found = r2Store.get(k);
        if (!found) {
          return null;
        }
        return { arrayBuffer: async () => found.buffer as ArrayBuffer };
      },
      delete: async (k: string) => void r2Store.delete(k),
    };
    const sent: unknown[] = [];
    const queueLike: EdgeQueueBinding = { send: async (msg: unknown) => void sent.push(msg) };

    const fromBindings = createEdgeInfra({
      bindings: { KV: kvLike, MY_BUCKET: r2Like, QUEUE: queueLike },
      dbClient: { tag: "d1" },
    });
    await fromBindings.cache.put("k", "v");
    expect(await fromBindings.cache.get("k")).toBe("v");
    expect(fromBindings.objects).toBeDefined();
    expect(fromBindings.queue).toBeDefined();

    const explicit = createEdgeInfra({
      dbClient: { tag: "d1" },
      kvBinding: kvLike,
      r2Binding: r2Like,
      queueBinding: queueLike,
      pubsubPort: createMemoryPubSub(),
      realtimePort: createMemoryRealtime(),
    });
    await explicit.cache.put("k", "v");
    expect(await explicit.cache.get("k")).toBe("v");
    expect(explicit.queue).toBeDefined();
  });

  it("falls back to memory objects and no queue for invalid bindings", async () => {
    const rt = createEdgeInfra({
      bindings: { KV: "nope", MY_BUCKET: {}, QUEUE: 42 },
      dbClient: { tag: "d1" },
    });
    await rt.cache.put("k", "v");
    expect(await rt.cache.get("k")).toBe("v");
    await rt.objects.put("f.txt", new TextEncoder().encode("hello"), { contentType: "text/plain" });
    expect(rt.queue).toBeUndefined();
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
