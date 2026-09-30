import type { CachePort } from "../../ports/cache";

export function createNoopCache(): CachePort {
  return {
    get: async () => null,
    put: async () => {},
    delete: async () => {},
    list: async () => [],
  };
}
