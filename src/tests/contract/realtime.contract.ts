import { describe, expect, it } from "vitest";
import type { RealtimeEvents, RealtimePort } from "../../ports/realtime";

export interface RealtimeTestClient {
  readonly id: string;
  readonly received: string[];
  sendToServer(message: string): Promise<void>;
  closeFromClient(code?: number, reason?: string): Promise<void>;
}

export interface RealtimeHarness {
  port: RealtimePort;
  connect(): Promise<RealtimeTestClient>;
}

export interface RealtimeEventLog {
  connects: string[];
  messages: Array<{ id: string; message: string }>;
  disconnects: Array<{ id: string; code?: number; reason?: string }>;
  events: RealtimeEvents;
}

export function collectRealtimeEvents(): RealtimeEventLog {
  const connects: string[] = [];
  const messages: Array<{ id: string; message: string }> = [];
  const disconnects: Array<{ id: string; code?: number; reason?: string }> = [];
  return {
    connects,
    messages,
    disconnects,
    events: {
      onConnect: (connection) => void connects.push(connection.id),
      onMessage: (connection, message) => void messages.push({ id: connection.id, message }),
      onDisconnect: (connection, code, reason) => void disconnects.push({ id: connection.id, code, reason }),
    },
  };
}

export function describeRealtimeContract(
  name: string,
  makeHarness: (events: RealtimeEvents) => RealtimeHarness | Promise<RealtimeHarness>,
): void {
  describe(`RealtimePort contract [${name}]`, () => {
    it("routes client messages with the connection id", async () => {
      const log = collectRealtimeEvents();
      const harness = await makeHarness(log.events);
      const client = await harness.connect();
      await client.sendToServer("hello");
      expect(log.connects).toEqual([client.id]);
      expect(log.messages).toEqual([{ id: client.id, message: "hello" }]);
    });

    it("sends targeted messages and broadcasts to every connection", async () => {
      const log = collectRealtimeEvents();
      const harness = await makeHarness(log.events);
      const a = await harness.connect();
      const b = await harness.connect();
      expect(await harness.port.sendTo(a.id, "dm")).toBe(true);
      expect(a.received).toEqual(["dm"]);
      expect(b.received).toEqual([]);
      await harness.port.broadcast("all");
      expect(a.received).toEqual(["dm", "all"]);
      expect(b.received).toEqual(["all"]);
      expect(await harness.port.sendTo("missing", "x")).toBe(false);
      expect(await harness.port.connectionCount()).toBe(2);
    });

    it("notifies disconnects and stops delivering to closed clients", async () => {
      const log = collectRealtimeEvents();
      const harness = await makeHarness(log.events);
      const a = await harness.connect();
      const b = await harness.connect();
      await a.closeFromClient(1000, "bye");
      expect(log.disconnects).toEqual([{ id: a.id, code: 1000, reason: "bye" }]);
      expect(await harness.port.connectionCount()).toBe(1);
      await harness.port.broadcast("after");
      expect(a.received).toEqual([]);
      expect(b.received).toEqual(["after"]);
    });

    it("closes every connection at once", async () => {
      const log = collectRealtimeEvents();
      const harness = await makeHarness(log.events);
      const a = await harness.connect();
      const b = await harness.connect();
      await harness.port.closeAll(1001, "restart");
      expect(await harness.port.connectionCount()).toBe(0);
      expect(log.disconnects).toEqual([
        { id: a.id, code: 1001, reason: "restart" },
        { id: b.id, code: 1001, reason: "restart" },
      ]);
    });
  });
}
