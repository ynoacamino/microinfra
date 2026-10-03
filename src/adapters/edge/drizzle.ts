import type { AnyRelations, EmptyRelations } from "drizzle-orm";
import { type AnyD1Database, type DrizzleD1Database, drizzle as drizzleD1 } from "drizzle-orm/d1";
import type { LibSQLDatabase } from "drizzle-orm/libsql";

export type { AnyD1Database, AnyRelations, DrizzleD1Database, EmptyRelations };

/** Drizzle over a D1 database binding. Shares the SQLite dialect (and relations) with libsql. */
export function createD1DrizzleDb<TRelations extends AnyRelations = EmptyRelations>(
  binding: AnyD1Database,
  relations?: TRelations,
): DrizzleD1Database<TRelations> {
  return drizzleD1<TRelations>(binding, { relations });
}

/** Union of every drizzle client microinfra can build. Apps type their db port with this. */
export type AnyDrizzleDb<TRelations extends AnyRelations = EmptyRelations> =
  | LibSQLDatabase<TRelations>
  | DrizzleD1Database<TRelations>;
