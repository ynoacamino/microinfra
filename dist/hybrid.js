import { t as createEnvConfig } from "./env-schema-CHblobMd.js";
import { n as requireOrm, t as ormOf } from "./types-COGhPH3r.js";
import { t as once } from "./singleton-Bej6xtaw.js";
import { n as cfEnv, t as CloudflareEnv } from "./cf-env-DV3BYeCw.js";
import { t as createAppRuntimeEdge } from "./app-runtime-edge-DzMHpE7l.js";
import { o as createRedisStreamsPubSub, t as createAppRuntime } from "./app-runtime--43GvF4R.js";

//#region src/runtime/hybrid.ts
/**
* Detects the target without building anything. Explicit bindings win,
* otherwise falls back to globalThis.__do_env__/__env__ (Nitro sets it).
*/
function resolveTarget(bindings) {
	const cf = bindings ?? cfEnv();
	return cf && (cf.DB ?? cf.KV ?? cf.MY_BUCKET ?? cf.QUEUE ?? cf.REALTIME_DO) ? "edge" : cf ? "edge" : "node";
}
function isEdgeBindings(bindings) {
	if (!bindings) return false;
	return Boolean(bindings.DB ?? bindings.KV ?? bindings.MY_BUCKET ?? bindings.QUEUE ?? bindings.REALTIME_DO);
}
/**
* One-line hybrid runtime: node (libsql) or edge (D1) from the same call.
* On edge, when UPSTASH_* / redis-http is configured, pubsub is upgraded to
* shared redis-streams so Worker mutations reach Durable Object subscriptions
* (both sides see the same events; the adapter is fetch-only, workerd-safe).
* Otherwise edge keeps the memory pubsub (same isolate only).
*/
function createHybridRuntime(bindings, opts = {}) {
	return once(opts.singletonKey ?? "hybrid", () => {
		const cf = bindings ?? cfEnv();
		if (cf && (isEdgeBindings(cf) || bindings !== void 0)) {
			const rt = createAppRuntimeEdge(cf, {
				relations: opts.relations,
				vars: opts.vars
			});
			if (!opts.disableSharedPubsub) try {
				const config = createEnvConfig(new CloudflareEnv(cf, opts.vars));
				if (config.redis.url && config.redis.token) {
					rt.pubsub = createRedisStreamsPubSub(config);
					rt.logger.info("edge pubsub: redis-streams compartido");
				}
			} catch {}
			return rt;
		}
		const vars = opts.vars ?? (typeof process === "undefined" ? void 0 : process.env);
		return createAppRuntime(vars, { relations: opts.relations });
	});
}

//#endregion
export { createHybridRuntime, ormOf, requireOrm, resolveTarget };
//# sourceMappingURL=hybrid.js.map