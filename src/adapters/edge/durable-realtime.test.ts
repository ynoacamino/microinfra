import { describe, expect, it } from "vitest";
import type { RealtimeEvents } from "../../ports/realtime";
import { describeRealtimeContract, type RealtimeHarness } from "../../tests/contract/realtime.contract";
import { createDurableRealtime, type DurableSocketLike, type DurableStateLike } from "./durable-realtime";

class FakeDurableSocket implements DurableSocketLike {
  readonly sent: string[] = [];
  readonly closed: Array<{ code?: number; reason?: string }> = [];
  attachment: unknown;

  send(message: string): void {
    void this.sent.push(message);
  }

  close(code?: number, reason?: string): void {
    void this.closed.push({ code, reason });
  }

  serializeAttachment(data: unknown): void {
    this.attachment = data;
  }

  deserializeAttachment(): unknown {
    return this.attachment;
  }
}

class FakeState implements DurableStateLike {
  readonly accepted: DurableSocketLike[] = [];

  acceptWebSocket(socket: DurableSocketLike): void {
    void this.accepted.push(socket);
  }

  getWebSockets(): DurableSocketLike[] {
    return [...this.accepted];
  }
}

function wsRequest(): Request {
  return new Request("https://example.com/socket", { headers: { upgrade: "websocket" } });
}

async function tick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 5));
}

async function makeDurableHarness(events: RealtimeEvents): Promise<RealtimeHarness> {
  const state = new FakeState();
  const seen: string[] = [];
  const realtime = createDurableRealtime(state, {
    onConnect: (connection) => {
      void seen.push(connection.id);
      return events.onConnect(connection);
    },
    onMessage: (connection, message) => events.onMessage(connection, message),
    onDisconnect: (connection, code, reason) => events.onDisconnect(connection, code, reason),
  });
  let plugged = 0;
  return {
    port: realtime,
    connect: async () => {
      const index = plugged;
      plugged += 1;
      const server = new FakeDurableSocket();
      let answered: unknown;
      const response = realtime.handleUpgrade(
        wsRequest(),
        { user: "u1" },
        {
          createPair: () => ({ client: { tag: "client" }, server }),
          respond: (client) => {
            answered = client;
            return new Response("upgraded");
          },
        },
      );
      expect(response.status).toBe(200);
      expect(answered).toEqual({ tag: "client" });
      const deadline = Date.now() + 2000;
      while (seen.length <= index && Date.now() < deadline) {
        await tick();
      }
      const id = seen[index];
      if (!id) throw new Error("socket was not registered");
      await tick();
      return {
        id,
        received: server.sent,
        sendToServer: (message) => realtime.handleMessage(server, message),
        closeFromClient: (code, reason) => realtime.handleClose(server, code ?? 1005, reason ?? ""),
      };
    },
  };
}

describeRealtimeContract("durable-objects", makeDurableHarness);

describe("durable realtime upgrade", () => {
  it("rejects non-websocket requests", () => {
    const realtime = createDurableRealtime(new FakeState());
    const response = realtime.handleUpgrade(new Request("https://example.com/socket"));
    expect(response.status).toBe(400);
  });

  it("reports a missing WebSocketPair outside the workers runtime", async () => {
    const realtime = createDurableRealtime(new FakeState());
    const response = realtime.handleUpgrade(wsRequest());
    expect(response.status).toBe(500);
    expect(await response.text()).toBe("WebSocketPair is not available");
  });

  it("accepts sockets and stores per-connection attachments", async () => {
    const state = new FakeState();
    const realtime = createDurableRealtime(state);
    const server = new FakeDurableSocket();
    const response = realtime.handleUpgrade(
      wsRequest(),
      { user: "u1" },
      {
        createPair: () => ({ client: {}, server }),
        respond: () => new Response("upgraded"),
      },
    );
    expect(response.status).toBe(200);
    expect(state.accepted).toEqual([server]);
    expect(server.attachment).toEqual({ user: "u1" });
    const deadline = Date.now() + 2000;
    while ((await realtime.connectionCount()) === 0 && Date.now() < deadline) {
      await tick();
    }
    expect(await realtime.connectionCount()).toBe(1);
  });
});

describe("durable realtime messages", () => {
  it("re-registers unknown sockets from their attachment after hibernation", async () => {
    const messages: Array<{ meta: unknown; message: string }> = [];
    const realtime = createDurableRealtime(new FakeState(), {
      onConnect: () => {},
      onMessage: (connection, message) => void messages.push({ meta: connection.meta, message }),
      onDisconnect: () => {},
    });
    const woken = new FakeDurableSocket();
    woken.serializeAttachment({ user: "returning" });
    await realtime.handleMessage(woken, new TextEncoder().encode("hello again").buffer as ArrayBuffer);
    expect(messages).toEqual([{ meta: { user: "returning" }, message: "hello again" }]);
    expect(await realtime.connectionCount()).toBe(1);
    await realtime.handleClose(woken, 1000, "bye");
    expect(await realtime.connectionCount()).toBe(0);
  });
});
