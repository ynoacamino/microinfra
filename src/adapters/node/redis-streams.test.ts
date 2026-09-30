import { afterEach, describe, expect, it, vi } from "vitest";
import { createEnvConfig } from "../../schema/env-schema";
import { createMapEnv } from "../memory/map-env";
import { createRedisStreamsQueue, isStreamsConfigured, RedisStreamsQueue } from "./redis-streams";

afterEach(() => {
  vi.unstubAllGlobals();
});

function streamsConfig() {
  return createEnvConfig(createMapEnv({ UPSTASH_REDIS_REST_URL: "https://upstash.io", UPSTASH_REDIS_REST_TOKEN: "t" }));
}

interface ScriptedResponse {
  ok: boolean;
  status?: number;
  json: unknown;
}

function stubUpstash(responses: Array<ScriptedResponse | unknown[]> = []) {
  const commands: unknown[][] = [];
  const pipelines: unknown[][][] = [];
  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const raw = typeof input === "string" ? init?.body : await (input as Request).text();
    const parsed = JSON.parse(String(raw)) as unknown;
    if (url.endsWith("/pipeline")) {
      pipelines.push(parsed as unknown[][]);
    } else {
      commands.push(parsed as unknown[]);
    }
    const next = responses.shift() ?? (url.endsWith("/pipeline") ? [] : { result: null });
    if (Array.isArray(next)) {
      return { ok: true, json: async () => next } as Response;
    }
    if (typeof next === "object" && next !== null && "ok" in next) {
      const scripted = next as ScriptedResponse;
      return { ok: scripted.ok, status: scripted.status ?? 500, json: async () => scripted.json } as Response;
    }
    return { ok: true, json: async () => next } as Response;
  });
  return { commands, pipelines };
}

const STREAM_ENTRY = [["test-stream", [["1770000000000-0", ["jobId", "j1", "jobType", "export"]]]]];

describe("redis streams", () => {
  it("detects configuration from env", () => {
    expect(isStreamsConfigured(streamsConfig())).toBe(true);
    expect(isStreamsConfigured(createEnvConfig(createMapEnv({})))).toBe(false);
  });

  it("enqueues jobs with XADD and reports failures", async () => {
    const { commands } = stubUpstash([
      { ok: true, json: { result: "OK" } },
      { ok: true, json: { result: "1770000000000-0" } },
      { ok: false, status: 503, json: {} },
    ]);
    const queue = createRedisStreamsQueue(streamsConfig(), { stream: "jobs", group: "g", consumer: "c1" });
    expect(await queue.enqueueJob("j1", "export")).toBe(true);
    expect(commands[0]?.slice(0, 4)).toEqual(["XGROUP", "CREATE", "jobs", "g"]);
    expect(commands[1]?.slice(0, 7)).toEqual(["XADD", "jobs", "*", "jobId", "j1", "jobType", "export"]);

    stubUpstash([{ ok: false, status: 503, json: {} }]);
    expect(await queue.enqueueJob("j2", "export")).toBe(false);
  });

  it("reads jobs with XREADGROUP and handles empty or malformed replies", async () => {
    const { commands } = stubUpstash([
      { ok: true, json: { result: STREAM_ENTRY } },
      { ok: true, json: { result: [] } },
      { ok: true, json: { result: [["s", []]] } },
      { ok: true, json: { result: [["s", [["bad", ["jobId"]]]]] } },
      { ok: false, status: 500, json: {} },
    ]);
    const queue = createRedisStreamsQueue(streamsConfig());
    const job = await queue.processNextJob();
    expect(job).toMatchObject({ jobId: "j1", jobType: "export", streamId: "1770000000000-0" });
    expect(commands[0]?.slice(0, 6)).toEqual([
      "XREADGROUP",
      "GROUP",
      "microinfra-processors",
      expect.any(String),
      "STREAMS",
      "microinfra:jobs",
    ]);
    expect(await queue.processNextJob()).toBeNull();
    expect(await queue.processNextJob()).toBeNull();
    expect(await queue.processNextJob()).toBeNull();
    expect(await queue.processNextJob()).toBeNull();
  });

  it("acknowledges with XACK and XDEL in one pipeline", async () => {
    const { pipelines } = stubUpstash([[{ result: 1 }, { result: 1 }]]);
    const queue = createRedisStreamsQueue(streamsConfig(), { stream: "jobs", group: "g" });
    await queue.ackJob("1770000000000-0");
    expect(pipelines).toEqual([
      [
        ["XACK", "jobs", "g", "1770000000000-0"],
        ["XDEL", "jobs", "1770000000000-0"],
      ],
    ]);
  });

  it("reclaims stale entries and skips malformed ones", async () => {
    stubUpstash([
      {
        ok: true,
        json: { result: ["cursor-1", [["1770000000001-0", ["jobId", "old", "jobType", "export"]], "garbage"]] },
      },
      { ok: true, json: { result: ["0-0", []] } },
      { ok: true, json: { result: "broken" } },
      { ok: false, status: 500, json: {} },
    ]);
    const queue = new RedisStreamsQueue(streamsConfig(), { consumer: "c9" });
    const claimed = await queue.reclaimStaleEntries(1000);
    expect(claimed).toEqual([{ jobId: "old", jobType: "export", streamId: "1770000000001-0" }]);
    expect(await queue.reclaimStaleEntries()).toEqual([]);
    expect(await queue.reclaimStaleEntries()).toEqual([]);
  });

  it("runs a worker: group, reclaim, poll, ack, stop", async () => {
    const { commands, pipelines } = stubUpstash([
      { ok: true, json: { result: "OK" } },
      { ok: true, json: { result: ["0-0", []] } },
      { ok: true, json: { result: STREAM_ENTRY } },
      [{ result: 1 }, { result: 1 }],
    ]);
    const queue = createRedisStreamsQueue(streamsConfig(), { pollIntervalMs: 5 });
    const seen: string[] = [];
    await queue.startWorker(async (job) => void seen.push(job.jobId));
    expect(queue.isWorkerRunning()).toBe(true);
    expect(seen).toEqual(["j1"]);
    expect(commands[0]?.slice(0, 3)).toEqual(["XGROUP", "CREATE", "microinfra:jobs"]);
    expect(pipelines).toHaveLength(1);
    await queue.stopWorker();
    expect(queue.isWorkerRunning()).toBe(false);
  });

  it("keeps polling after handler errors without acknowledging", async () => {
    stubUpstash([
      { ok: true, json: { result: "OK" } },
      { ok: true, json: { result: ["0-0", []] } },
      { ok: true, json: { result: STREAM_ENTRY } },
    ]);
    const queue = createRedisStreamsQueue(streamsConfig(), { pollIntervalMs: 5 });
    await queue.startWorker(async () => {
      throw new Error("boom");
    });
    expect(queue.isWorkerRunning()).toBe(true);
    await queue.stopWorker();
  });

  it("processes reclaimed jobs before polling", async () => {
    const { pipelines } = stubUpstash([
      { ok: true, json: { result: "OK" } },
      { ok: true, json: { result: ["0-0", [["1770000000002-0", ["jobId", "stale", "jobType", "export"]]]] } },
      { ok: true, json: { result: [] } },
      [{ result: 1 }, { result: 1 }],
    ]);
    const queue = createRedisStreamsQueue(streamsConfig(), { pollIntervalMs: 5 });
    const seen: string[] = [];
    await queue.startWorker(async (job) => void seen.push(job.jobId));
    expect(seen).toEqual(["stale"]);
    expect(pipelines).toHaveLength(1);
    await queue.stopWorker();
  });
});
