import type { EnvConfig } from "../../ports/config";
import type { DatabasePort } from "../../ports/database";

export function isLibsqlConfigured(config: EnvConfig): boolean {
  return Boolean(config.database.url);
}

export function createLibsqlPort<TRaw = unknown, TOrm = unknown>(
  client: TRaw,
  close?: () => Promise<void>,
  orm?: TOrm,
): DatabasePort<TRaw, TOrm> {
  return {
    client,
    orm,
    close,
  };
}
