import { describe, expect, it } from "vitest";
import type { QueuePort } from "../../ports/queue";

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export function describeQueueContract(name: string, makeQueue: () => QueuePort | Promise<QueuePort>): void {
  describe(`QueuePort contract [${name}]`, () => {
    it("enqueues, dequeues and acknowledges jobs", async () => {
      const queue = await makeQueue();
      const jobId = `job-${crypto.randomUUID()}`;
      expect(await queue.enqueueJob(jobId, "export")).toBe(true);
      const next = await queue.processNextJob();
      expect(next?.jobId).toBe(jobId);
      expect(next?.jobType).toBe("export");
      if (next) await queue.ackJob(next.streamId);
      expect(await queue.processNextJob()).toBeNull();
      await queue.stopWorker();
    });

    it("delivers enqueued jobs to a running worker", async () => {
      const queue = await makeQueue();
      const seen: Array<{ jobId: string; jobType: string }> = [];
      await queue.startWorker(async (job) => void seen.push({ jobId: job.jobId, jobType: job.jobType }));
      expect(queue.isWorkerRunning()).toBe(true);
      const jobId = `job-${crypto.randomUUID()}`;
      await queue.enqueueJob(jobId, "export");
      const deadline = Date.now() + 10_000;
      while (!seen.some((entry) => entry.jobId === jobId) && Date.now() < deadline) {
        await sleep(50);
      }
      expect(seen).toContainEqual({ jobId, jobType: "export" });
      await queue.stopWorker();
      expect(queue.isWorkerRunning()).toBe(false);
    });
  });
}
