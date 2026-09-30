import { describe, expect, it } from "vitest";
import type { RealtimeEvents } from "../ports/realtime";
import { decodeRealtimeMessage, isWebSocketUpgradeRequest, RealtimeHub, type RealtimeSender } from "./realtime-hub";

function upgradeRequest(upgrade: string | null): { headers: { get(name: string): string | null } } {
  return { headers: { get: (name: string) => (name === "upgrade" ? upgrade : null) } };
}

function makeSender() {
  const sent: string[] = [];
  const closed: Array<{ code?: number; reason?: string }> = [];
  const sender: RealtimeSender = {
    send: (message) => void sent.push(message),
    close: (code, reason) => void closed.push({ code, reason }),
  };
  return { sent, closed, sender };
}

function failingSender(): RealtimeSender {
  return {
    send: () => {
      throw new Error("dead socket");
    },
    close: () => {},
  };
}

function throwingCloser(): RealtimeSender {
  return {
    send: () => {},
    close: () => {
      throw new Error("close failed");
    },
  };
}

describe("isWebSocketUpgradeRequest", () => {
  it("detects websocket upgrades case-insensitively", () => {
    expect(isWebSocketUpgradeRequest(upgradeRequest("websocket"))).toBe(true);
    expect(isWebSocketUpgradeRequest(upgradeRequest("WebSocket"))).toBe(true);
    expect(isWebSocketUpgradeRequest(upgradeRequest("h2c"))).toBe(false);
    expect(isWebSocketUpgradeRequest(upgradeRequest(null))).toBe(false);
  });
});

describe("decodeRealtimeMessage", () => {
  it("decodes strings, buffers, array buffers and other values", () => {
    expect(decodeRealtimeMessage("hi")).toBe("hi");
    expect(decodeRealtimeMessage(new TextEncoder().encode("buffered"))).toBe("buffered");
    const bytes = new TextEncoder().encode("binary");
    expect(decodeRealtimeMessage(bytes.buffer)).toBe("binary");
    expect(decodeRealtimeMessage(42)).toBe("42");
  });
});

describe("RealtimeHub", () => {
  it("registers connections with generated ids and exposes meta", async () => {
    const seen: string[] = [];
    const metas: unknown[] = [];
    const events: RealtimeEvents = {
      onConnect: (connection) => {
        void metas.push(connection.meta);
        void seen.push(connection.id);
      },
      onMessage: () => {},
      onDisconnect: () => {},
    };
    const hub = new RealtimeHub(events);
    const a = await hub.connect(makeSender().sender, { meta: { user: "u1" } });
    const b = await hub.connect(makeSender().sender);
    expect(a.id).toBe("conn-1");
    expect(b.id).toBe("conn-2");
    expect(metas).toEqual([{ user: "u1" }, undefined]);
    expect(seen).toEqual(["conn-1", "conn-2"]);
    expect(await hub.connectionCount()).toBe(2);
  });

  it("delivers incoming messages and reports unknown connections", async () => {
    const messages: string[] = [];
    const hub = new RealtimeHub({
      onConnect: () => {},
      onMessage: (_connection, message) => void messages.push(message),
      onDisconnect: () => {},
    });
    const connection = await hub.connect(makeSender().sender);
    expect(await hub.incoming(connection.id, "ping")).toBe(true);
    expect(messages).toEqual(["ping"]);
    expect(await hub.incoming("missing", "ping")).toBe(false);
  });

  it("disconnects known connections and ignores unknown ones", async () => {
    const disconnects: Array<{ id: string; code?: number; reason?: string }> = [];
    const hub = new RealtimeHub({
      onConnect: () => {},
      onMessage: () => {},
      onDisconnect: (connection, code, reason) => void disconnects.push({ id: connection.id, code, reason }),
    });
    const connection = await hub.connect(makeSender().sender);
    expect(await hub.disconnect("missing")).toBe(false);
    expect(await hub.disconnect(connection.id, 1000, "bye")).toBe(true);
    expect(disconnects).toEqual([{ id: connection.id, code: 1000, reason: "bye" }]);
    expect(await hub.connectionCount()).toBe(0);
  });

  it("drops dead senders on broadcast without losing other deliveries", async () => {
    const disconnects: string[] = [];
    const hub = new RealtimeHub({
      onConnect: () => {},
      onMessage: () => {},
      onDisconnect: (connection) => void disconnects.push(connection.id),
    });
    const alive = makeSender();
    const dead = await hub.connect(failingSender());
    const live = await hub.connect(alive.sender);
    await hub.broadcast("news");
    expect(alive.sent).toEqual(["news"]);
    expect(disconnects).toEqual([dead.id]);
    expect(await hub.connectionCount()).toBe(1);
    expect(await hub.sendTo(live.id, "dm")).toBe(true);
    expect(await hub.sendTo(dead.id, "dm")).toBe(false);
  });

  it("drops senders that fail on targeted sends", async () => {
    const disconnects: string[] = [];
    const hub = new RealtimeHub({
      onConnect: () => {},
      onMessage: () => {},
      onDisconnect: (connection) => void disconnects.push(connection.id),
    });
    const dead = await hub.connect(failingSender());
    expect(await hub.sendTo(dead.id, "dm")).toBe(false);
    expect(disconnects).toEqual([dead.id]);
    expect(await hub.sendTo("missing", "dm")).toBe(false);
  });

  it("closes every connection even when a close throws", async () => {
    const disconnects: string[] = [];
    const hub = new RealtimeHub({
      onConnect: () => {},
      onMessage: () => {},
      onDisconnect: (connection) => void disconnects.push(connection.id),
    });
    const broken = makeSender();
    const flaky = throwingCloser();
    const first = await hub.connect({ ...broken.sender, ...flaky });
    const second = await hub.connect(broken.sender);
    await hub.closeAll(1001, "restart");
    expect(disconnects).toEqual([first.id, second.id]);
    expect(await hub.connectionCount()).toBe(0);
    expect(broken.closed).toEqual([{ code: 1001, reason: "restart" }]);
  });
});
