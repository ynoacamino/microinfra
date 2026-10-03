import type { DatabasePort } from "../../ports/database";
import type { CfBindings } from "./cf-env";

export function isD1Configured(bindings?: CfBindings): boolean {
  return Boolean(bindings?.DB);
}

export function createD1Port<TRaw = unknown, TOrm = unknown>(
  client: TRaw,
  close?: () => Promise<void>,
  orm?: TOrm,
): DatabasePort<TRaw, TOrm> {
  return { client, orm, close };
}
