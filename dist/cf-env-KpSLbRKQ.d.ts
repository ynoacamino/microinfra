import { m as EnvPort } from "./pubsub-6-hdisbt.js";
//#region src/adapters/edge/cf-env.d.ts
interface CfBindings {
  KV?: unknown;
  MY_BUCKET?: unknown;
  DB?: unknown;
  [key: string]: unknown;
}
/** Raw Cloudflare bindings map (worker or Durable Object). */
type CfEnvMap = Record<string, unknown>;
declare global {
  var __env__: CfEnvMap | undefined;
  var __do_env__: CfEnvMap | undefined;
}
/**
 * Cloudflare bindings if present (worker or Durable Object), undefined on
 * node/local. Nitro sets `globalThis.__env__` on every worker entrypoint; code
 * running INSIDE a Durable Object (WS, stub.fetch) must stash `this.env` into
 * `globalThis.__do_env__` first (see stashDoEnv) — it takes priority here.
 */
declare function cfEnv(): CfEnvMap | undefined;
/** Only the string entries (secrets + vars), e.g. for env schema parsing. */
declare function cfVars(env: CfEnvMap): Record<string, string | undefined>;
declare class CloudflareEnv implements EnvPort {
  private readonly bindings;
  private readonly fallback;
  constructor(bindings?: CfBindings, fallback?: Record<string, string | undefined>);
  get(key: string): string | undefined;
  getRequired(key: string): string;
  all(): Record<string, string | undefined>;
  static isConfigured(bindings?: CfBindings): boolean;
}
//#endregion
export { cfVars as a, cfEnv as i, CfEnvMap as n, CloudflareEnv as r, CfBindings as t };
//# sourceMappingURL=cf-env-KpSLbRKQ.d.ts.map