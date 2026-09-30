import { describe, expect, it } from "vitest";
import { createTestInfra } from "./test";
import { runWorker } from "./worker";

describe("runWorker", () => {
  it("routes jobs to handlers by type and returns a stop function", async () => {
    const rt = createTestInfra();
    const seen: string[] = [];
    const stop = await runWorker(rt, {
      export: async (jobId) => void seen.push(`export:${jobId}`),
      import: async (jobId) => void seen.push(`import:${jobId}`),
    });
    await rt.queue?.enqueueJob("j1", "export");
    await rt.queue?.enqueueJob("j2", "import");
    expect(seen).toEqual(["export:j1", "import:j2"]);
    await stop();
    expect(rt.queue?.isWorkerRunning()).toBe(false);
  });

  it("throws when no queue is configured", async () => {
    const rt = { ...createTestInfra(), queue: undefined };
    await expect(runWorker(rt, {})).rejects.toThrow("[worker]");
  });

  it("rejects unhandled job types", async () => {
    const rt = createTestInfra();
    await runWorker(rt, {});
    await expect(rt.queue?.enqueueJob("j9", "unknown")).rejects.toThrow("Unhandled job type");
    await rt.queue?.stopWorker();
  });
});
