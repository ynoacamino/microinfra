import type { EnvConfig } from "../../ports/config";
import type { LoggerPort } from "../../ports/logger";
import type { QueueJob, QueuePort } from "../../ports/queue";
import { createNoopLogger } from "../memory/loggers";

export interface RedisStreamsOptions {
  stream?: string;
  group?: string;
  consumer?: string;
  pollIntervalMs?: number;
  staleMinIdleMs?: number;
  logger?: LoggerPort;
}

const DEFAULT_STREAM = "microinfra:jobs";
const DEFAULT_GROUP = "microinfra-processors";

export function isStreamsConfigured(config: EnvConfig): boolean {
  return Boolean(config.redis.url && config.redis.token);
}

interface CommandResult {
  result: unknown;
}

async function sendCommand(baseUrl: string, token: string, command: unknown[]): Promise<unknown> {
  const normalized = baseUrl.replace(/\/$/, "");
  const res = await fetch(`${normalized}/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  if (!res.ok) throw new Error(`[queue] Upstash error: ${res.status}`);
  const body = (await res.json()) as CommandResult;
  return body.result;
}

async function sendPipeline(baseUrl: string, token: string, commands: unknown[][]): Promise<unknown[]> {
  const normalized = baseUrl.replace(/\/$/, "");
  const res = await fetch(`${normalized}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`[queue] Upstash error: ${res.status}`);
  const body = (await res.json()) as Array<CommandResult>;
  return body.map((entry) => entry.result);
}

function parseEntry(entry: unknown): QueueJob | null {
  if (!Array.isArray(entry)) return null;
  const [streamId, rawFields] = entry;
  if (typeof streamId !== "string" || !Array.isArray(rawFields)) return null;
  const fields: Record<string, string> = {};
  for (let i = 0; i < rawFields.length; i += 2) {
    const key = rawFields[i];
    const value = rawFields[i + 1];
    if (typeof key !== "string" || value === undefined) continue;
    fields[key] = String(value);
  }
  if (!streamId || !fields.jobId || !fields.jobType) return null;
  return { streamId, jobId: fields.jobId, jobType: fields.jobType };
}

export class RedisStreamsQueue implements QueuePort {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly stream: string;
  private readonly group: string;
  private readonly consumer: string;
  private readonly pollIntervalMs: number;
  private readonly staleMinIdleMs: number;
  private readonly logger: LoggerPort;
  private running = false;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private groupReady = false;

  constructor(config: EnvConfig, opts: RedisStreamsOptions = {}) {
    this.baseUrl = config.redis.url as string;
    this.token = config.redis.token as string;
    this.stream = opts.stream ?? DEFAULT_STREAM;
    this.group = opts.group ?? DEFAULT_GROUP;
    this.consumer = opts.consumer ?? `worker-${crypto.randomUUID().slice(0, 8)}`;
    this.pollIntervalMs = opts.pollIntervalMs ?? 1000;
    this.staleMinIdleMs = opts.staleMinIdleMs ?? 60_000;
    this.logger = opts.logger ?? createNoopLogger();
  }

  private async ensureGroup(): Promise<void> {
    if (this.groupReady) return;
    try {
      await sendCommand(this.baseUrl, this.token, ["XGROUP", "CREATE", this.stream, this.group, "0", "MKSTREAM"]);
    } catch {
      this.logger.debug("Consumer group already exists", { group: this.group });
    }
    this.groupReady = true;
  }

  async enqueueJob(jobId: string, jobType: string): Promise<boolean> {
    try {
      await this.ensureGroup();
      await sendCommand(this.baseUrl, this.token, [
        "XADD",
        this.stream,
        "*",
        "jobId",
        jobId,
        "jobType",
        jobType,
        "enqueuedAt",
        Date.now().toString(),
      ]);
      return true;
    } catch (error) {
      this.logger.error("Failed to enqueue job", { jobId, jobType, error: String(error) });
      return false;
    }
  }

  async processNextJob(): Promise<QueueJob | null> {
    try {
      const result = await sendCommand(this.baseUrl, this.token, [
        "XREADGROUP",
        "GROUP",
        this.group,
        this.consumer,
        "STREAMS",
        this.stream,
        ">",
      ]);
      if (!Array.isArray(result) || result.length === 0) return null;
      const first = result[0];
      if (!Array.isArray(first)) return null;
      const entries = first[1];
      if (!Array.isArray(entries) || entries.length === 0) return null;
      return parseEntry(entries[0]);
    } catch (error) {
      this.logger.error("Failed to read from stream", { error: String(error) });
      return null;
    }
  }

  async ackJob(streamId: string): Promise<void> {
    await sendPipeline(this.baseUrl, this.token, [
      ["XACK", this.stream, this.group, streamId],
      ["XDEL", this.stream, streamId],
    ]);
  }

  async reclaimStaleEntries(minIdleMs = this.staleMinIdleMs): Promise<QueueJob[]> {
    const claimed: QueueJob[] = [];
    try {
      let cursor: unknown = "0-0";
      for (let i = 0; i < 10; i++) {
        const result = await sendCommand(this.baseUrl, this.token, [
          "XAUTOCLAIM",
          this.stream,
          this.group,
          this.consumer,
          String(minIdleMs),
          String(cursor),
          "COUNT",
          "10",
        ]);
        if (!Array.isArray(result) || result.length < 2) break;
        const [nextCursor, entries] = result;
        if (Array.isArray(entries)) {
          for (const entry of entries) {
            const parsed = parseEntry(entry);
            if (parsed) claimed.push(parsed);
          }
        }
        if (typeof nextCursor !== "string" || nextCursor === "0-0") break;
        cursor = nextCursor;
      }
    } catch (error) {
      this.logger.error("Failed to reclaim stale entries", { error: String(error) });
    }
    return claimed;
  }

  async startWorker(onJob: (job: QueueJob) => Promise<void>): Promise<void> {
    await this.ensureGroup();

    this.running = true;
    const stale = await this.reclaimStaleEntries();
    for (const job of stale) {
      await this.runJob(onJob, job);
      if (!this.running) return;
    }

    const poll = async (): Promise<void> => {
      if (!this.running) return;
      const job = await this.processNextJob();
      if (job) {
        await this.runJob(onJob, job);
      }
      if (this.running) {
        this.pollTimer = setTimeout(() => void poll(), this.pollIntervalMs);
      }
    };
    await poll();
  }

  async stopWorker(): Promise<void> {
    this.running = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  isWorkerRunning(): boolean {
    return this.running;
  }

  private async runJob(onJob: (job: QueueJob) => Promise<void>, job: QueueJob): Promise<void> {
    try {
      await onJob(job);
      await this.ackJob(job.streamId);
    } catch (error) {
      this.logger.error("Job failed, left pending in the stream", { jobId: job.jobId, error: String(error) });
    }
  }
}

export function createRedisStreamsQueue(config: EnvConfig, opts: RedisStreamsOptions = {}): QueuePort {
  return new RedisStreamsQueue(config, opts);
}
