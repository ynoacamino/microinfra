import type { AnyRelations, EmptyRelations } from "drizzle-orm";
import { type CfBindings, CloudflareEnv, cfEnv, hasEdgeBindings } from "../adapters/edge/cf-env";
import { createRedisStreamsPubSub } from "../adapters/node/redis-pubsub";
import type { RuntimeEnv } from "../core/types";
import type { AppDrizzleDb } from "../db/types";
import { createEnvConfig } from "../schema/env-schema";
import { createAppRuntime } from "./app-runtime";
import { createAppRuntimeEdge } from "./app-runtime-edge";
import { once } from "./singleton";

export type HybridTarget = "edge" | "node";

// Re-exported here so `microinfra/hybrid` stays the single import for
// hybrid runtime consumers (canonical home is ../adapters/edge/cf-env).
export { hasEdgeBindings };

export interface HybridRuntimeOptions<TRelations extends AnyRelations = EmptyRelations> {
  relations?: TRelations;
  /** Fallback string vars (local dev). Default: none (edge reads bindings). */
  vars?: Record<string, string | undefined>;
  /** Disable the shared redis-streams pubsub override on edge. Default: false. */
  disableSharedPubsub?: boolean;
  /** Singleton key. Default: "hybrid" (one runtime per target per process). */
  singletonKey?: string;
}

/**
 * One-line hybrid runtime: node (libsql) or edge (D1) from the same call.
 * On edge, when UPSTASH_* / redis-http is configured, pubsub is upgraded to
 * shared redis-streams so Worker mutations reach Durable Object subscriptions
 * (both sides see the same events; the adapter is fetch-only, workerd-safe).
 * Otherwise edge keeps the memory pubsub (same isolate only).
 */
export function createHybridRuntime<TRelations extends AnyRelations = EmptyRelations>(
  bindings?: CfBindings | Record<string, unknown> | undefined,
  opts: HybridRuntimeOptions<TRelations> = {},
): RuntimeEnv<unknown, AppDrizzleDb<TRelations>> {
  const cf = (bindings ?? cfEnv()) as CfBindings | undefined;
  // Per-request resolution (e.g. Hono c.env) is real: each target memoizes
  // separately, so an edge request after a node one still gets edge.
  const target: HybridTarget = cf && (hasEdgeBindings(cf) || bindings !== undefined) ? "edge" : "node";
  return once(`${opts.singletonKey ?? "hybrid"}:${target}`, () => {
    if (target === "edge" && cf) {
      const rt = createAppRuntimeEdge(cf, { relations: opts.relations, vars: opts.vars });
      if (!opts.disableSharedPubsub) {
        try {
          const config = createEnvConfig(new CloudflareEnv(cf, opts.vars));
          if (config.redis.url && config.redis.token) {
            (rt as { pubsub: unknown }).pubsub = createRedisStreamsPubSub(config);
            rt.logger.info("edge pubsub: redis-streams compartido");
          }
        } catch {
          // Sin redis configurado: memory pubsub (mismo isolate).
        }
      }
      return rt as unknown as RuntimeEnv<unknown, AppDrizzleDb<TRelations>>;
    }
    const vars = (opts.vars ?? (typeof process === "undefined" ? undefined : process.env)) as
      | Record<string, string | undefined>
      | undefined;
    const rt = createAppRuntime(vars, { relations: opts.relations });
    return rt as unknown as RuntimeEnv<unknown, AppDrizzleDb<TRelations>>;
  });
}
