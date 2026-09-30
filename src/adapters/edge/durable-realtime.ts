import { decodeRealtimeMessage, isWebSocketUpgradeRequest, RealtimeHub } from "../../core/realtime-hub";
import type { RealtimeEvents, RealtimePort } from "../../ports/realtime";

export interface DurableSocketLike {
  send(message: string): void;
  close(code?: number, reason?: string): void;
  serializeAttachment?(data: unknown): void;
  deserializeAttachment?(): unknown;
}

export interface DurableStateLike {
  acceptWebSocket(socket: DurableSocketLike, tags?: string[]): void;
  getWebSockets(tag?: string): DurableSocketLike[];
}

export interface DurableSocketPair {
  client: unknown;
  server: DurableSocketLike;
}

declare const WebSocketPair: undefined | { new (): { 0: DurableSocketLike; 1: DurableSocketLike } };

export interface DurableUpgradeSockets {
  createPair?: () => DurableSocketPair;
  respond?: (client: unknown) => Response;
}

export interface DurableRealtime extends RealtimePort {
  handleUpgrade(request: Request, meta?: unknown, sockets?: DurableUpgradeSockets): Response;
  handleMessage(ws: DurableSocketLike, message: string | ArrayBuffer): Promise<void>;
  handleClose(ws: DurableSocketLike, code: number, reason: string): Promise<void>;
}

function defaultPair(): DurableSocketPair | null {
  if (typeof WebSocketPair === "undefined") return null;
  const pair = new WebSocketPair();
  return { client: pair[0], server: pair[1] };
}

function upgradeResponse(client: unknown): Response {
  return new Response(null, { status: 101, webSocket: client } as ResponseInit);
}

export function createDurableRealtime(state: DurableStateLike, events?: RealtimeEvents): DurableRealtime {
  const hub = new RealtimeHub(events);
  const ids = new Map<DurableSocketLike, string>();

  function register(ws: DurableSocketLike, meta: unknown): void {
    void hub
      .connect(
        {
          send: (message) => ws.send(message),
          close: (code, reason) => ws.close(code, reason),
        },
        { meta },
      )
      .then((connection) => {
        ids.set(ws, connection.id);
      });
  }

  async function ensureConnection(ws: DurableSocketLike): Promise<string> {
    const known = ids.get(ws);
    if (known) return known;
    const meta = typeof ws.deserializeAttachment === "function" ? ws.deserializeAttachment() : undefined;
    const connection = await hub.connect(
      {
        send: (message) => ws.send(message),
        close: (code, reason) => ws.close(code, reason),
      },
      { meta },
    );
    ids.set(ws, connection.id);
    return connection.id;
  }

  return {
    broadcast: (message) => hub.broadcast(message),
    sendTo: (connectionId, message) => hub.sendTo(connectionId, message),
    connectionCount: () => hub.connectionCount(),
    closeAll: (code, reason) => hub.closeAll(code, reason),
    handleUpgrade: (request, meta, sockets) => {
      if (!isWebSocketUpgradeRequest(request)) {
        return new Response("Expected WebSocket", { status: 400 });
      }
      const pair = sockets?.createPair ? sockets.createPair() : defaultPair();
      if (!pair) return new Response("WebSocketPair is not available", { status: 500 });
      state.acceptWebSocket(pair.server);
      if (meta !== undefined && typeof pair.server.serializeAttachment === "function") {
        pair.server.serializeAttachment(meta);
      }
      register(pair.server, meta);
      const respond = sockets?.respond ?? upgradeResponse;
      return respond(pair.client);
    },
    handleMessage: async (ws, message) => {
      const id = await ensureConnection(ws);
      await hub.incoming(id, decodeRealtimeMessage(message));
    },
    handleClose: async (ws, code, reason) => {
      const id = await ensureConnection(ws);
      ids.delete(ws);
      await hub.disconnect(id, code, reason);
    },
  };
}
