import type { EnvConfig } from "../../ports/config";
import type { DatabasePort } from "../../ports/database";

export function isLibsqlConfigured(config: EnvConfig): boolean {
  return Boolean(config.database.url);
}

export function createLibsqlPort<TClient = unknown>(
  client: TClient,
  close?: () => Promise<void>,
): DatabasePort<TClient> {
  return {
    client,
    close,
  };
}
