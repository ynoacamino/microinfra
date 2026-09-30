import { describe, expect, it } from "vitest";
import type { RealtimeEvents, RealtimePort } from "../../ports/realtime";
import { describeRealtimeContract, type RealtimeHarness } from "../../tests/contract/realtime.contract";
import { attachWsRealtime, type WsServerLike, type WsSocketLike } from "./ws-realtime";

class FakeSocket implements WsSocketLike {
  readonly sent: string[] = [];
  private readonly listeners = new Map<string, unknown[]>();

  on(event: "message", listener: (data: unknown, isBinary: boolean) => void): void;
  on(event: "close", listener: (code: number, reason: unknown) => void): void;
  on(event: "error", listener: (error: unknown) => void): void;
  on(event: string, listener: unknown): void {
    const list = this.listeners.get(event) ?? [];
    list.push(listener);
    this.listeners.set(event, list);
  }

  send(data: string): void {
    void this.sent.push(data);
  }

  close(): void {}

  receive(data: unknown, isBinary = false): void {
    for (const listener of this.listeners.get("message") ?? []) {
      (listener as (data: unknown, isBinary: boolean) => void)(data, isBinary);
    }
  }

  closeFromClient(code: number, reason: unknown): void {
    for (const listener of this.listeners.get("close") ?? []) {
      (listener as (code: number, reason: unknown) => void)(code, reason);
    }
  }

  fail(error: unknown): void {
    for (const listener of this.listeners.get("error") ?? []) {
      (listener as (error: unknown) => void)(error);
    }
  }
}

class FakeServer implements WsServerLike {
  private handler: ((socket: WsSocketLike) => void) | null = null;

  on(event: "connection", listener: (socket: WsSocketLike) => void): void {
    if (event === "connection") this.handler = listener;
  }

  plug(socket: FakeSocket): void {
    this.handler?.(socket);
  }
}

async function tick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 5));
}

async function makeWsHarness(events: RealtimeEvents): Promise<RealtimeHarness> {
  const server = new FakeServer();
  const seen: string[] = [];
  const port = attachWsRealtime(server, {
    onConnect: (connection) => {
      void seen.push(connection.id);
      return events.onConnect(connection);
    },
    onMessage: (connection, message) => events.onMessage(connection, message),
    onDisconnect: (connection, code, reason) => events.onDisconnect(connection, code, reason),
  });
  let plugged = 0;
  return {
    port,
    connect: async () => {
      const socket = new FakeSocket();
      const index = plugged;
      plugged += 1;
      server.plug(socket);
      const deadline = Date.now() + 2000;
      while (seen.length <= index && Date.now() < deadline) {
        await tick();
      }
      const id = seen[index];
      if (!id) throw new Error("socket was not registered");
      return {
        id,
        received: socket.sent,
        sendToServer: async (message) => {
          socket.receive(message);
          await tick();
        },
        closeFromClient: async (code, reason) => {
          socket.closeFromClient(code ?? 1005, reason ?? "");
          await tick();
        },
      };
    },
  };
}

describeRealtimeContract("ws", makeWsHarness);

describe("ws realtime adapter", () => {
  it("decodes binary frames and buffer close reasons like the ws library", async () => {
    const messages: string[] = [];
    const disconnects: Array<{ code?: number; reason?: string }> = [];
    const server = new FakeServer();
    const port: RealtimePort = attachWsRealtime(server, {
      onConnect: () => {},
      onMessage: (_connection, message) => void messages.push(message),
      onDisconnect: (_connection, code, reason) => void disconnects.push({ code, reason }),
    });
    const socket = new FakeSocket();
    server.plug(socket);
    const deadline = Date.now() + 2000;
    while ((await port.connectionCount()) === 0 && Date.now() < deadline) {
      await tick();
    }
    socket.receive(Buffer.from("binary hello"), true);
    socket.closeFromClient(1000, Buffer.from("bye"));
    await tick();
    await tick();
    expect(messages).toEqual(["binary hello"]);
    expect(disconnects).toEqual([{ code: 1000, reason: "bye" }]);
  });

  it("disconnects errored sockets", async () => {
    const disconnects: Array<{ code?: number; reason?: string }> = [];
    const server = new FakeServer();
    const port = attachWsRealtime(server, {
      onConnect: () => {},
      onMessage: () => {},
      onDisconnect: (_connection, code, reason) => void disconnects.push({ code, reason }),
    });
    const socket = new FakeSocket();
    server.plug(socket);
    const deadline = Date.now() + 2000;
    while ((await port.connectionCount()) === 0 && Date.now() < deadline) {
      await tick();
    }
    socket.fail(new Error("boom"));
    await tick();
    await tick();
    expect(disconnects).toEqual([{ code: 1011, reason: "socket error" }]);
    expect(await port.connectionCount()).toBe(0);
  });
});
