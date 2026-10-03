import { afterEach, describe, expect, it, vi } from "vitest";
import { cfEnv } from "../adapters/edge/cf-env";
import type { QueueJobMessage } from "../adapters/edge/queues";
import { type CfQueueBatchShape, createBatchRunner, stashDoEnv } from "./cf-hooks";
import { createTestInfra } from "./test";
import type { JobHandler } from "./worker";

afterEach(() => {
  globalThis.__env__ = undefined;
  globalThis.__do_env__ = undefined;
});

describe("stashDoEnv", () => {
  it("saves the Durable Object env for cfEnv", () => {
    stashDoEnv({ env: { DB: { tag: "do" } } });
    expect(cfEnv()).toEqual({ DB: { tag: "do" } });
  });
});

function batchMessage(body: QueueJobMessage, methods?: { ack?: () => void; retry?: () => void }) {
  return {
    body,
    ack: methods?.ack ?? (() => {}),
    retry: methods?.retry ?? (() => {}),
  };
}

describe("createBatchRunner", () => {
  it("runs handlers on edge and acks/retries per message", async () => {
    globalThis.__env__ = { QUEUE: { tag: "cf-queue" } };
    const seen: string[] = [];
    const handlers: Record<string, JobHandler> = {
      "notify.attendance": async (job) => {
        seen.push(`${job.jobType}:${job.jobId}:${job.streamId}:${job.data}`);
      },
      "boom.job": async () => {
        throw new Error("handler failed");
      },
    };
    const createRuntime = vi.fn(() => createTestInfra({ mode: "edge" }));
    const createHandlers = vi.fn(() => handlers);
    const run = createBatchRunner({ createRuntime, createHandlers });

    const acked: string[] = [];
    const retried: string[] = [];
    const batch: CfQueueBatchShape<QueueJobMessage> = {
      queue: "jobs",
      messages: [
        batchMessage({ jobId: "j1", jobType: "notify.attendance", data: "{}" }, { ack: () => acked.push("j1") }),
        batchMessage({ jobId: "j2", jobType: "unknown.job" }, { retry: () => retried.push("j2") }),
        batchMessage({ jobId: "j3", jobType: "boom.job" }, { retry: () => retried.push("j3") }),
      ],
    };
    await run({ batch });

    expect(createRuntime).toHaveBeenCalledWith(globalThis.__env__);
    expect(createHandlers).toHaveBeenCalledOnce();
    expect(seen).toEqual(["notify.attendance:j1:j1:{}"]);
    expect(acked).toEqual(["j1"]);
    expect(retried).toEqual(["j2", "j3"]);
  });

  it("throws without bindings", async () => {
    const run = createBatchRunner({
      createRuntime: () => createTestInfra({ mode: "edge" }),
      createHandlers: () => ({}),
    });
    await expect(run({ batch: { queue: "jobs", messages: [] } })).rejects.toThrow(/without bindings/);
  });
});
