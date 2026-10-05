import { a as createMemoryObjects, i as createMemoryPubSub, n as createSystemClock, o as createMemoryCache, r as createMemoryRealtime, s as createConsoleLogger, t as createUuidIds } from "./uuid-ids-BZ5yYn8f.js";
import { n as createInfra, t as createEnvConfig } from "./env-schema-CHblobMd.js";
import { n as createQueuesQueue } from "./queues-C77o1reO.js";
import { t as CloudflareEnv } from "./cf-env-IK8m1hFH.js";
import { drizzle } from "drizzle-orm/d1";

//#region src/adapters/edge/d1-db.ts
function isD1Configured(bindings) {
	return Boolean(bindings?.DB);
}
function createD1Port(client, close, orm) {
	return {
		client,
		orm,
		close
	};
}

//#endregion
//#region src/adapters/edge/drizzle.ts
/** Drizzle over a D1 database binding. Shares the SQLite dialect (and relations) with libsql. */
function createD1DrizzleDb(binding, relations) {
	return drizzle(binding, { relations });
}

//#endregion
//#region src/adapters/edge/kv-cache.ts
function isKvConfigured(bindings) {
	return Boolean(bindings?.KV);
}
function createKvCache(binding) {
	return {
		get: (key) => binding.get(key),
		put: (key, value, opts) => binding.put(key, value, opts?.ttl ? { expirationTtl: opts.ttl } : void 0),
		delete: (key) => binding.delete(key),
		list: async (prefix = "") => {
			return (await binding.list({ prefix })).keys.map((k) => k.name);
		}
	};
}

//#endregion
//#region src/adapters/edge/r2-objects.ts
function isR2Configured(bindings) {
	return Boolean(bindings?.MY_BUCKET);
}
function createR2Port(deps) {
	return deps.port;
}
function putOptions(contentType, metadata) {
	return {
		httpMetadata: { contentType },
		customMetadata: metadata ?? {}
	};
}
var R2Objects = class {
	bucket;
	ids;
	publicUrl;
	constructor(bucket, opts = {}) {
		this.bucket = bucket;
		this.ids = opts.ids ?? (() => crypto.randomUUID());
		this.publicUrl = (opts.publicUrl ?? "").replace(/\/$/, "");
	}
	async put(key, body, options) {
		await this.bucket.put(key, body, putOptions(options.contentType, options.metadata));
		return this.getPublicUrl(key);
	}
	async delete(key) {
		await this.bucket.delete(key);
	}
	async read(key) {
		const object = await this.bucket.get(key);
		if (!object) throw new Error(`R2 read failed: missing ${key}`);
		return new Uint8Array(await object.arrayBuffer());
	}
	async getSignedUrl(key) {
		return this.getPublicUrl(key);
	}
	getPublicUrl(key) {
		return this.publicUrl ? `${this.publicUrl}/${key}` : `r2://${key}`;
	}
	generateKey(prefix) {
		return `${prefix}/${this.ids()}`;
	}
};
function createR2PortFromBinding(bucket, opts = {}) {
	return new R2Objects(bucket, opts);
}

//#endregion
//#region src/runtime/edge.ts
function isKvBindingLike(value) {
	if (typeof value !== "object" || value === null) return false;
	const binding = value;
	return typeof binding.get === "function" && typeof binding.put === "function" && typeof binding.delete === "function";
}
function isR2BindingLike(value) {
	if (typeof value !== "object" || value === null) return false;
	const binding = value;
	return typeof binding.put === "function" && typeof binding.get === "function" && typeof binding.delete === "function";
}
function isQueueBindingLike(value) {
	if (typeof value !== "object" || value === null) return false;
	return typeof value.send === "function";
}
function createEdgeInfra(opts) {
	const env = new CloudflareEnv(opts.bindings, opts.vars);
	const config = opts.config ?? createEnvConfig(env);
	let kvBinding = opts.kvBinding;
	const kvFromBindings = opts.bindings?.KV;
	if (!kvBinding && isKvBindingLike(kvFromBindings)) kvBinding = kvFromBindings;
	let cache = createMemoryCache();
	if (kvBinding) cache = createKvCache(kvBinding);
	let objectPort = opts.objectPort;
	if (!objectPort) {
		const r2FromBindings = opts.bindings?.MY_BUCKET;
		if (opts.r2Binding) objectPort = createR2PortFromBinding(opts.r2Binding);
		else if (isR2BindingLike(r2FromBindings)) objectPort = createR2PortFromBinding(r2FromBindings);
		else objectPort = createMemoryObjects();
	}
	let queuePort = opts.queuePort;
	if (!queuePort) {
		const queueFromBindings = opts.bindings?.QUEUE;
		if (opts.queueBinding) queuePort = createQueuesQueue(opts.queueBinding);
		else if (isQueueBindingLike(queueFromBindings)) queuePort = createQueuesQueue(queueFromBindings);
	}
	const db = createD1Port(opts.dbClient, opts.dbClose, opts.dbOrm);
	return createInfra({
		mode: "edge",
		env,
		config,
		logger: createConsoleLogger("edge"),
		clock: createSystemClock(),
		ids: createUuidIds(),
		db,
		cache,
		objects: objectPort,
		queue: queuePort,
		pubsub: opts.pubsubPort ?? createMemoryPubSub(),
		realtime: opts.realtimePort ?? createMemoryRealtime()
	});
}

//#endregion
//#region src/runtime/app-runtime-edge.ts
/**
* One-line edge runtime: resolves the D1 binding (KV/R2/Queues auto-resolved
* from bindings by createEdgeInfra), builds Drizzle with the app relations.
*/
function createAppRuntimeEdge(bindings, opts = {}) {
	const dbBinding = opts.dbBinding ?? bindings?.DB;
	if (!dbBinding) throw new Error("[microinfra] binding D1 (DB) requerido para createAppRuntimeEdge");
	const orm = createD1DrizzleDb(dbBinding, opts.relations);
	return createEdgeInfra({
		bindings,
		vars: opts.vars,
		config: opts.config,
		dbClient: dbBinding,
		dbOrm: orm
	});
}

//#endregion
export { createR2PortFromBinding as a, isKvConfigured as c, isD1Configured as d, createR2Port as i, createD1DrizzleDb as l, createEdgeInfra as n, isR2Configured as o, R2Objects as r, createKvCache as s, createAppRuntimeEdge as t, createD1Port as u };
//# sourceMappingURL=app-runtime-edge-Cojf_wPv.js.map