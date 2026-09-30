import type { EnvPort } from "../../ports/env";

export interface CfBindings {
  KV?: unknown;
  MY_BUCKET?: unknown;
  DB?: unknown;
  [key: string]: unknown;
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
