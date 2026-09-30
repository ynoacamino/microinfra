import { decodeRealtimeMessage, isWebSocketUpgradeRequest, RealtimeHub } from "../../core/realtime-hub";
import type { RealtimeEvents, RealtimePort } from "../../ports/realtime";

export interface BunSocketLike<TData = unknown> {
  readonly data: TData;
  sendText(message: string): void;
  close(code?: number, reason?: string): void;
}

export interface BunServerLike<TData = unknown> {
  upgrade(request: Request, options?: { data?: TData; headers?: Record<string, string> }): boolean;
}

export interface BunWsHandler<TData = unknown> {
  open(ws: BunSocketLike<TData>): void | Promise<void>;
  message(ws: BunSocketLike<TData>, message: string | ArrayBuffer | Uint8Array): void | Promise<void>;
  close(ws: BunSocketLike<TData>, code: number, reason: string): void | Promise<void>;
}

export function handleBunUpgrade<TData>(server: BunServerLike<TData>, request: Request, data: TData): Response | null {
  if (!isWebSocketUpgradeRequest(request)) return null;
  const upgraded = server.upgrade(request, { data });
  if (!upgraded) return new Response("Internal Server Error", { status: 500 });
  return new Response();
}

export function createBunRealtimeHandler<TData = unknown>(
  events?: RealtimeEvents,
): {
  handler: BunWsHandler<TData>;
  port: RealtimePort;
} {
  const hub = new RealtimeHub(events);
  const ids = new WeakMap<BunSocketLike<TData>, string>();
  const port: RealtimePort = {
    broadcast: (message) => hub.broadcast(message),
    sendTo: (connectionId, message) => hub.sendTo(connectionId, message),
    connectionCount: () => hub.connectionCount(),
    closeAll: (code, reason) => hub.closeAll(code, reason),
  };
  const handler: BunWsHandler<TData> = {
    open: async (ws) => {
      const connection = await hub.connect(
        {
          send: (message) => ws.sendText(message),
          close: (code, reason) => ws.close(code, reason),
        },
        { meta: ws.data },
      );
      ids.set(ws, connection.id);
    },
    message: async (ws, message) => {
      const id = ids.get(ws);
      if (!id) throw new Error("Message received for a missing client");
      await hub.incoming(id, decodeRealtimeMessage(message));
    },
    close: async (ws, code, reason) => {
      const id = ids.get(ws);
      if (!id) throw new Error("Closing a missing client");
      await hub.disconnect(id, code, reason);
    },
  };
  return { handler, port };
}
