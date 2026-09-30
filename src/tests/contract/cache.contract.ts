import { describe, expect, it } from "vitest";
import type { CachePort } from "../../ports/cache";

export function describeCacheContract(name: string, makeCache: () => CachePort | Promise<CachePort>): void {
  describe(`CachePort contract [${name}]`, () => {
    it("stores, reads and deletes values", async () => {
      const cache = await makeCache();
      const key = `contract:${crypto.randomUUID()}`;
      expect(await cache.get(key)).toBeNull();
      await cache.put(key, "hello");
      expect(await cache.get(key)).toBe("hello");
      await cache.delete(key);
      expect(await cache.get(key)).toBeNull();
    });

    it("lists keys by prefix", async () => {
      const cache = await makeCache();
      const prefix = `contract:${crypto.randomUUID()}:`;
      await cache.put(`${prefix}a`, "1");
      await cache.put(`${prefix}b`, "2");
      const keys = await cache.list(prefix);
      expect(keys).toContain(`${prefix}a`);
      expect(keys).toContain(`${prefix}b`);
      await cache.delete(`${prefix}a`);
      await cache.delete(`${prefix}b`);
    });

    it("keeps values stored with a ttl readable before expiry", async () => {
      const cache = await makeCache();
      const key = `contract:${crypto.randomUUID()}`;
      await cache.put(key, "ephemeral", { ttl: 60 });
      expect(await cache.get(key)).toBe("ephemeral");
      await cache.delete(key);
    });
  });
}
