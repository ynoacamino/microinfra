import type { EnvConfig } from "../../ports/config";
import type { LoggerPort } from "../../ports/logger";
import type { PubSubPort } from "../../ports/pubsub";
import { createNoopLogger } from "../memory/loggers";
import { parseRedisFields, sendRedisCommand, sendRedisPipeline } from "./redis-http";
import { isStreamsConfigured } from "./redis-streams";

export interface RedisPubSubOptions {
  prefix?: string;
  pollIntervalMs?: number;
  batchSize?: number;
  maxLen?: number;
  logger?: LoggerPort;
}

const DEFAULT_PREFIX = "microinfra:pubsub";
const OUTBOX_TTL_MS = 60_000;
const OUTBOX_MAX = 1000;

interface StreamEntry {
  id: string;
  mid: string | undefined;
  data: unknown;
}

interface OutboxEntry {
  channel: string;
  mid: string;
  data: unknown;
  at: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodePayload(raw: string | undefined): unknown {
  if (raw === undefined) {
    return undefined;
  }
  try {
    return (JSON.parse(raw) as { data: unknown }).data;
  } catch {
    return raw;
  }
}

/**
 * Fan-out PubSub over Redis Streams via HTTP (SRH/Upstash).
 * Each channel maps to a stream; subscribers poll with XREAD from a cursor
 * captured eagerly at subscribe() time, so only messages published after
 * subscribing are delivered (memory parity, at-least-once within the
 * subscribe handshake window, deduplicated by message id).
 */
export class RedisStreamsPubSub implements PubSubPort {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly prefix: string;
  private readonly pollIntervalMs: number;
  private readonly batchSize: number;
  private readonly maxLen: number;
  private readonly logger: LoggerPort;
  private readonly outbox: OutboxEntry[] = [];

  constructor(config: EnvConfig, opts: RedisPubSubOptions = {}) {
    if (!isStreamsConfigured(config)) {
      throw new Error("[pubsub] Redis is not configured (UPSTASH_REDIS_REST_URL/TOKEN)");
    }
    this.baseUrl = config.redis.url as string;
    this.token = config.redis.token as string;
    this.prefix = opts.prefix ?? DEFAULT_PREFIX;
    this.pollIntervalMs = opts.pollIntervalMs ?? 250;
    this.batchSize = opts.batchSize ?? 50;
    this.maxLen = opts.maxLen ?? 500;
    this.logger = opts.logger ?? createNoopLogger();
  }

  private streamFor(channel: string): string {
    return `${this.prefix}:${channel}`;
  }

  private pruneOutbox(now: number): void {
    while (this.outbox.length > 0) {
      const oldest = this.outbox[0];
      if (oldest && now - oldest.at < OUTBOX_TTL_MS) {
        break;
      }
      this.outbox.shift();
    }
  }

  private drainOutbox(channel: string, subscribedAt: number, seen: Set<string>): unknown[] {
    const now = Date.now();
    this.pruneOutbox(now);
    const pending: unknown[] = [];
    for (const entry of this.outbox) {
      if (entry.channel !== channel || entry.at < subscribedAt || seen.has(entry.mid)) {
        continue;
      }
      seen.add(entry.mid);
      pending.push(entry.data);
    }
    return pending;
  }

  private async latestId(stream: string): Promise<string> {
    try {
      const result = await sendRedisCommand(this.baseUrl, this.token, ["XREVRANGE", stream, "+", "-", "COUNT", "1"]);
      if (Array.isArray(result) && result.length > 0) {
        const first = result[0];
        if (Array.isArray(first) && typeof first[0] === "string") {
          return first[0];
        }
      }
    } catch (error) {
      this.logger.debug("Failed to read latest stream id, starting from zero", {
        stream,
        error: String(error),
      });
    }
    return "0-0";
  }

  private async readSince(stream: string, cursor: string): Promise<StreamEntry[]> {
    const result = await sendRedisCommand(this.baseUrl, this.token, [
      "XREAD",
      "COUNT",
      String(this.batchSize),
      "STREAMS",
      stream,
      cursor,
    ]);
    const entries: StreamEntry[] = [];
    if (!Array.isArray(result) || result.length === 0) {
      return entries;
    }
    const first = result[0];
    if (!Array.isArray(first)) {
      return entries;
    }
    const rawEntries = first[1];
    if (!Array.isArray(rawEntries)) {
      return entries;
    }
    for (const raw of rawEntries) {
      if (!Array.isArray(raw)) {
        continue;
      }
      const [id, rawFields] = raw;
      if (typeof id !== "string") {
        continue;
      }
      const fields = parseRedisFields(rawFields);
      entries.push({ id, mid: fields.mid, data: decodePayload(fields.data) });
    }
    return entries;
  }

  publish(channel: string, data: unknown): void {
    const mid = crypto.randomUUID();
    let payload: string;
    try {
      payload = JSON.stringify({ data });
    } catch (error) {
      this.logger.error("Failed to serialize pubsub payload", { channel, error: String(error) });
      return;
    }
    this.outbox.push({ channel, mid, data, at: Date.now() });
    if (this.outbox.length > OUTBOX_MAX) {
      this.outbox.splice(0, this.outbox.length - OUTBOX_MAX);
    }
    const stream = this.streamFor(channel);
    void sendRedisPipeline(this.baseUrl, this.token, [
      ["XADD", stream, "*", "data", payload, "mid", mid],
      ["XTRIM", stream, "MAXLEN", String(this.maxLen)],
    ]).catch((error: unknown) => {
      this.logger.error("Failed to publish pubsub message", { channel, error: String(error) });
    });
  }

  subscribe<T = unknown>(channel: string): AsyncIterable<T> & { close(): void | Promise<void> } {
    const self = this;
    const stream = this.streamFor(channel);
    const subscribedAt = Date.now();
    const cursorPromise = this.latestId(stream);
    let cancelled = false;

    async function* iterator(): AsyncGenerator<T> {
      const seen = new Set<string>();
      try {
        for (const local of self.drainOutbox(channel, subscribedAt, seen)) {
          if (cancelled) {
            break;
          }
          yield local as T;
        }
        let cursor = await cursorPromise;
        for (;;) {
          if (cancelled) {
            break;
          }
          for (const local of self.drainOutbox(channel, subscribedAt, seen)) {
            if (cancelled) {
              break;
            }
            yield local as T;
          }
          if (cancelled) {
            break;
          }
          let entries: StreamEntry[];
          try {
            entries = await self.readSince(stream, cursor);
          } catch (error) {
            self.logger.error("Failed to poll pubsub stream", { channel, error: String(error) });
            await sleep(self.pollIntervalMs);
            continue;
          }
          for (const entry of entries) {
            if (cancelled) {
              break;
            }
            cursor = entry.id;
            if (entry.mid && seen.has(entry.mid)) {
              continue;
            }
            if (entry.mid) {
              seen.add(entry.mid);
            }
            yield entry.data as T;
          }
          await sleep(self.pollIntervalMs);
        }
      } finally {
        cancelled = true;
      }
    }

    return {
      [Symbol.asyncIterator]() {
        return iterator();
      },
      close() {
        cancelled = true;
      },
    };
  }
}

export function createRedisStreamsPubSub(config: EnvConfig, opts: RedisPubSubOptions = {}): PubSubPort {
  return new RedisStreamsPubSub(config, opts);
}
