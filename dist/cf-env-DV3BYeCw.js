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
		return Boolean(bindings && (bindings.KV || bindings.MY_BUCKET || bindings.DB));
	}
};

//#endregion
export { cfEnv as n, cfVars as r, CloudflareEnv as t };
//# sourceMappingURL=cf-env-DV3BYeCw.js.map