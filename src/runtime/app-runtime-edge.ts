import type { CfBindings } from "../adapters/edge/cf-env";
import type { RuntimeEnv } from "../core/types";
import type { EnvConfig } from "../ports/config";
import { createEdgeInfra } from "./edge";

export interface AppRuntimeEdgeOptions<TOrm = unknown, TBinding = unknown> {
  /** Builds the app ORM (any Drizzle version) over the D1 binding. Runs once per isolate. */
  createDb: (binding: TBinding) => TOrm;
  /** Explicit D1 binding. Default: bindings.DB. */
  dbBinding?: TBinding;
  /** Fallback env vars (local dev). Default: none. */
  vars?: Record<string, string | undefined>;
  /** Prebuilt config (tests). Default: parsed from bindings + vars. */
  config?: EnvConfig;
}

/**
 * One-line edge runtime: resolves the D1 binding (KV/R2/Queues auto-resolved
 * from bindings by createEdgeInfra), builds the app ORM via `createDb`.
 */
export function createAppRuntimeEdge<TOrm = unknown, TBinding = unknown>(
  bindings: CfBindings | undefined,
  opts: AppRuntimeEdgeOptions<TOrm, TBinding>,
): RuntimeEnv<TBinding, TOrm> {
  const dbBinding = (opts.dbBinding ?? bindings?.DB) as TBinding | undefined;
  if (!dbBinding) {
    throw new Error("[microinfra] binding D1 (DB) requerido para createAppRuntimeEdge");
  }
  const orm = opts.createDb(dbBinding);
  return createEdgeInfra({
    bindings,
    vars: opts.vars,
    config: opts.config,
    dbClient: dbBinding,
    dbOrm: orm,
  });
}
