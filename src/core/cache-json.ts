import type { CachePort } from "../ports/cache";

export type CacheKeyPart = string | number;

export interface CacheJson {
  key(...parts: CacheKeyPart[]): string;
  get<T>(...parts: CacheKeyPart[]): Promise<T | null>;
  put<T>(value: T, parts: CacheKeyPart[], opts?: { ttl?: number }): Promise<void>;
  invalidate(...parts: CacheKeyPart[]): Promise<void>;
}

/**
 * JSON over CachePort under a namespace. Reads never throw (miss, corrupt
 * payload or backend error all resolve to null); writes propagate errors so
 * silent cache loss stays visible — callers add .catch() only for
 * fire-and-forget writes.
 */
export function cacheJson(cache: CachePort, namespace: string): CacheJson {
  const buildKey = (parts: CacheKeyPart[]): string => `${namespace}:${parts.join(":")}`;
  return {
    key: (...parts) => buildKey(parts),
    get: async <T>(...parts: CacheKeyPart[]): Promise<T | null> => {
      try {
        const raw = await cache.get(buildKey(parts));
        if (raw === null) {
          return null;
        }
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    },
    put: async <T>(value: T, parts: CacheKeyPart[], opts?: { ttl?: number }): Promise<void> => {
      await cache.put(buildKey(parts), JSON.stringify(value), opts?.ttl === undefined ? undefined : { ttl: opts.ttl });
    },
    invalidate: async (...parts: CacheKeyPart[]): Promise<void> => {
      await cache.delete(buildKey(parts));
    },
  };
}
