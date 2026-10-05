import type { AnyRelations, EmptyRelations } from "drizzle-orm";
import { type CfBindings, CloudflareEnv, cfEnv } from "../adapters/edge/cf-env";
import { createRedisStreamsPubSub } from "../adapters/node/redis-pubsub";
import type { RuntimeEnv } from "../core/types";
import type { AppDrizzleDb } from "../db/types";
import { createEnvConfig } from "../schema/env-schema";
import { createAppRuntime } from "./app-runtime";
import { createAppRuntimeEdge } from "./app-runtime-edge";
import { once } from "./singleton";

export type HybridTarget = "edge" | "node";

export interface HybridRuntimeOptions<TRelations extends AnyRelations = EmptyRelations> {
  relations?: TRelations;
  /** Fallback string vars (local dev). Default: none (edge reads bindings). */
  vars?: Record<string, string | undefined>;
  /** Disable the shared redis-streams pubsub override on edge. Default: false. */
  disableSharedPubsub?: boolean;
  /** Singleton key. Default: "hybrid" (one runtime per process). */
  singletonKey?: string;
}

/**
 * Detects the target without building anything. Explicit bindings win,
 * otherwise falls back to globalThis.__do_env__/__env__ (Nitro sets it).
 */
export function resolveTarget(bindings?: CfBindings | Record<string, unknown> | undefined): HybridTarget {
  const cf = (bindings ?? cfEnv()) as CfBindings | undefined;
  return cf && (cf.DB ?? cf.KV ?? cf.MY_BUCKET ?? cf.QUEUE ?? cf.REALTIME_DO) ? "edge" : cf ? "edge" : "node";
}

function isEdgeBindings(bindings: CfBindings | undefined): boolean {
  if (!bindings) return false;
  return Boolean(bindings.DB ?? bindings.KV ?? bindings.MY_BUCKET ?? bindings.QUEUE ?? bindings.REALTIME_DO);
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
  return once(opts.singletonKey ?? "hybrid", () => {
    const cf = (bindings ?? cfEnv()) as CfBindings | undefined;
    if (cf && (isEdgeBindings(cf) || bindings !== undefined)) {
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
