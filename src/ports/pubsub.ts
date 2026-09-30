export interface PubSubPort {
  publish<T = unknown>(channel: string, data: T): void;
  subscribe<T = unknown>(channel: string): AsyncIterable<T>;
}
