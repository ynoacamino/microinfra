import { drizzle as drizzleD1, type AnyD1Database, type DrizzleD1Database } from "drizzle-orm/d1";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type { AnyDrizzleSchema } from "../node/drizzle";

export type { AnyD1Database, DrizzleD1Database };

/** Drizzle over a D1 database binding. Shares the SQLite dialect (and schema) with libsql. */
export function createD1DrizzleDb<TSchema extends AnyDrizzleSchema>(
  binding: AnyD1Database,
  schema: TSchema,
): DrizzleD1Database<TSchema> {
  return drizzleD1(binding, { schema });
}

/** Union of every drizzle client microinfra can build. Apps type their db port with this. */
export type AnyDrizzleDb<TSchema extends AnyDrizzleSchema = AnyDrizzleSchema> =
  | LibSQLDatabase<TSchema>
  | DrizzleD1Database<TSchema>;
