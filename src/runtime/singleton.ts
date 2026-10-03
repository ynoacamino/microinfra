const PREFIX = "__microinfra_";

/**
 * Process-wide singleton keyed by name. Survives Vite/Nitro dev HMR and
 * serverless module re-evaluation because state lives on globalThis.
 */
export function once<T>(key: string, init: () => T): T {
  const store = globalThis as Record<string, unknown>;
  const namespaced = `${PREFIX}${key}__`;
  const existing = store[namespaced];
  if (existing !== undefined) {
    return existing as T;
  }
  const value = init();
  store[namespaced] = value;
  return value;
}
