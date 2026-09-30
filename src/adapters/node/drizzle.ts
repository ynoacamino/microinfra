import type { Client as LibsqlClient } from "@libsql/client";
import type { Client as LibsqlHttpClient } from "@libsql/client/http";
import { drizzle as drizzleLibsql, type LibSQLDatabase } from "drizzle-orm/libsql";
import { drizzle as drizzleLibsqlHttp } from "drizzle-orm/libsql/http";

export type AnyDrizzleSchema = Record<string, unknown>;

export type { LibSQLDatabase };

/** Drizzle over a local/embedded libsql client (`file:`/`libsql:` URLs). */
export function createLibsqlDrizzleDb<TSchema extends AnyDrizzleSchema>(
  client: LibsqlClient,
  schema: TSchema,
): LibSQLDatabase<TSchema> {
  return drizzleLibsql(client, { schema });
}

/** Drizzle over a remote libsql client (`http(s):` URLs: libsql-server, Turso). */
export function createLibsqlHttpDrizzleDb<TSchema extends AnyDrizzleSchema>(
  client: LibsqlHttpClient,
  schema: TSchema,
): LibSQLDatabase<TSchema> {
  return drizzleLibsqlHttp({ client, schema });
}
