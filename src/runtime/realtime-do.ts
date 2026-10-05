import type { GraphqlWsHandler } from "../service/graphql-ws";
import { stashDoEnv } from "./cf-hooks";

export interface RealtimeDoEnv {
  [key: string]: unknown;
}

export interface RealtimeDoState {
  acceptWebSocket(ws: WebSocket): void;
}

export interface DefineRealtimeDoOptions {
  createHandler: () => GraphqlWsHandler;
  onUpgrade?: (request: Request, env: RealtimeDoEnv) => void | Promise<void>;
}

interface HibernatableSocket extends WebSocket {
  serializeAttachment(data: unknown): void;
  deserializeAttachment(): unknown;
}

function peerIdOf(ws: WebSocket): string | undefined {
  const h = ws as Partial<HibernatableSocket>;
  if (typeof h.deserializeAttachment !== "function") return undefined;
  try {
    const att = h.deserializeAttachment() as { peerId?: unknown };
    return typeof att?.peerId === "string" ? att.peerId : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Base class factory for the GraphQL realtime Durable Object. Encapsulates:
 * stashDoEnv, WebSocketPair + hibernation, graphql-transport-ws negotiation in
 * the 101, accept→serializeAttachment ordering, and peerId routing.
 * Subscriptions still don't survive DO eviction (documented) — re-subscribe
 * from the client; attachment only carries peerId (auth via upgrade hook).
 */
export function defineRealtimeDO(opts: DefineRealtimeDoOptions) {
  return class RealtimeDO {
    gql: GraphqlWsHandler | undefined;

    constructor(
      readonly state: RealtimeDoState,
      readonly env: RealtimeDoEnv,
    ) {
      stashDoEnv({ env });
    }

    handler(): GraphqlWsHandler {
      if (!this.gql) {
        stashDoEnv({ env: this.env });
        this.gql = opts.createHandler();
      }
      return this.gql;
    }

    async fetch(request: Request): Promise<Response> {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected WebSocket", { status: 400 });
      }
      await opts.onUpgrade?.(request, this.env);
      const gql = this.handler();
      const Pair = (globalThis as { WebSocketPair?: new () => { 0: WebSocket; 1: WebSocket } }).WebSocketPair;
      if (!Pair) return new Response("WebSocketPair is not available", { status: 500 });
      const pair = new Pair();
      const client = pair[0];
      const server = pair[1] as HibernatableSocket;
      const peerId = crypto.randomUUID();
      const requested = (request.headers.get("Sec-WebSocket-Protocol") ?? "").split(",").map((p) => p.trim());
      const headers = requested.includes("graphql-transport-ws")
        ? { "Sec-WebSocket-Protocol": "graphql-transport-ws" }
        : undefined;
      // Orden importa: primero accept, después serialize.
      this.state.acceptWebSocket(server);
      server.serializeAttachment({ peerId });
      gql.open(peerId);
      return new Response(null, { status: 101, webSocket: client, headers } as ResponseInit);
    }

    async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
      const peerId = peerIdOf(ws);
      if (!peerId) {
        ws.close(1011, "sin sesion");
        return;
      }
      const text = typeof message === "string" ? message : new TextDecoder().decode(message);
      await this.handler().message({ id: peerId, send: (t) => ws.send(t), context: { peerId } }, text);
    }

    async webSocketClose(ws: WebSocket): Promise<void> {
      const peerId = peerIdOf(ws);
      if (peerId) await this.handler().close(peerId);
    }

    async webSocketError(ws: WebSocket): Promise<void> {
      const peerId = peerIdOf(ws);
      if (peerId) await this.handler().close(peerId);
    }
  };
}

/** Helper for `exports.cloudflare.ts`: re-export DO classes for the CF entrypoint. */
export function defineDoExports(classes: Record<string, unknown>): Record<string, unknown> {
  return { ...classes };
}
