import type { RealtimeConnection, RealtimeEvents, RealtimePort } from "../ports/realtime";

export interface RealtimeSender {
  send(message: string): void;
  close(code?: number, reason?: string): void;
}

export interface RealtimeConnectOptions {
  id?: string;
  meta?: unknown;
}

interface HubEntry {
  connection: RealtimeConnection;
  sender: RealtimeSender;
}

const noopEvents: RealtimeEvents = {
  onConnect: () => {},
  onMessage: () => {},
  onDisconnect: () => {},
};

export function isWebSocketUpgradeRequest(request: { headers: { get(name: string): string | null } }): boolean {
  return request.headers.get("upgrade")?.toLowerCase() === "websocket";
}

const textDecoder = new TextDecoder();

export function decodeRealtimeMessage(data: unknown): string {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return textDecoder.decode(new Uint8Array(data));
  if (ArrayBuffer.isView(data)) return textDecoder.decode(data as Uint8Array);
  return String(data);
}

export class RealtimeHub implements RealtimePort {
  private readonly events: RealtimeEvents;
  private readonly entries = new Map<string, HubEntry>();
  private counter = 0;

  constructor(events?: RealtimeEvents) {
    this.events = events ?? noopEvents;
  }

  async connect(sender: RealtimeSender, options: RealtimeConnectOptions = {}): Promise<RealtimeConnection> {
    this.counter += 1;
    const id = options.id ?? `conn-${this.counter}`;
    const connection: RealtimeConnection = {
      id,
      meta: options.meta,
      send: (message) => sender.send(message),
      close: (code, reason) => sender.close(code, reason),
    };
    this.entries.set(id, { connection, sender });
    await this.events.onConnect(connection);
    return connection;
  }

  async incoming(id: string, message: string): Promise<boolean> {
    const entry = this.entries.get(id);
    if (!entry) return false;
    await this.events.onMessage(entry.connection, message);
    return true;
  }

  async disconnect(id: string, code?: number, reason?: string): Promise<boolean> {
    const entry = this.entries.get(id);
    if (!entry) return false;
    this.entries.delete(id);
    await this.events.onDisconnect(entry.connection, code, reason);
    return true;
  }

  async broadcast(message: string): Promise<void> {
    for (const [id, entry] of [...this.entries]) {
      try {
        entry.sender.send(message);
      } catch {
        await this.drop(id);
      }
    }
  }

  async sendTo(connectionId: string, message: string): Promise<boolean> {
    const entry = this.entries.get(connectionId);
    if (!entry) return false;
    try {
      entry.sender.send(message);
    } catch {
      await this.drop(connectionId);
      return false;
    }
    return true;
  }

  async connectionCount(): Promise<number> {
    return this.entries.size;
  }

  async closeAll(code?: number, reason?: string): Promise<void> {
    for (const id of [...this.entries.keys()]) {
      const entry = this.entries.get(id);
      if (!entry) continue;
      try {
        entry.sender.close(code, reason);
      } catch {
        // Close errors are ignored; the disconnect event still fires below.
      }
      await this.disconnect(id, code, reason);
    }
  }

  private async drop(id: string): Promise<void> {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.entries.delete(id);
    await this.events.onDisconnect(entry.connection);
  }
}
