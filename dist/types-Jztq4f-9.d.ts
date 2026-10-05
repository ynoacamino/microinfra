import { t as RuntimeEnv } from "./types-CD7cOcEI.js";
import { DrizzleD1Database } from "drizzle-orm/d1";
import { LibSQLDatabase } from "drizzle-orm/libsql";
import { AnyRelations as AnyRelations$1, EmptyRelations as EmptyRelations$1 } from "drizzle-orm";
//#region src/db/types.d.ts
/**
 * Union of every drizzle client microinfra can build (node libsql + edge D1).
 * Same SQLite dialect, same relations — apps type their db port with this and
 * never import from `microinfra/node` or `microinfra/edge` for types.
 */
type AppDrizzleDb<TRelations extends AnyRelations$1 = EmptyRelations$1> = LibSQLDatabase<TRelations> | DrizzleD1Database<TRelations>;
/** Target-agnostic runtime: raw client erased, orm unified. */
type AppRuntime<TRelations extends AnyRelations$1 = EmptyRelations$1> = RuntimeEnv<unknown, AppDrizzleDb<TRelations>>;
/** Returns the typed orm or undefined (no throw). */
declare function ormOf<TRelations extends AnyRelations$1 = EmptyRelations$1>(rt: RuntimeEnv<unknown, unknown>): AppDrizzleDb<TRelations> | undefined;
/** Returns the typed orm or throws with an actionable message. */
declare function requireOrm<TRelations extends AnyRelations$1 = EmptyRelations$1>(rt: RuntimeEnv<unknown, unknown>): AppDrizzleDb<TRelations>;
//#endregion
export { ormOf as a, EmptyRelations$1 as i, AppDrizzleDb as n, requireOrm as o, AppRuntime as r, AnyRelations$1 as t };
//# sourceMappingURL=types-Jztq4f-9.d.ts.map