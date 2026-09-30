import { describe, expect, it } from "vitest";
import {
  createDurableRealtime,
  type DurableSocketLike,
  type DurableStateLike,
} from "../../../adapters/edge/durable-realtime";

class RecordingState implements DurableStateLike {
  accepted: DurableSocketLike[] = [];

  acceptWebSocket(socket: DurableSocketLike): void {
    void this.accepted.push(socket);
    (socket as unknown as { accept(): void }).accept();
  }

  getWebSockets(): DurableSocketLike[] {
    return [...this.accepted];
  }
}

function wsRequest(): Request {
  return new Request("https://example.com/socket", { headers: { upgrade: "websocket" } });
}

describe("durable realtime on workerd", () => {
  it("upgrades with the real WebSocketPair and delivers to a real client", async () => {
    const state = new RecordingState();
    const seen: string[] = [];
    const realtime = createDurableRealtime(state, {
      onConnect: () => {},
      onMessage: (_connection, message) => void seen.push(message),
      onDisconnect: () => {},
    });
    const response = realtime.handleUpgrade(wsRequest(), { user: "u1" });
    expect(response.status).toBe(101);
    const client = (response as unknown as { webSocket: WebSocket & { accept(): void } }).webSocket;
    expect(client).toBeDefined();

    client.accept();
    const received: string[] = [];
    client.addEventListener("message", (event) => void received.push(String(event.data)));
    await realtime.broadcast("hello client");
    const deadline = Date.now() + 5000;
    while (!received.includes("hello client") && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(received).toContain("hello client");

    const server = state.accepted[0];
    if (!server) throw new Error("socket was not accepted");
    await realtime.handleMessage(server, "ping");
    expect(seen).toEqual(["ping"]);
    await realtime.handleClose(server, 1000, "bye");
    expect(await realtime.connectionCount()).toBe(0);
  });
});
