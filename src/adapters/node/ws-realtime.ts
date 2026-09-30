import { decodeRealtimeMessage, RealtimeHub } from "../../core/realtime-hub";
import type { RealtimeEvents, RealtimePort } from "../../ports/realtime";

export interface WsSocketLike {
  on(event: "message", listener: (data: unknown, isBinary: boolean) => void): unknown;
  on(event: "close", listener: (code: number, reason: unknown) => void): unknown;
  on(event: "error", listener: (error: unknown) => void): unknown;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export interface WsServerLike {
  on(event: "connection", listener: (socket: WsSocketLike) => void): unknown;
}

export function attachWsRealtime(server: WsServerLike, events?: RealtimeEvents): RealtimePort {
  const hub = new RealtimeHub(events);

  server.on("connection", (socket) => {
    let connectionId: string | null = null;
    const ready = hub
      .connect({
        send: (message) => socket.send(message),
        close: (code, reason) => socket.close(code, reason),
      })
      .then((connection) => {
        connectionId = connection.id;
      });

    socket.on("message", (data) => {
      void ready.then(() => {
        if (connectionId) void hub.incoming(connectionId, decodeRealtimeMessage(data));
      });
    });
    socket.on("close", (code, reason) => {
      void ready.then(() => {
        if (connectionId) void hub.disconnect(connectionId, code, decodeRealtimeMessage(reason));
      });
    });
    socket.on("error", () => {
      void ready.then(() => {
        if (connectionId) void hub.disconnect(connectionId, 1011, "socket error");
      });
    });
  });

  return {
    broadcast: (message) => hub.broadcast(message),
    sendTo: (connectionId, message) => hub.sendTo(connectionId, message),
    connectionCount: () => hub.connectionCount(),
    closeAll: (code, reason) => hub.closeAll(code, reason),
  };
}
