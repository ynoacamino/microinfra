import { describe, expect, it } from "vitest";
import { createMemoryCache } from "../adapters/memory/memory-cache";
import { cacheJson } from "./cache-json";

describe("cacheJson", () => {
  it("round-trips JSON under a namespaced key", async () => {
    const json = cacheJson(createMemoryCache(), "stats");
    expect(json.key("attendance", "2026-01-01")).toBe("stats:attendance:2026-01-01");
    await json.put({ present: 2, total: 3 }, ["attendance", "2026-01-01"], { ttl: 30 });
    expect(await json.get<{ present: number; total: number }>("attendance", "2026-01-01")).toEqual({
      present: 2,
      total: 3,
    });
    await json.invalidate("attendance", "2026-01-01");
    expect(await json.get("attendance", "2026-01-01")).toBeNull();
  });

  it("returns null on miss and on corrupt payloads", async () => {
    const cache = createMemoryCache();
    const json = cacheJson(cache, "stats");
    expect(await json.get("missing")).toBeNull();
    await cache.put("stats:broken", "not-json{");
    expect(await json.get("broken")).toBeNull();
  });
});
