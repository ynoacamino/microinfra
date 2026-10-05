import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cfWsProxyFetch,
  createNitroWsEvents,
  defineCfQueuePlugin,
  defineWorkerPlugin,
  nitroMicroinfraConfig,
} from "./nitro-helpers";
import { createTestInfra } from "./test";

afterEach(() => {
  globalThis.__env__ = undefined;
  globalThis.__do_env__ = undefined;
  for (const k of Object.keys(globalThis as Record<string, unknown>)) {
    if (k.startsWith("__microinfra_")) delete (globalThis as Record<string, unknown>)[k];
  }
});

describe("nitroMicroinfraConfig", () => {
  it("returns bun preset by default", () => {
    const prev = process.env.NITRO_PRESET;
    delete process.env.NITRO_PRESET;
    const cfg = nitroMicroinfraConfig();
    expect(cfg.preset).toBe("bun");
    expect(cfg.features.websocket).toBe(true);
    expect(cfg.handlers[0]?.handler).toBe("./server/ws-handler.ts");
    if (prev === undefined) delete process.env.NITRO_PRESET;
    else process.env.NITRO_PRESET = prev;
  });

  it("returns cloudflare-module preset with websocket disabled", () => {
    const prev = process.env.NITRO_PRESET;
    process.env.NITRO_PRESET = "cloudflare-module";
    const cfg = nitroMicroinfraConfig({ esmPonyfillPath: "/x/esm-ponyfill.js" });
    expect(cfg.preset).toBe("cloudflare-module");
    expect(cfg.features.websocket).toBe(false);
    expect(cfg.handlers[0]?.handler).toBe("./server/cf-ws-handler.ts");
    expect(cfg.alias?.["@whatwg-node/fetch"]).toBe("/x/esm-ponyfill.js");
    if (prev === undefined) delete process.env.NITRO_PRESET;
    else process.env.NITRO_PRESET = prev;
  });
});

describe("createNitroWsEvents", () => {
  it("adapts open/message/close to the graphql-ws machine", async () => {
    const calls: string[] = [];
    const events = createNitroWsEvents(
      () => ({
        open: (id: string) => void calls.push(`open:${id}`),
        message: async (peer: { id: string }, text: string) => void calls.push(`msg:${peer.id}:${text}`),
        close: async (id: string) => void calls.push(`close:${id}`),
      }),
      "test-ws-singleton",
    );
    events.open({ id: "p1", send: () => {} });
    await events.message({ id: "p1", send: () => {} }, "hello");
    await events.message({ id: "p1", send: () => {} }, { text: () => "wrapped" });
    await events.close({ id: "p1", send: () => {} });
    expect(calls).toEqual(["open:p1", "msg:p1:hello", "msg:p1:wrapped", "close:p1"]);
  });
});

describe("cfWsProxyFetch", () => {
  it("returns 426 without upgrade", async () => {
    const res = await cfWsProxyFetch(new Request("http://x/_ws"));
    expect(res.status).toBe(426);
  });

  it("returns 500 without binding", async () => {
    const res = await cfWsProxyFetch(new Request("http://x/_ws", { headers: { upgrade: "websocket" } }));
    expect(res.status).toBe(500);
  });

  it("forwards to the DO stub", async () => {
    const fetch = vi.fn(async () => new Response("ok"));
    globalThis.__env__ = { REALTIME_DO: { idFromName: () => "id", get: () => ({ fetch }) } };
    const res = await cfWsProxyFetch(new Request("http://x/_ws", { headers: { upgrade: "websocket" } }));
    expect(await res.text()).toBe("ok");
    expect(fetch).toHaveBeenCalledOnce();
  });
});

describe("worker plugins", () => {
  it("defineWorkerPlugin skips on edge and runs on node", async () => {
    globalThis.__env__ = { DB: { tag: "d1" } };
    const plugin = defineWorkerPlugin(
      () => createTestInfra(),
      async () => async () => {},
    );
    await plugin(); // no throw, skipped
    globalThis.__env__ = undefined;
    const plugin2 = defineWorkerPlugin(
      () => createTestInfra(),
      async () => async () => {},
    );
    await plugin2();
  });

  it("defineCfQueuePlugin wires cloudflare:queue", async () => {
    let ran = false;
    const plugin = defineCfQueuePlugin(async () => {
      ran = true;
    });
    const hooks: Array<{ name: string; fn: (p: { batch: unknown }) => Promise<void> }> = [];
    plugin({ hooks: { hook: (name, fn) => void hooks.push({ name, fn }) } });
    expect(hooks[0]?.name).toBe("cloudflare:queue");
    await hooks[0]?.fn({ batch: { queue: "q", messages: [] } });
    expect(ran).toBe(true);
  });
});
