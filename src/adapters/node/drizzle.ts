import type { Client as LibsqlClient } from "@libsql/client";
import type { Client as LibsqlHttpClient } from "@libsql/client/http";
import type { AnyRelations, EmptyRelations } from "drizzle-orm";
import { drizzle as drizzleLibsql, type LibSQLDatabase } from "drizzle-orm/libsql";
import { drizzle as drizzleLibsqlHttp } from "drizzle-orm/libsql/http";

export type { AnyRelations, EmptyRelations, LibSQLDatabase };

/** Drizzle over a local/embedded libsql client (`file:` URLs). */
export function createLibsqlDrizzleDb<TRelations extends AnyRelations = EmptyRelations>(
  client: LibsqlClient,
  relations?: TRelations,
): LibSQLDatabase<TRelations> {
  return drizzleLibsql<TRelations>({ client, relations });
}

/** Drizzle over a remote libsql client (`http(s):`/`libsql:` URLs: libsql-server, Turso). */
export function createLibsqlHttpDrizzleDb<TRelations extends AnyRelations = EmptyRelations>(
  client: LibsqlHttpClient,
  relations?: TRelations,
): LibSQLDatabase<TRelations> {
  return drizzleLibsqlHttp<TRelations>({ client, relations });
}
