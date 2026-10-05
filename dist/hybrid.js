import { t as createEnvConfig } from "./env-schema-CHblobMd.js";
import { t as once } from "./singleton-Bej6xtaw.js";
import { i as hasEdgeBindings, n as cfEnv, t as CloudflareEnv } from "./cf-env-IK8m1hFH.js";
import { t as createAppRuntimeEdge } from "./app-runtime-edge-Cojf_wPv.js";
import { o as createRedisStreamsPubSub, t as createAppRuntime } from "./app-runtime-D4UOJtdb.js";

//#region src/runtime/hybrid.ts
/**
* One-line hybrid runtime: node (libsql) or edge (D1) from the same call.
* On edge, when UPSTASH_* / redis-http is configured, pubsub is upgraded to
* shared redis-streams so Worker mutations reach Durable Object subscriptions
* (both sides see the same events; the adapter is fetch-only, workerd-safe).
* Otherwise edge keeps the memory pubsub (same isolate only).
*/
function createHybridRuntime(bindings, opts = {}) {
	const cf = bindings ?? cfEnv();
	const target = cf && (hasEdgeBindings(cf) || bindings !== void 0) ? "edge" : "node";
	return once(`${opts.singletonKey ?? "hybrid"}:${target}`, () => {
		if (target === "edge" && cf) {
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
export { createHybridRuntime, hasEdgeBindings };
//# sourceMappingURL=hybrid.js.map