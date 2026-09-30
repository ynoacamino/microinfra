export interface RealtimeConnection {
  readonly id: string;
  readonly meta?: unknown;
  send(message: string): void;
  close(code?: number, reason?: string): void;
}

export interface RealtimeEvents {
  onConnect(connection: RealtimeConnection): void | Promise<void>;
  onMessage(connection: RealtimeConnection, message: string): void | Promise<void>;
  onDisconnect(connection: RealtimeConnection, code?: number, reason?: string): void | Promise<void>;
}

export interface RealtimePort {
  broadcast(message: string): Promise<void>;
  sendTo(connectionId: string, message: string): Promise<boolean>;
  connectionCount(): Promise<number>;
  closeAll(code?: number, reason?: string): Promise<void>;
}
