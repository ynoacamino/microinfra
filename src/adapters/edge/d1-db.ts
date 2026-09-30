import type { DatabasePort } from "../../ports/database";
import type { CfBindings } from "./cf-env";

export function isD1Configured(bindings?: CfBindings): boolean {
  return Boolean(bindings?.DB);
}

export function createD1Port<TClient = unknown>(client: TClient, close?: () => Promise<void>): DatabasePort<TClient> {
  return { client, close };
}
