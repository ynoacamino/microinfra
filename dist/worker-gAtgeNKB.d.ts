import { c as QueueJob, l as QueuePort } from "./pubsub-6-hdisbt.js";
import { t as RuntimeEnv } from "./types-CD7cOcEI.js";
//#region src/adapters/edge/queues.d.ts
interface QueueJobMessage {
  jobId: string;
  jobType: string;
  /** Optional opaque payload (JSON recommended). */
  data?: string;
}
interface EdgeQueueBinding {
  send(message: QueueJobMessage): Promise<void>;
}
interface EdgeQueueMessage<T = unknown> {
  body: T;
  ack(): void;
  retry(): void;
}
interface EdgeQueueBatch<T = unknown> {
  messages: EdgeQueueMessage<T>[];
  queue: string;
}
declare function isQueueBindingConfigured(binding?: {
  send?: unknown;
}): boolean;
declare function createQueuesQueue(binding: EdgeQueueBinding): QueuePort;
type EdgeJobHandler = (job: QueueJobMessage) => Promise<void>;
declare function createQueueConsumer(handlers: Record<string, EdgeJobHandler>): (batch: EdgeQueueBatch<QueueJobMessage>) => Promise<void>;
//#endregion
//#region src/runtime/worker.d.ts
type JobHandler = (job: QueueJob) => Promise<void>;
declare function runWorker(rt: RuntimeEnv, handlers: Record<string, JobHandler>): Promise<() => Promise<void>>;
//#endregion
export { EdgeQueueBinding as a, createQueueConsumer as c, EdgeQueueBatch as i, createQueuesQueue as l, runWorker as n, EdgeQueueMessage as o, EdgeJobHandler as r, QueueJobMessage as s, JobHandler as t, isQueueBindingConfigured as u };
//# sourceMappingURL=worker-gAtgeNKB.d.ts.map