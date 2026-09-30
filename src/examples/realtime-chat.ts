import { createDurableRealtime, type DurableRealtime, type DurableStateLike } from "../adapters/edge/durable-realtime";
import { type BunServerLike, createBunRealtimeHandler, handleBunUpgrade } from "../adapters/node/bun-realtime";
import { attachWsRealtime, type WsServerLike } from "../adapters/node/ws-realtime";
import type { RealtimeEvents, RealtimePort } from "../ports/realtime";

/**
 * Standard realtime wiring: one RealtimeEvents object drives every transport.
 * The relay keeps a late-bound port so handlers can broadcast back.
 *
 * - node (ws):         const relay = createChatRelay();
 *                      const port = attachWsRealtime(wss, relay.events);
 *                      relay.attachPort(port);
 * - bun:               const relay = createChatRelay();
 *                      const { handler, port } = createBunRealtimeHandler(relay.events);
 *                      relay.attachPort(port);
 *                      // fetch: if (url.pathname === "/chat") return handleBunUpgrade(server, req, data) ?? app.fetch(req);
 *                      // serve: Bun.serve({ fetch, websocket: handler, port });
 * - edge (DO class):   campo = createDurableRealtime(ctx, relay.events) en el constructor;
 *                      fetch -> campo.handleUpgrade(request, meta);
 *                      webSocketMessage -> campo.handleMessage(ws, message);
 *                      webSocketClose -> campo.handleClose(ws, code, reason).
 */
export interface ChatRelay {
  events: RealtimeEvents;
  attachPort(port: RealtimePort): void;
}

export function createChatRelay(): ChatRelay {
  let port: RealtimePort | null = null;
  const events: RealtimeEvents = {
    onConnect: (connection) => connection.send(JSON.stringify({ type: "welcome", id: connection.id })),
    onMessage: async (connection, message) => {
      if (!port) return;
      await port.broadcast(JSON.stringify({ type: "chat", from: connection.id, text: message }));
    },
    onDisconnect: async (connection) => {
      if (!port) return;
      await port.broadcast(JSON.stringify({ type: "leave", id: connection.id }));
    },
  };
  return {
    events,
    attachPort: (next) => {
      port = next;
    },
  };
}

export function attachChatToWs(server: WsServerLike): RealtimePort {
  const relay = createChatRelay();
  const port = attachWsRealtime(server, relay.events);
  relay.attachPort(port);
  return port;
}

export function createChatBunHandler<TData>(): {
  handler: ReturnType<typeof createBunRealtimeHandler<TData>>["handler"];
  port: RealtimePort;
  upgrade: (server: BunServerLike<TData>, request: Request, data: TData) => Response | null;
} {
  const relay = createChatRelay();
  const { handler, port } = createBunRealtimeHandler<TData>(relay.events);
  relay.attachPort(port);
  return { handler, port, upgrade: (server, request, data) => handleBunUpgrade(server, request, data) };
}

export function createChatRoomBehavior(state: DurableStateLike): DurableRealtime {
  const relay = createChatRelay();
  const realtime = createDurableRealtime(state, relay.events);
  relay.attachPort(realtime);
  return realtime;
}
