import type { AnyRelations, EmptyRelations } from "drizzle-orm";
import type { AnyD1Database, DrizzleD1Database } from "drizzle-orm/d1";
import type { CfBindings } from "../adapters/edge/cf-env";
import { createD1DrizzleDb } from "../adapters/edge/drizzle";
import type { RuntimeEnv } from "../core/types";
import type { EnvConfig } from "../ports/config";
import { createEdgeInfra } from "./edge";

export interface AppRuntimeEdgeOptions<TRelations extends AnyRelations = EmptyRelations> {
  /**
   * Relations built with drizzle-orm `defineRelations` (tables included).
   * Optional — defaults to no relations.
   */
  relations?: TRelations;
  /** Explicit D1 binding. Default: bindings.DB. */
  dbBinding?: AnyD1Database;
  /** Fallback env vars (local dev). Default: none. */
  vars?: Record<string, string | undefined>;
  /** Prebuilt config (tests). Default: parsed from bindings + vars. */
  config?: EnvConfig;
}

/**
 * One-line edge runtime: resolves the D1 binding (KV/R2/Queues auto-resolved
 * from bindings by createEdgeInfra), builds Drizzle with the app relations.
 */
export function createAppRuntimeEdge<TRelations extends AnyRelations = EmptyRelations>(
  bindings: CfBindings | undefined,
  opts: AppRuntimeEdgeOptions<TRelations> = {},
): RuntimeEnv<AnyD1Database, DrizzleD1Database<TRelations>> {
  const dbBinding = (opts.dbBinding ?? bindings?.DB) as AnyD1Database | undefined;
  if (!dbBinding) {
    throw new Error("[microinfra] binding D1 (DB) requerido para createAppRuntimeEdge");
  }
  const orm = createD1DrizzleDb<TRelations>(dbBinding, opts.relations);
  return createEdgeInfra({
    bindings,
    vars: opts.vars,
    config: opts.config,
    dbClient: dbBinding,
    dbOrm: orm,
  });
}
