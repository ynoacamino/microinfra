import type { EnvPort } from "../../ports/env";

export function createMapEnv(seed: Record<string, string> = {}): EnvPort {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    get: (key) => map.get(key),
    getRequired: (key) => {
      const value = map.get(key);
      if (value === undefined) throw new Error(`[env] Missing required key: ${key}`);
      return value;
    },
    all: () => Object.fromEntries(map),
  };
}
