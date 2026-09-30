import { describe, expect, it } from "vitest";
import { createConsoleLogger, createNoopLogger } from "./loggers";
import { createMapEnv } from "./map-env";
import { createMemoryCache } from "./memory-cache";
import { createMemoryObjects } from "./memory-objects";
import { createMemoryPubSub } from "./memory-pubsub";
import { createMemoryQueue } from "./memory-queue";
import { createNoopCache } from "./noop-cache";
import { createSystemClock } from "./system-clock";
import { createUuidIds } from "./uuid-ids";

describe("map-env", () => {
  it("get/getRequired/all", () => {
    const env = createMapEnv({ A: "1" });
    expect(env.get("A")).toBe("1");
    expect(env.get("B")).toBeUndefined();
    expect(env.getRequired("A")).toBe("1");
    expect(() => env.getRequired("B")).toThrow();
    expect(env.all()).toEqual({ A: "1" });
  });
});

describe("memory-cache", () => {
  it("put/get/delete/list", async () => {
    const cache = createMemoryCache();
    await cache.put("a:1", "x");
    await cache.put("a:2", "y");
    expect(await cache.get("a:1")).toBe("x");
    expect(await cache.list("a:")).toEqual(["a:1", "a:2"]);
    await cache.delete("a:1");
    expect(await cache.get("a:1")).toBeNull();
  });
});

describe("noop-cache", () => {
  it("always reads empty", async () => {
    const cache = createNoopCache();
    await cache.put("k", "v");
    expect(await cache.get("k")).toBeNull();
    expect(await cache.list()).toEqual([]);
  });
});

describe("loggers", () => {
  it("noop no lanza y child encadena", () => {
    const log = createNoopLogger();
    expect(() => log.child("a").info("hola")).not.toThrow();
  });
  it("console delega sin lanzar", () => {
    const log = createConsoleLogger("t");
    expect(() => log.child("a").info("hola", { x: 1 })).not.toThrow();
    expect(() => log.error("ups", new Error("e"))).not.toThrow();
  });
});

describe("clock/ids", () => {
  it("system clock y uuid", () => {
    const clock = createSystemClock();
    expect(clock.now()).toBeInstanceOf(Date);
    expect(typeof clock.nowMs()).toBe("number");
    const ids = createUuidIds();
    expect(ids.createId()).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("memory-objects", () => {
  it("put/read/delete/urls/key", async () => {
    const objects = createMemoryObjects();
    const key = objects.generateKey("media");
    await objects.put(key, new TextEncoder().encode("hola"), { contentType: "text/plain" });
    expect(new TextDecoder().decode(await objects.read(key))).toBe("hola");
    expect(objects.getPublicUrl(key)).toContain(key);
    expect(await objects.getSignedUrl(key)).toContain(key);
    await objects.delete(key);
    await expect(objects.read(key)).rejects.toThrow();
  });
});

describe("memory-pubsub", () => {
  it("delivers published messages to subscribers", async () => {
    const pubsub = createMemoryPubSub();
    const sub = pubsub.subscribe<string>("ch");
    pubsub.publish("ch", "hola");
    const iterator = sub[Symbol.asyncIterator]();
    const first = await iterator.next();
    expect(first.value).toBe("hola");
    await iterator.return?.(undefined);
  });
});

describe("memory-queue", () => {
  it("enqueue/process/ack + worker inline", async () => {
    const queue = createMemoryQueue();
    expect(queue.isWorkerRunning()).toBe(false);
    await queue.enqueueJob("j1", "export");
    const next = await queue.processNextJob();
    expect(next?.jobId).toBe("j1");
    await queue.ackJob(next?.streamId ?? "");
    expect(await queue.processNextJob()).toBeNull();

    const seen: string[] = [];
    await queue.startWorker(async (job) => void seen.push(job.jobId));
    expect(queue.isWorkerRunning()).toBe(true);
    await queue.enqueueJob("j2", "export");
    expect(seen).toEqual(["j2"]);
    await queue.stopWorker();
    expect(queue.isWorkerRunning()).toBe(false);
  });
});
