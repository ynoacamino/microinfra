import type { EnvPort } from "../../ports/env";

export interface CfBindings {
  KV?: unknown;
  MY_BUCKET?: unknown;
  DB?: unknown;
  [key: string]: unknown;
}

/** Raw Cloudflare bindings map (worker or Durable Object). */
export type CfEnvMap = Record<string, unknown>;

declare global {
  // oxlint-disable-next-line no-var
  var __env__: CfEnvMap | undefined;
  // oxlint-disable-next-line no-var
  var __do_env__: CfEnvMap | undefined;
}

/**
 * Cloudflare bindings if present (worker or Durable Object), undefined on
 * node/local. Nitro sets `globalThis.__env__` on every worker entrypoint; code
 * running INSIDE a Durable Object (WS, stub.fetch) must stash `this.env` into
 * `globalThis.__do_env__` first (see stashDoEnv) — it takes priority here.
 */
export function cfEnv(): CfEnvMap | undefined {
  if (typeof globalThis === "undefined") return undefined;
  return globalThis.__do_env__ ?? globalThis.__env__;
}

/** Only the string entries (secrets + vars), e.g. for env schema parsing. */
export function cfVars(env: CfEnvMap): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

export class CloudflareEnv implements EnvPort {
  private readonly bindings: CfBindings;
  private readonly fallback: Record<string, string | undefined>;

  constructor(bindings?: CfBindings, fallback?: Record<string, string | undefined>) {
    this.bindings = bindings ?? {};
    this.fallback = fallback ?? {};
  }

  get(key: string): string | undefined {
    const binding = this.bindings[key];
    if (typeof binding === "string") return binding;
    return this.fallback[key];
  }

  getRequired(key: string): string {
    const value = this.get(key);
    if (value === undefined) throw new Error(`[env] Missing required key: ${key}`);
    return value;
  }

  all(): Record<string, string | undefined> {
    const out: Record<string, string | undefined> = { ...this.fallback };
    for (const [key, value] of Object.entries(this.bindings)) {
      if (typeof value === "string") out[key] = value;
    }
    return out;
  }

  static isConfigured(bindings?: CfBindings): boolean {
    return Boolean(bindings && (bindings.KV || bindings.MY_BUCKET || bindings.DB));
  }
}
