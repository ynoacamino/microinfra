import { cfEnv } from "../adapters/edge/cf-env";
import type { EdgeQueueBatch, QueueJobMessage } from "../adapters/edge/queues";
import type { RuntimeEnv } from "../core/types";
import { runUniversalWorker } from "./universal-worker";
import type { JobHandler } from "./worker";

/**
 * Framework-agnostic Cloudflare entrypoint helpers. They operate on plain data
 * shapes and `globalThis` — no Nitro/Hono/Bun import — so any runtime wires
 * them to its own hooks with a few lines.
 */

/** Queue message as delivered by the CF runtime (readonly in the real type). */
export interface CfQueueMessageShape<T = unknown> {
  body: T;
  ack(): void;
  retry(): void;
}

/** Queue batch as delivered by the CF runtime. */
export interface CfQueueBatchShape<T = unknown> {
  queue: string;
  messages: CfQueueMessageShape<T>[];
}

export interface BatchRunnerOptions<TRuntime extends RuntimeEnv> {
  createRuntime: (bindings: Record<string, unknown>) => TRuntime;
  createHandlers: (runtime: TRuntime) => Record<string, JobHandler>;
}

/**
 * Saves Durable Object `env` for code running inside the DO (WS handlers,
 * internal stub.fetch), where the worker entrypoints that populate
 * `globalThis.__env__` never run. Wire it to your runtime's DO-init hook.
 */
export function stashDoEnv(payload: unknown): void {
  globalThis.__do_env__ = (payload as { env: Record<string, unknown> }).env;
}

/**
 * CF Queues consumer: builds the edge runtime from worker bindings and runs
 * the universal worker batch. Wire the returned function to your runtime's
 * queue hook (e.g. Nitro `cloudflare:queue`). Throws when bindings are absent,
 * same as a misconfigured worker.
 */
export function createBatchRunner<TRuntime extends RuntimeEnv>({
  createRuntime,
  createHandlers,
}: BatchRunnerOptions<TRuntime>): (payload: { batch: CfQueueBatchShape<QueueJobMessage> }) => Promise<void> {
  return async (payload: { batch: CfQueueBatchShape<QueueJobMessage> }): Promise<void> => {
    const bindings = cfEnv();
    if (!bindings) throw new Error("[edge] queue without bindings (globalThis.__env__ missing)");
    const runtime = createRuntime(bindings);
    const worker = await runUniversalWorker(runtime, createHandlers(runtime));
    if (worker.kind === "edge") {
      const batch: EdgeQueueBatch<QueueJobMessage> = {
        queue: payload.batch.queue,
        messages: payload.batch.messages.map((m) => ({ body: m.body, ack: () => m.ack(), retry: () => m.retry() })),
      };
      await worker.onBatch(batch);
    }
  };
}
