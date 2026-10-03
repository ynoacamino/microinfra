import { type Client, createClient } from "@libsql/client";
import type { Client as HttpClient } from "@libsql/client/http";
import type { AnyRelations, EmptyRelations } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { createMemoryObjects } from "../adapters/memory/memory-objects";
import { createLibsqlDrizzleDb, createLibsqlHttpDrizzleDb } from "../adapters/node/drizzle";
import { NodeEnv } from "../adapters/node/node-env";
import { createS3Port, isS3Configured } from "../adapters/node/s3-objects";
import type { RuntimeEnv } from "../core/types";
import type { EnvConfig } from "../ports/config";
import type { ObjectPort } from "../ports/object-storage";
import { createEnvConfig } from "../schema/env-schema";
import { createNodeInfra } from "./node";

export interface AppRuntimeOptions<TRelations extends AnyRelations = EmptyRelations> {
  /**
   * Relations built with drizzle-orm `defineRelations` (tables included).
   * Optional — defaults to no relations. microinfra picks the driver
   * (embedded vs http) by URL scheme, so callers never touch drizzle constructors.
   */
  relations?: TRelations;
  /** "auto" (default): S3 when S3 env is configured, memory otherwise. Pass a port to force one. */
  objects?: "auto" | ObjectPort;
  /** Reject file: DATABASE_URL with a clear error. Default true. */
  forbidFileDb?: boolean;
  /** Prebuilt config (tests). Default: parsed from vars. */
  config?: EnvConfig;
}

function resolveDatabaseUrl(config: EnvConfig, forbidFileDb: boolean): string {
  const url = config.database.url;
  if (!url) {
    throw new Error("[microinfra] DATABASE_URL es requerido para createAppRuntime");
  }
  if (forbidFileDb && url.startsWith("file:")) {
    throw new Error(
      "[microinfra] file: DATABASE_URL prohibido en createAppRuntime, usa libsql-server (http:) o forbidFileDb:false",
    );
  }
  return url;
}

/**
 * One-line node runtime: parses env, opens the libsql client (branching by
 * URL scheme), builds Drizzle with the app relations, and wires cache/queue/
 * pubsub/objects with the standard fallbacks (memory unless Redis/S3 configured).
 */
export function createAppRuntime<TRelations extends AnyRelations = EmptyRelations>(
  vars: Record<string, string | undefined> | undefined,
  opts: AppRuntimeOptions<TRelations> = {},
): RuntimeEnv<Client, LibSQLDatabase<TRelations>> {
  const env = new NodeEnv(vars);
  const config = opts.config ?? createEnvConfig(env);
  const url = resolveDatabaseUrl(config, opts.forbidFileDb ?? true);
  const remote = !url.startsWith("file:");
  const client = createClient(
    remote && config.database.authToken ? { url, authToken: config.database.authToken } : { url },
  );
  const orm = remote
    ? createLibsqlHttpDrizzleDb<TRelations>(client as HttpClient, opts.relations)
    : createLibsqlDrizzleDb<TRelations>(client, opts.relations);
  const objects =
    opts.objects === undefined || opts.objects === "auto"
      ? isS3Configured(config)
        ? createS3Port(config)
        : createMemoryObjects()
      : opts.objects;
  return createNodeInfra({
    vars,
    config,
    dbClient: client,
    dbClose: async () => {
      client.close();
    },
    dbOrm: orm,
    objectPort: objects,
  });
}
