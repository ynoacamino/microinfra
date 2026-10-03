import { type Client, createClient } from "@libsql/client";
import { createMemoryObjects } from "../adapters/memory/memory-objects";
import { NodeEnv } from "../adapters/node/node-env";
import { createS3Port, isS3Configured } from "../adapters/node/s3-objects";
import type { RuntimeEnv } from "../core/types";
import type { EnvConfig } from "../ports/config";
import type { ObjectPort } from "../ports/object-storage";
import { createEnvConfig } from "../schema/env-schema";
import { createNodeInfra } from "./node";

export interface NodeDbInit {
  /** Raw libsql client built from DATABASE_URL (works for file:, libsql: and http(s):). */
  client: Client;
  /** True when the URL is remote (http(s):/libsql:); false for embedded file:. */
  remote: boolean;
}

export interface AppRuntimeOptions<TOrm = unknown> {
  /** Builds the app ORM (any Drizzle version) over the raw client. Runs once per process. */
  createDb: (init: NodeDbInit) => TOrm;
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
 * URL scheme), builds the app ORM via `createDb`, and wires cache/queue/
 * pubsub/objects with the standard fallbacks (memory unless Redis/S3 configured).
 */
export function createAppRuntime<TOrm = unknown>(
  vars: Record<string, string | undefined> | undefined,
  opts: AppRuntimeOptions<TOrm>,
): RuntimeEnv<Client, TOrm> {
  const env = new NodeEnv(vars);
  const config = opts.config ?? createEnvConfig(env);
  const url = resolveDatabaseUrl(config, opts.forbidFileDb ?? true);
  const remote = !url.startsWith("file:");
  const client = createClient(
    remote && config.database.authToken ? { url, authToken: config.database.authToken } : { url },
  );
  const orm = opts.createDb({ client, remote });
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
