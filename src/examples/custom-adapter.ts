import { defineAdapter } from "../core/define-adapter";
import type { CachePort } from "../ports/cache";

/**
 * Ejemplo: cómo añadir un adaptador propio sin tocar el core
 * (espejo de microform/examples/custom-controls.ts).
 */
export const postgresCacheAdapter = defineAdapter({
  name: "postgres-cache",
  port: {} as CachePort,
});
