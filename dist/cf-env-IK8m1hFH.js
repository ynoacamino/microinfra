//#region src/adapters/edge/cf-env.ts
/**
* Cloudflare bindings if present (worker or Durable Object), undefined on
* node/local. Nitro sets `globalThis.__env__` on every worker entrypoint; code
* running INSIDE a Durable Object (WS, stub.fetch) must stash `this.env` into
* `globalThis.__do_env__` first (see stashDoEnv) — it takes priority here.
*/
function cfEnv() {
	if (typeof globalThis === "undefined") return void 0;
	return globalThis.__do_env__ ?? globalThis.__env__;
}
/**
* Strict check: does this value carry Cloudflare bindings?
* An empty object means node — frameworks like Hono expose c.env = {}
* on Bun, and that must not build an edge runtime.
*/
function hasEdgeBindings(env) {
	if (typeof env !== "object" || env === null) return false;
	const bindings = env;
	if ("DB" in bindings) return true;
	if ("KV" in bindings) return true;
	if ("MY_BUCKET" in bindings) return true;
	if ("QUEUE" in bindings) return true;
	if ("REALTIME_DO" in bindings) return true;
	return false;
}
/** Only the string entries (secrets + vars), e.g. for env schema parsing. */
function cfVars(env) {
	const out = {};
	for (const [key, value] of Object.entries(env)) if (typeof value === "string") out[key] = value;
	return out;
}
var CloudflareEnv = class {
	bindings;
	fallback;
	constructor(bindings, fallback) {
		this.bindings = bindings ?? {};
		this.fallback = fallback ?? {};
	}
	get(key) {
		const binding = this.bindings[key];
		if (typeof binding === "string") return binding;
		return this.fallback[key];
	}
	getRequired(key) {
		const value = this.get(key);
		if (value === void 0) throw new Error(`[env] Missing required key: ${key}`);
		return value;
	}
	all() {
		const out = { ...this.fallback };
		for (const [key, value] of Object.entries(this.bindings)) if (typeof value === "string") out[key] = value;
		return out;
	}
	static isConfigured(bindings) {
		return hasEdgeBindings(bindings);
	}
};

//#endregion
export { hasEdgeBindings as i, cfEnv as n, cfVars as r, CloudflareEnv as t };
//# sourceMappingURL=cf-env-IK8m1hFH.js.map