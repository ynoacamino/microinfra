import { o as hasEdgeBindings, t as CfBindings } from "./cf-env-Dqh71xH_.js";
import { t as RuntimeEnv } from "./types-CD7cOcEI.js";
import { n as AppDrizzleDb } from "./types-Jztq4f-9.js";
import { AnyRelations, EmptyRelations } from "drizzle-orm";
//#region src/runtime/hybrid.d.ts
type HybridTarget = "edge" | "node";
interface HybridRuntimeOptions<TRelations extends AnyRelations = EmptyRelations> {
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
export declare function createHybridRuntime<TRelations extends AnyRelations = EmptyRelations>(bindings?: CfBindings | Record<string, unknown> | undefined, opts?: HybridRuntimeOptions<TRelations>): RuntimeEnv<unknown, AppDrizzleDb<TRelations>>;
//#endregion
export { type HybridRuntimeOptions, type HybridTarget, hasEdgeBindings };
//# sourceMappingURL=hybrid.d.ts.map