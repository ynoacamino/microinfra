import { describe, expect, it } from "vitest";
import type { EdgeQueueMessage, QueueJobMessage } from "../adapters/edge/queues";
import { createTestInfra } from "./test";
import { runUniversalWorker } from "./universal-worker";

function edgeMessage(body: QueueJobMessage, events: string[]): EdgeQueueMessage<QueueJobMessage> {
  return {
    body,
    ack: () => void events.push(`ack:${body.jobId}`),
    retry: () => void events.push(`retry:${body.jobId}`),
  };
}

describe("runUniversalWorker", () => {
  it("starts a local worker on node/test runtimes", async () => {
    const rt = createTestInfra();
    const seen: string[] = [];
    const worker = await runUniversalWorker(rt, {
      attendance: async (job) => void seen.push(`attendance:${job.jobId}:${job.data}`),
    });
    expect(worker.kind).toBe("local");
    await rt.queue?.enqueueJob("j1", "attendance", '{"ok":true}');
    expect(seen).toEqual(['attendance:j1:{"ok":true}']);
    if (worker.kind === "local") {
      await worker.stop();
      expect(rt.queue?.isWorkerRunning()).toBe(false);
    }
  });

  it("returns an edge batch consumer on edge runtimes", async () => {
    const rt = createTestInfra({ mode: "edge" });
    const seen: string[] = [];
    const events: string[] = [];
    const worker = await runUniversalWorker(rt, {
      attendance: async (job) => void seen.push(`${job.jobType}:${job.jobId}:${job.streamId}`),
    });
    expect(worker.kind).toBe("edge");
    if (worker.kind === "edge") {
      await worker.onBatch({
        queue: "jobs",
        messages: [
          edgeMessage({ jobId: "e1", jobType: "attendance" }, events),
          edgeMessage({ jobId: "e2", jobType: "unknown" }, events),
        ],
      });
    }
    expect(seen).toEqual(["attendance:e1:e1"]);
    expect(events).toEqual(["ack:e1", "retry:e2"]);
  });
});
