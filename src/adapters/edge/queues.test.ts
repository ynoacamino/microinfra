import { describe, expect, it } from "vitest";
import {
  createQueueConsumer,
  createQueuesQueue,
  type EdgeQueueBatch,
  isQueueBindingConfigured,
  type QueueJobMessage,
} from "./queues";

function makeBinding() {
  const sent: QueueJobMessage[] = [];
  return {
    sent,
    binding: { send: async (message: QueueJobMessage) => void sent.push(message) },
  };
}

function makeMessage(body: QueueJobMessage) {
  const state = { acked: false, retried: false };
  const markAcked = (): void => {
    state.acked = true;
  };
  const markRetried = (): void => {
    state.retried = true;
  };
  return {
    state,
    message: {
      body,
      ack: () => markAcked(),
      retry: () => markRetried(),
    },
  };
}

function makeBatch(bodies: QueueJobMessage[]): {
  batch: EdgeQueueBatch<QueueJobMessage>;
  states: Array<{ acked: boolean; retried: boolean }>;
} {
  const wrapped = bodies.map((body) => makeMessage(body));
  return {
    batch: { queue: "jobs", messages: wrapped.map((entry) => entry.message) },
    states: wrapped.map((entry) => entry.state),
  };
}

describe("queues producer", () => {
  it("sends job payloads through the binding", async () => {
    const { sent, binding } = makeBinding();
    const queue = createQueuesQueue(binding);
    expect(isQueueBindingConfigured(binding)).toBe(true);
    expect(isQueueBindingConfigured({})).toBe(false);
    expect(isQueueBindingConfigured()).toBe(false);
    expect(await queue.enqueueJob("j1", "export")).toBe(true);
    expect(sent).toEqual([{ jobId: "j1", jobType: "export" }]);
    expect(await queue.processNextJob()).toBeNull();
    await queue.ackJob("anything");
    await expect(queue.startWorker(async () => {})).rejects.toThrow("Polling is not supported");
    await queue.stopWorker();
    expect(queue.isWorkerRunning()).toBe(false);
  });
});

describe("queue consumer", () => {
  it("routes messages to handlers and acks successes", async () => {
    const seen: string[] = [];
    const consume = createQueueConsumer({ export: async (job) => void seen.push(job.jobId) });
    const { batch, states } = makeBatch([
      { jobId: "j1", jobType: "export" },
      { jobId: "j2", jobType: "unknown" },
    ]);
    await consume(batch);
    expect(seen).toEqual(["j1"]);
    expect(states[0]).toEqual({ acked: true, retried: false });
    expect(states[1]).toEqual({ acked: false, retried: true });
  });

  it("retries messages whose handler throws", async () => {
    const consume = createQueueConsumer({
      export: async () => {
        throw new Error("boom");
      },
    });
    const { batch, states } = makeBatch([{ jobId: "j1", jobType: "export" }]);
    await consume(batch);
    expect(states[0]).toEqual({ acked: false, retried: true });
  });
});
