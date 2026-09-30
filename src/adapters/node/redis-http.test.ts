import { afterEach, describe, expect, it, vi } from "vitest";
import { parseRedisFields, sendRedisCommand, sendRedisPipeline } from "./redis-http";

function jsonResponse(result: unknown, status = 200): Response {
  return new Response(JSON.stringify(result), { status });
}

describe("redis-http", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends commands with auth headers and unwraps the result", async () => {
    const seen: Array<{ url: unknown; init: { headers: Record<string, string>; body: string } }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown, init: { headers: Record<string, string>; body: string }) => {
        seen.push({ url, init });
        return jsonResponse({ result: "OK" });
      }),
    );
    const result = await sendRedisCommand("http://redis.test/", "secret", ["PING"]);
    expect(result).toBe("OK");
    expect(seen).toHaveLength(1);
    expect(String(seen[0]?.url)).toBe("http://redis.test/");
    expect(seen[0]?.init.headers.Authorization).toBe("Bearer secret");
    expect(JSON.parse(seen[0]?.init.body ?? "")).toEqual(["PING"]);
  });

  it("throws on command failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500 })),
    );
    await expect(sendRedisCommand("http://redis.test", "secret", ["PING"])).rejects.toThrow(
      "[redis-http] Command failed with status 500",
    );
  });

  it("sends pipelines and maps each result", async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown, _init: { body: string }) => {
        seen.push(String(url));
        return jsonResponse([{ result: "a" }, { result: "b" }]);
      }),
    );
    const results = await sendRedisPipeline("http://redis.test/", "secret", [["PING"], ["PING"]]);
    expect(results).toEqual(["a", "b"]);
    expect(seen).toEqual(["http://redis.test/pipeline"]);
  });

  it("throws on pipeline failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown) => new Response("nope", { status: 503 })),
    );
    await expect(sendRedisPipeline("http://redis.test", "secret", [["PING"]])).rejects.toThrow(
      "[redis-http] Pipeline failed with status 503",
    );
  });

  it("parses flat field arrays and skips malformed pairs", () => {
    expect(parseRedisFields(["a", "1", "b", 2])).toEqual({ a: "1", b: "2" });
    expect(parseRedisFields(["ok", "x", 42, "y", "missing"])).toEqual({ ok: "x" });
    expect(parseRedisFields(null)).toEqual({});
    expect(parseRedisFields("nope")).toEqual({});
    expect(parseRedisFields([])).toEqual({});
  });
});
