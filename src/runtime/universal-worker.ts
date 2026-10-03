import { createQueueConsumer, type EdgeQueueBatch, type QueueJobMessage } from "../adapters/edge/queues";
import type { RuntimeEnv } from "../core/types";
import type { QueueJob } from "../ports/queue";
import { type JobHandler, runWorker } from "./worker";

export type UniversalWorker =
  | { kind: "local"; stop: () => Promise<void> }
  | { kind: "edge"; onBatch: (batch: EdgeQueueBatch<QueueJobMessage>) => Promise<void> };

function adaptToEdge(
  handlers: Record<string, JobHandler>,
): Record<string, (message: QueueJobMessage) => Promise<void>> {
  return Object.fromEntries(
    Object.entries(handlers).map(([jobType, handler]) => [
      jobType,
      async (message: QueueJobMessage) => {
        const job: QueueJob = {
          jobId: message.jobId,
          jobType: message.jobType,
          streamId: message.jobId,
          data: message.data,
        };
        await handler(job);
      },
    ]),
  );
}

/**
 * Starts background job processing on any runtime. On node/test it polls via
 * runWorker and returns a stop function; on edge (no polling allowed) it
 * returns an onBatch consumer for the worker queue() entrypoint.
 */
export async function runUniversalWorker(
  rt: RuntimeEnv,
  handlers: Record<string, JobHandler>,
): Promise<UniversalWorker> {
  if (rt.mode === "edge") {
    return { kind: "edge", onBatch: createQueueConsumer(adaptToEdge(handlers)) };
  }
  const stop = await runWorker(rt, handlers);
  return { kind: "local", stop };
}
