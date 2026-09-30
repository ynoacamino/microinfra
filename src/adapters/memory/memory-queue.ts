import type { QueueJob, QueuePort } from "../../ports/queue";

interface Job {
  jobId: string;
  jobType: string;
  streamId: string;
  data?: string;
}

export function createMemoryQueue(): QueuePort {
  const pending: Job[] = [];
  const acked = new Set<string>();
  let running = false;
  let worker: ((job: QueueJob) => Promise<void>) | null = null;
  let counter = 0;

  async function drain(): Promise<void> {
    if (!running || !worker) return;
    const next = pending.shift();
    if (!next) return;
    await worker(next);
    acked.add(next.streamId);
    await drain();
  }

  return {
    enqueueJob: async (jobId, jobType, data) => {
      counter += 1;
      const job: Job = { jobId, jobType, streamId: `mem-${counter}` };
      if (data !== undefined) {
        job.data = data;
      }
      pending.push(job);
      if (running) await drain();
      return true;
    },
    processNextJob: async () => pending.shift() ?? null,
    ackJob: async (streamId) => {
      acked.add(streamId);
    },
    startWorker: async (onJob) => {
      worker = onJob;
      running = true;
      await drain();
    },
    stopWorker: async () => {
      running = false;
      worker = null;
    },
    isWorkerRunning: () => running,
  };
}
