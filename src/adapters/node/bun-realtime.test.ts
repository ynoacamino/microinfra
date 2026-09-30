import { describe, expect, it } from "vitest";
import type { RealtimeConnection, RealtimeEvents } from "../../ports/realtime";
import { describeRealtimeContract, type RealtimeHarness } from "../../tests/contract/realtime.contract";
import { type BunServerLike, type BunSocketLike, createBunRealtimeHandler, handleBunUpgrade } from "./bun-realtime";

interface SocketData {
  request: string;
}

interface FakeBunSocket extends BunSocketLike<SocketData> {
  sent: string[];
  closed: Array<{ code?: number; reason?: string }>;
}

function makeBunSocket(data: SocketData): FakeBunSocket {
  const sent: string[] = [];
  const closed: Array<{ code?: number; reason?: string }> = [];
  return {
    data,
    sent,
    closed,
    sendText: (message) => void sent.push(message),
    close: (code, reason) => void closed.push({ code, reason }),
  };
}

function upgradeRequest(): Request {
  return new Request("http://localhost/graphql", { headers: { upgrade: "websocket" } });
}

function makeServer(result: boolean) {
  const upgraded: Request[] = [];
  const server: BunServerLike<SocketData> = {
    upgrade: (request, options) => {
      void upgraded.push(request);
      void options?.data;
      return result;
    },
  };
  return { upgraded, server };
}

async function makeBunHarness(events: RealtimeEvents): Promise<RealtimeHarness> {
  const seen: string[] = [];
  const { handler, port } = createBunRealtimeHandler<SocketData>({
    onConnect: (connection: RealtimeConnection) => {
      void seen.push(connection.id);
      return events.onConnect(connection);
    },
    onMessage: (connection, message) => events.onMessage(connection, message),
    onDisconnect: (connection, code, reason) => events.onDisconnect(connection, code, reason),
  });
  return {
    port,
    connect: async () => {
      const socket = makeBunSocket({ request: "req" });
      await handler.open(socket);
      const id = seen[seen.length - 1];
      if (!id) throw new Error("socket was not registered");
      return {
        id,
        received: socket.sent,
        sendToServer: (message) => Promise.resolve(handler.message(socket, message)).then(() => {}),
        closeFromClient: (code, reason) =>
          Promise.resolve(handler.close(socket, code ?? 1005, reason ?? "")).then(() => {}),
      };
    },
  };
}

describeRealtimeContract("bun", makeBunHarness);

describe("bun realtime upgrade", () => {
  it("ignores non-websocket requests", () => {
    const { server } = makeServer(true);
    const plain = new Request("http://localhost/graphql");
    expect(handleBunUpgrade(server, plain, { request: "req" })).toBeNull();
  });

  it("upgrades websocket requests and reports failures", async () => {
    const ok = makeServer(true);
    const response = handleBunUpgrade(ok.server, upgradeRequest(), { request: "req" });
    expect(response).not.toBeNull();
    expect(response?.status).toBe(200);
    expect(ok.upgraded).toHaveLength(1);

    const broken = makeServer(false);
    const failure = handleBunUpgrade(broken.server, upgradeRequest(), { request: "req" });
    expect(failure?.status).toBe(500);
    expect(await failure?.text()).toBe("Internal Server Error");
  });
});

describe("bun realtime handler", () => {
  it("exposes socket data as connection meta and decodes binary messages", async () => {
    const messages: Array<{ meta: unknown; message: string }> = [];
    const { handler, port } = createBunRealtimeHandler<SocketData>({
      onConnect: () => {},
      onMessage: (connection, message) => void messages.push({ meta: connection.meta, message }),
      onDisconnect: () => {},
    });
    const socket = makeBunSocket({ request: "req-1" });
    await handler.open(socket);
    await handler.message(socket, new TextEncoder().encode("binary hello"));
    expect(messages).toEqual([{ meta: { request: "req-1" }, message: "binary hello" }]);
    await port.broadcast("hi");
    expect(socket.sent).toEqual(["hi"]);
    await handler.close(socket, 1000, "bye");
    expect(await port.connectionCount()).toBe(0);
  });

  it("rejects messages and closes for missing clients", async () => {
    const { handler } = createBunRealtimeHandler<SocketData>();
    const socket = makeBunSocket({ request: "req" });
    await expect(handler.message(socket, "hi")).rejects.toThrow("Message received for a missing client");
    await expect(handler.close(socket, 1000, "bye")).rejects.toThrow("Closing a missing client");
  });
});
