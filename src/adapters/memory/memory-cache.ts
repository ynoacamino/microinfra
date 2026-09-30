import type { CachePort } from "../../ports/cache";

export function createMemoryCache(): CachePort {
  const map = new Map<string, { value: string; expiresAt?: number }>();
  return {
    get: async (key) => {
      const entry = map.get(key);
      if (!entry) return null;
      if (entry.expiresAt !== undefined && Date.now() > entry.expiresAt) {
        map.delete(key);
        return null;
      }
      return entry.value;
    },
    put: async (key, value, opts) => {
      map.set(key, opts?.ttl ? { value, expiresAt: Date.now() + opts.ttl * 1000 } : { value });
    },
    delete: async (key) => {
      map.delete(key);
    },
    list: async (prefix = "") => {
      return [...map.keys()].filter((key) => key.startsWith(prefix));
    },
  };
}
