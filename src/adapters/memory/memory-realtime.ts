import { RealtimeHub } from "../../core/realtime-hub";
import type { RealtimeEvents, RealtimePort } from "../../ports/realtime";

export interface MemoryRealtimeClient {
  readonly id: string;
  readonly received: string[];
  readonly closed: boolean;
  sendToServer(message: string): Promise<void>;
  closeFromClient(code?: number, reason?: string): Promise<void>;
}

export interface MemoryRealtime extends RealtimePort {
  connectClient(id?: string): Promise<MemoryRealtimeClient>;
}

export function createMemoryRealtime(events?: RealtimeEvents): MemoryRealtime {
  const hub = new RealtimeHub(events);
  return {
    broadcast: (message) => hub.broadcast(message),
    sendTo: (connectionId, message) => hub.sendTo(connectionId, message),
    connectionCount: () => hub.connectionCount(),
    closeAll: (code, reason) => hub.closeAll(code, reason),
    connectClient: async (id) => {
      const received: string[] = [];
      let closed = false;
      const connection = await hub.connect(
        {
          send: (message) => {
            received.push(message);
          },
          close: () => {
            closed = true;
          },
        },
        { id },
      );
      return {
        id: connection.id,
        received,
        get closed() {
          return closed;
        },
        sendToServer: async (message) => {
          await hub.incoming(connection.id, message);
        },
        closeFromClient: async (code, reason) => {
          await hub.disconnect(connection.id, code, reason);
        },
      };
    },
  };
}
