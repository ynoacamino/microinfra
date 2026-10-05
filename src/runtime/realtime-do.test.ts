import { describe, expect, it, vi } from "vitest";
import { defineDoExports, defineRealtimeDO } from "./realtime-do";

const withFakeResponse = async (fn: () => Promise<void>) => {
  const RealResponse = globalThis.Response;
  (globalThis as Record<string, unknown>).Response = function (this: unknown, _body: unknown, init?: ResponseInit) {
    return { status: init?.status ?? 200, headers: init?.headers, ...(init as object) };
  } as unknown;
  try {
    await fn();
  } finally {
    globalThis.Response = RealResponse;
  }
};

describe("defineRealtimeDO", () => {
  it("runs fetch upgrade with subprotocol negotiation and onUpgrade", async () => {
    await withFakeResponse(async () => {
    const open = vi.fn();
    const Cls = defineRealtimeDO({
      createHandler: () => ({ open, message: async () => {}, close: async () => {} }),
      onUpgrade: async () => {},
    });
    const acceptWebSocket = vi.fn();
    const serializeAttachment = vi.fn();
    const fakeServer = { serializeAttachment };
    const fakeClient = {};
    (globalThis as Record<string, unknown>).WebSocketPair = function (this: unknown) {
      return [fakeClient, fakeServer];
    } as unknown;
    const inst = new Cls({ acceptWebSocket }, {});
    const res = await inst.fetch(
      new Request("http://x/_ws", { headers: { Upgrade: "websocket", "Sec-WebSocket-Protocol": "graphql-transport-ws" } }),
    );
    expect((res as unknown as { status: number }).status).toBe(101);
    expect(acceptWebSocket).toHaveBeenCalledWith(fakeServer);
    expect(serializeAttachment).toHaveBeenCalledWith({ peerId: expect.any(String) });
    expect(open).toHaveBeenCalledOnce();
    delete (globalThis as Record<string, unknown>).WebSocketPair;
    });
  });

  it("returns 500 without WebSocketPair", async () => {
    const Cls = defineRealtimeDO({ createHandler: () => ({ open: () => {}, message: async () => {}, close: async () => {} }) });
    const inst = new Cls({ acceptWebSocket: vi.fn() }, {});
    const res = await inst.fetch(new Request("http://x/_ws", { headers: { Upgrade: "websocket" } }));
    expect(res.status).toBe(500);
  });

  it("routes messages to the handler for known peers", async () => {
    const message = vi.fn(async () => {});
    const Cls = defineRealtimeDO({ createHandler: () => ({ open: () => {}, message, close: async () => {} }) });
    const inst = new Cls({ acceptWebSocket: vi.fn() }, {});
    const ws = { send: vi.fn(), deserializeAttachment: () => ({ peerId: "p9" }) } as unknown as WebSocket;
    await inst.webSocketMessage(ws, "hello");
    expect(message).toHaveBeenCalledWith(expect.objectContaining({ id: "p9" }), "hello");
  });

  it("returns 400 without websocket upgrade", async () => {
    const Cls = defineRealtimeDO({
      createHandler: () => ({ open: () => {}, message: async () => {}, close: async () => {} }),
    });
    const state = { acceptWebSocket: vi.fn() };
    const inst = new Cls(state, {});
    const res = await inst.fetch(new Request("http://x/_ws"));
    expect(res.status).toBe(400);
  });

  it("closes unknown sockets with 1011 and closes known peers", async () => {
    const close = vi.fn();
    const message = vi.fn(async () => {});
    const Cls = defineRealtimeDO({ createHandler: () => ({ open: () => {}, message, close }) });
    const state = { acceptWebSocket: vi.fn() };
    const inst = new Cls(state, {});
    const unknownWs = { close, deserializeAttachment: () => undefined } as unknown as WebSocket;
    await inst.webSocketMessage(unknownWs, "hi");
    expect(close).toHaveBeenCalledWith(1011, "sin sesion");
    const knownWs = { send: vi.fn(), deserializeAttachment: () => ({ peerId: "p1" }) } as unknown as WebSocket;
    await inst.webSocketClose(knownWs);
    expect(close).toHaveBeenCalledWith("p1");
    await inst.webSocketError(knownWs);
    expect(close).toHaveBeenCalledTimes(3);
  });
});

describe("defineDoExports", () => {
  it("spreads classes", () => {
    expect(defineDoExports({ A: 1 })).toEqual({ A: 1 });
  });
});
