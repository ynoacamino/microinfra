import type { CachePort } from "../../ports/cache";
import type { CfBindings } from "./cf-env";

export interface KvBinding {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(opts?: { prefix?: string }): Promise<{ keys: Array<{ name: string }> }>;
}

export function isKvConfigured(bindings?: CfBindings): boolean {
  return Boolean(bindings?.KV);
}

export function createKvCache(binding: KvBinding): CachePort {
  return {
    get: (key) => binding.get(key),
    put: (key, value, opts) => binding.put(key, value, opts?.ttl ? { expirationTtl: opts.ttl } : undefined),
    delete: (key) => binding.delete(key),
    list: async (prefix = "") => {
      const res = await binding.list({ prefix });
      return res.keys.map((k) => k.name);
    },
  };
}
