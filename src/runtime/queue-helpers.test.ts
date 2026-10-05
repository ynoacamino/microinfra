import { describe, expect, it, vi } from "vitest";
import { enqueueJobAndWait, ensureWorkerStarted } from "./queue-helpers";
import { createTestInfra } from "./test";

describe("enqueueJobAndWait", () => {
  it("registers waitUntil when available", async () => {
    const rt = createTestInfra();
    const waitUntil = vi.fn();
    (globalThis as Record<string, unknown>).waitUntil = waitUntil;
    await enqueueJobAndWait(rt, "j-w", "export");
    expect(waitUntil).toHaveBeenCalledOnce();
    delete (globalThis as Record<string, unknown>).waitUntil;
  });

  it("enqueues and resolves true", async () => {
    const rt = createTestInfra();
    await expect(enqueueJobAndWait(rt, "j1", "export", "{}")).resolves.toBe(true);
    const job = await rt.queue?.processNextJob();
    expect(job?.jobId).toBe("j1");
  });

  it("throws without queue", async () => {
    const rt = createTestInfra();
    const noQueue = { ...rt, queue: undefined };
    await expect(enqueueJobAndWait(noQueue, "j1", "export")).rejects.toThrow("[microinfra] No queue configured");
  });
});

describe("ensureWorkerStarted", () => {
  it("returns stop on first try", async () => {
    const rt = createTestInfra();
    const stop = await ensureWorkerStarted(rt, async () => async () => {});
    await stop();
  });

  it("retries then succeeds", async () => {
    const rt = createTestInfra({ silent: true });
    let calls = 0;
    const stop = await ensureWorkerStarted(
      rt,
      async () => {
        calls += 1;
        if (calls < 3) throw new Error("redis down");
        return async () => {};
      },
      { retries: 3, retryDelayMs: 1 },
    );
    expect(calls).toBe(3);
    await stop();
  });

  it("throws after exhausting retries", async () => {
    const rt = createTestInfra({ silent: true });
    await expect(
      ensureWorkerStarted(
        rt,
        async () => {
          throw new Error("always down");
        },
        { retries: 1, retryDelayMs: 1 },
      ),
    ).rejects.toThrow("always down");
  });
});
