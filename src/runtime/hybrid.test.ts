import { afterEach, describe, expect, it } from "vitest";
import { createHybridRuntime, hasEdgeBindings, resolveTarget } from "./hybrid";

afterEach(() => {
  globalThis.__env__ = undefined;
  globalThis.__do_env__ = undefined;
  for (const k of Object.keys(globalThis as Record<string, unknown>)) {
    if (k.startsWith("__microinfra_")) delete (globalThis as Record<string, unknown>)[k];
  }
});

describe("resolveTarget", () => {
  it("returns node without bindings", () => {
    expect(resolveTarget(undefined)).toBe("node");
  });

  it("returns edge with D1 binding", () => {
    expect(resolveTarget({ DB: { tag: "d1" } })).toBe("edge");
  });

  it("reads globalThis.__env__", () => {
    globalThis.__env__ = { DB: { tag: "d1" } };
    expect(resolveTarget()).toBe("edge");
  });
});

describe("hasEdgeBindings", () => {
  it("returns false without bindings", () => {
    expect(hasEdgeBindings(undefined)).toBe(false);
    expect(hasEdgeBindings(null)).toBe(false);
    expect(hasEdgeBindings("edge")).toBe(false);
    expect(hasEdgeBindings({})).toBe(false);
  });

  it("returns true when any known binding key is present", () => {
    expect(hasEdgeBindings({ DB: {} })).toBe(true);
    expect(hasEdgeBindings({ KV: {} })).toBe(true);
    expect(hasEdgeBindings({ MY_BUCKET: {} })).toBe(true);
    expect(hasEdgeBindings({ QUEUE: {} })).toBe(true);
    expect(hasEdgeBindings({ REALTIME_DO: {} })).toBe(true);
  });
});

describe("createHybridRuntime", () => {
  it("builds node runtime from env vars", () => {
    const rt = createHybridRuntime(undefined, {
      vars: { DATABASE_URL: "http://127.0.0.1:8080" },
      singletonKey: "test-node",
    });
    expect(rt.mode).toBe("node");
    expect(rt.db.orm).toBeDefined();
  });

  it("builds edge runtime from bindings and reuses the singleton", () => {
    const bindings = { DB: { tag: "fake-d1" } };
    const a = createHybridRuntime(bindings, { singletonKey: "test-edge" });
    const b = createHybridRuntime(bindings, { singletonKey: "test-edge" });
    expect(a.mode).toBe("edge");
    expect(a).toBe(b);
  });

  it("fails loudly on explicit empty bindings without D1", () => {
    expect(() => createHybridRuntime({}, { singletonKey: "test-edge-empty" })).toThrow(
      "[microinfra] binding D1 (DB) requerido",
    );
  });

  it("upgrades to shared pubsub when redis is configured", () => {
    const rt = createHybridRuntime(
      { DB: { tag: "fake-d1" } },
      {
        vars: { UPSTASH_REDIS_REST_URL: "http://127.0.0.1:8079", UPSTASH_REDIS_REST_TOKEN: "t" },
        singletonKey: "test-edge-redis",
      },
    );
    expect(rt.mode).toBe("edge");
    expect(rt.pubsub).toBeDefined();
  });

  it("respects disableSharedPubsub", () => {
    const rt = createHybridRuntime(
      { DB: { tag: "fake-d1" } },
      {
        vars: { UPSTASH_REDIS_REST_URL: "http://127.0.0.1:8079", UPSTASH_REDIS_REST_TOKEN: "t" },
        disableSharedPubsub: true,
        singletonKey: "test-edge-noshare",
      },
    );
    expect(rt.mode).toBe("edge");
  });

  it("reads bindings from globalThis.__do_env__ first", () => {
    globalThis.__do_env__ = { DB: { tag: "do-d1" } };
    expect(resolveTarget()).toBe("edge");
    const rt = createHybridRuntime(undefined, { singletonKey: "test-edge-doenv" });
    expect(rt.mode).toBe("edge");
  });

  it("keeps memory pubsub on edge without redis config", async () => {
    const rt = createHybridRuntime({ DB: { tag: "fake-d1" } }, { singletonKey: "test-edge-mem" });
    expect(rt.mode).toBe("edge");
    // memory pubsub round-trips post-subscription
    const received: unknown[] = [];
    const sub = (async () => {
      for await (const v of rt.pubsub.subscribe("ch")) {
        received.push(v);
        break;
      }
    })();
    await new Promise((r) => setTimeout(r, 10));
    rt.pubsub.publish("ch", { hello: "world" });
    await sub;
    expect(received).toEqual([{ hello: "world" }]);
  });
});
