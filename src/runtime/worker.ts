import type { QueueJob, QueuePort } from "../ports/queue";
import type { RuntimeEnv } from "../core/types";

export type { QueueJob };
export type JobHandler = (job: QueueJob) => Promise<void>;

export async function runWorker(
  rt: RuntimeEnv,
  handlers: Record<string, JobHandler>,
): Promise<() => Promise<void>> {
  const queue: QueuePort | undefined = rt.queue;
  if (!queue) {
    throw new Error("[worker] No queue configured in RuntimeEnv");
  }
  await queue.startWorker(async (job) => {
    const handler = handlers[job.jobType];
    if (!handler) {
      rt.logger.error("No handler registered for job type", { jobId: job.jobId, jobType: job.jobType });
      throw new Error(`[worker] Unhandled job type: ${job.jobType}`);
    }
    await handler(job);
  });
  return () => queue.stopWorker();
}
