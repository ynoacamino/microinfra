import type { AnyRelations, EmptyRelations } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type { RuntimeEnv } from "../core/types";

export type { AnyRelations, EmptyRelations };

/**
 * Union of every drizzle client microinfra can build (node libsql + edge D1).
 * Same SQLite dialect, same relations — apps type their db port with this and
 * never import from `microinfra/node` or `microinfra/edge` for types.
 */
export type AppDrizzleDb<TRelations extends AnyRelations = EmptyRelations> =
  | LibSQLDatabase<TRelations>
  | DrizzleD1Database<TRelations>;

/** Target-agnostic runtime: raw client erased, orm unified. */
export type AppRuntime<TRelations extends AnyRelations = EmptyRelations> = RuntimeEnv<
  unknown,
  AppDrizzleDb<TRelations>
>;

/** Returns the typed orm or undefined (no throw). */
export function ormOf<TRelations extends AnyRelations = EmptyRelations>(
  rt: RuntimeEnv<unknown, unknown>,
): AppDrizzleDb<TRelations> | undefined {
  return rt.db.orm as AppDrizzleDb<TRelations> | undefined;
}

/** Returns the typed orm or throws with an actionable message. */
export function requireOrm<TRelations extends AnyRelations = EmptyRelations>(
  rt: RuntimeEnv<unknown, unknown>,
): AppDrizzleDb<TRelations> {
  const orm = ormOf<TRelations>(rt);
  if (!orm) {
    throw new Error("[microinfra] DB orm no disponible (revisa DATABASE_URL o binding D1)");
  }
  return orm;
}
