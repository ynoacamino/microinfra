import { t as CfBindings } from "./cf-env-KpSLbRKQ.js";
import { t as RuntimeEnv } from "./types-CD7cOcEI.js";
import { a as ormOf, i as EmptyRelations, n as AppDrizzleDb, o as requireOrm, r as AppRuntime, t as AnyRelations } from "./types-Jztq4f-9.js";
import { AnyRelations as AnyRelations$1, EmptyRelations as EmptyRelations$1 } from "drizzle-orm";
//#region src/runtime/hybrid.d.ts
type HybridTarget = "edge" | "node";
interface HybridRuntimeOptions<TRelations extends AnyRelations$1 = EmptyRelations$1> {
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
export declare function resolveTarget(bindings?: CfBindings | Record<string, unknown> | undefined): HybridTarget;
/**
 * Strict check: does this value carry Cloudflare bindings?
 * Unlike resolveTarget (any truthy env counts as edge, e.g. DO env),
 * an empty object means node — frameworks like Hono expose c.env = {}
 * on Bun, and that must not build an edge runtime.
 */
export declare function hasEdgeBindings(env: unknown): boolean;
/**
 * One-line hybrid runtime: node (libsql) or edge (D1) from the same call.
 * On edge, when UPSTASH_* / redis-http is configured, pubsub is upgraded to
 * shared redis-streams so Worker mutations reach Durable Object subscriptions
 * (both sides see the same events; the adapter is fetch-only, workerd-safe).
 * Otherwise edge keeps the memory pubsub (same isolate only).
 */
export declare function createHybridRuntime<TRelations extends AnyRelations$1 = EmptyRelations$1>(bindings?: CfBindings | Record<string, unknown> | undefined, opts?: HybridRuntimeOptions<TRelations>): RuntimeEnv<unknown, AppDrizzleDb<TRelations>>;
//#endregion
export { type AnyRelations, type AppDrizzleDb, type AppRuntime, type EmptyRelations, type HybridRuntimeOptions, type HybridTarget, ormOf, requireOrm };
//# sourceMappingURL=hybrid.d.ts.map