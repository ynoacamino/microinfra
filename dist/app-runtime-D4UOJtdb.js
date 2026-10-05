import { a as createMemoryObjects, c as createNoopLogger, i as createMemoryPubSub, n as createSystemClock, o as createMemoryCache, r as createMemoryRealtime, s as createConsoleLogger, t as createUuidIds } from "./uuid-ids-BZ5yYn8f.js";
import { t as createMemoryQueue } from "./memory-queue-Fm7wdof8.js";
import { n as createInfra, t as createEnvConfig } from "./env-schema-CHblobMd.js";
import { drizzle } from "drizzle-orm/libsql";
import { drizzle as drizzle$1 } from "drizzle-orm/libsql/http";
import { AwsClient } from "aws4fetch";
import { createClient } from "@libsql/client";

//#region src/adapters/node/drizzle.ts
/** Drizzle over a local/embedded libsql client (`file:` URLs). */
function createLibsqlDrizzleDb(client, relations) {
	return drizzle({
		client,
		relations
	});
}
/** Drizzle over a remote libsql client (`http(s):`/`libsql:` URLs: libsql-server, Turso). */
function createLibsqlHttpDrizzleDb(client, relations) {
	return drizzle$1({
		client,
		relations
	});
}

//#endregion
//#region src/adapters/node/libsql-db.ts
function isLibsqlConfigured(config) {
	return Boolean(config.database.url);
}
function createLibsqlPort(client, close, orm) {
	return {
		client,
		orm,
		close
	};
}

//#endregion
//#region src/adapters/node/node-env.ts
function readProcessEnv() {
	const proc = globalThis.process;
	return proc?.env ? { ...proc.env } : {};
}
var NodeEnv = class {
	vars;
	constructor(vars) {
		this.vars = vars ?? readProcessEnv();
	}
	get(key) {
		return this.vars[key];
	}
	getRequired(key) {
		const value = this.vars[key];
		if (value === void 0) throw new Error(`[env] Missing required key: ${key}`);
		return value;
	}
	all() {
		return { ...this.vars };
	}
	static isConfigured() {
		return true;
	}
};

//#endregion
//#region src/adapters/node/redis-cache.ts
function isRedisConfigured(config) {
	return Boolean(config.redis.url && config.redis.token);
}
async function upstashCommand(baseUrl, token, command) {
	const normalized = baseUrl.replace(/\/$/, "");
	const res = await fetch(`${normalized}/`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json"
		},
		body: JSON.stringify(command)
	});
	if (!res.ok) throw new Error(`[cache] Upstash error: ${res.status}`);
	return (await res.json()).result;
}
function createHttpRedisCache(config) {
	const baseUrl = config.redis.url;
	const token = config.redis.token;
	return {
		get: (key) => upstashCommand(baseUrl, token, ["GET", key]),
		put: async (key, value, opts) => {
			const command = opts?.ttl ? [
				"SET",
				key,
				value,
				"EX",
				String(opts.ttl)
			] : [
				"SET",
				key,
				value
			];
			await upstashCommand(baseUrl, token, command);
		},
		delete: async (key) => {
			await upstashCommand(baseUrl, token, ["DEL", key]);
		},
		list: (prefix = "") => upstashCommand(baseUrl, token, ["KEYS", `${prefix}*`])
	};
}

//#endregion
//#region src/adapters/node/redis-http.ts
function normalizeUrl(baseUrl) {
	return baseUrl.replace(/\/$/, "");
}
async function sendRedisCommand(baseUrl, token, command) {
	const res = await fetch(`${normalizeUrl(baseUrl)}/`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json"
		},
		body: JSON.stringify(command)
	});
	if (!res.ok) throw new Error(`[redis-http] Command failed with status ${res.status}`);
	return (await res.json()).result;
}
async function sendRedisPipeline(baseUrl, token, commands) {
	const res = await fetch(`${normalizeUrl(baseUrl)}/pipeline`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json"
		},
		body: JSON.stringify(commands)
	});
	if (!res.ok) throw new Error(`[redis-http] Pipeline failed with status ${res.status}`);
	return (await res.json()).map((entry) => entry.result);
}
/** Converts flat `["k1","v1","k2","v2"]` field arrays into an object. */
function parseRedisFields(rawFields) {
	const fields = {};
	if (!Array.isArray(rawFields)) return fields;
	for (let index = 0; index < rawFields.length; index += 2) {
		const key = rawFields[index];
		const value = rawFields[index + 1];
		if (typeof key !== "string" || value === void 0) continue;
		fields[key] = String(value);
	}
	return fields;
}

//#endregion
//#region src/adapters/node/redis-streams.ts
const DEFAULT_STREAM = "microinfra:jobs";
const DEFAULT_GROUP = "microinfra-processors";
function isStreamsConfigured(config) {
	return Boolean(config.redis.url && config.redis.token);
}
function parseEntry(entry) {
	if (!Array.isArray(entry)) return null;
	const [streamId, rawFields] = entry;
	if (typeof streamId !== "string") return null;
	const fields = parseRedisFields(rawFields);
	if (!streamId || !fields.jobId || !fields.jobType) return null;
	const job = {
		streamId,
		jobId: fields.jobId,
		jobType: fields.jobType
	};
	if (fields.data !== void 0) job.data = fields.data;
	return job;
}
var RedisStreamsQueue = class {
	baseUrl;
	token;
	stream;
	group;
	consumer;
	pollIntervalMs;
	staleMinIdleMs;
	logger;
	running = false;
	pollTimer = null;
	groupReady = false;
	constructor(config, opts = {}) {
		this.baseUrl = config.redis.url;
		this.token = config.redis.token;
		this.stream = opts.stream ?? DEFAULT_STREAM;
		this.group = opts.group ?? DEFAULT_GROUP;
		this.consumer = opts.consumer ?? `worker-${crypto.randomUUID().slice(0, 8)}`;
		this.pollIntervalMs = opts.pollIntervalMs ?? 1e3;
		this.staleMinIdleMs = opts.staleMinIdleMs ?? 6e4;
		this.logger = opts.logger ?? createNoopLogger();
	}
	async ensureGroup() {
		if (this.groupReady) return;
		try {
			await sendRedisCommand(this.baseUrl, this.token, [
				"XGROUP",
				"CREATE",
				this.stream,
				this.group,
				"0",
				"MKSTREAM"
			]);
		} catch {
			this.logger.debug("Consumer group already exists", { group: this.group });
		}
		this.groupReady = true;
	}
	async enqueueJob(jobId, jobType, data) {
		try {
			await this.ensureGroup();
			const command = [
				"XADD",
				this.stream,
				"*",
				"jobId",
				jobId,
				"jobType",
				jobType
			];
			if (data !== void 0) command.push("data", data);
			command.push("enqueuedAt", Date.now().toString());
			await sendRedisCommand(this.baseUrl, this.token, command);
			return true;
		} catch (error) {
			this.logger.error("Failed to enqueue job", {
				jobId,
				jobType,
				error: String(error)
			});
			return false;
		}
	}
	async processNextJob() {
		try {
			const result = await sendRedisCommand(this.baseUrl, this.token, [
				"XREADGROUP",
				"GROUP",
				this.group,
				this.consumer,
				"STREAMS",
				this.stream,
				">"
			]);
			if (!Array.isArray(result) || result.length === 0) return null;
			const first = result[0];
			if (!Array.isArray(first)) return null;
			const entries = first[1];
			if (!Array.isArray(entries) || entries.length === 0) return null;
			return parseEntry(entries[0]);
		} catch (error) {
			this.logger.error("Failed to read from stream", { error: String(error) });
			return null;
		}
	}
	async ackJob(streamId) {
		await sendRedisPipeline(this.baseUrl, this.token, [[
			"XACK",
			this.stream,
			this.group,
			streamId
		], [
			"XDEL",
			this.stream,
			streamId
		]]);
	}
	async reclaimStaleEntries(minIdleMs = this.staleMinIdleMs) {
		const claimed = [];
		try {
			let cursor = "0-0";
			for (let i = 0; i < 10; i++) {
				const result = await sendRedisCommand(this.baseUrl, this.token, [
					"XAUTOCLAIM",
					this.stream,
					this.group,
					this.consumer,
					String(minIdleMs),
					String(cursor),
					"COUNT",
					"10"
				]);
				if (!Array.isArray(result) || result.length < 2) break;
				const [nextCursor, entries] = result;
				if (Array.isArray(entries)) for (const entry of entries) {
					const parsed = parseEntry(entry);
					if (parsed) claimed.push(parsed);
				}
				if (typeof nextCursor !== "string" || nextCursor === "0-0") break;
				cursor = nextCursor;
			}
		} catch (error) {
			this.logger.error("Failed to reclaim stale entries", { error: String(error) });
		}
		return claimed;
	}
	async startWorker(onJob) {
		await this.ensureGroup();
		this.running = true;
		const stale = await this.reclaimStaleEntries();
		for (const job of stale) {
			await this.runJob(onJob, job);
			if (!this.running) return;
		}
		const poll = async () => {
			if (!this.running) return;
			const job = await this.processNextJob();
			if (job) await this.runJob(onJob, job);
			if (this.running) this.pollTimer = setTimeout(() => void poll(), this.pollIntervalMs);
		};
		await poll();
	}
	async stopWorker() {
		this.running = false;
		if (this.pollTimer) {
			clearTimeout(this.pollTimer);
			this.pollTimer = null;
		}
	}
	isWorkerRunning() {
		return this.running;
	}
	async runJob(onJob, job) {
		try {
			await onJob(job);
			await this.ackJob(job.streamId);
		} catch (error) {
			this.logger.error("Job failed, left pending in the stream", {
				jobId: job.jobId,
				error: String(error)
			});
		}
	}
};
function createRedisStreamsQueue(config, opts = {}) {
	return new RedisStreamsQueue(config, opts);
}

//#endregion
//#region src/adapters/node/redis-pubsub.ts
const DEFAULT_PREFIX = "microinfra:pubsub";
const OUTBOX_TTL_MS = 6e4;
const OUTBOX_MAX = 1e3;
function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
function decodePayload(raw) {
	if (raw === void 0) return;
	try {
		return JSON.parse(raw).data;
	} catch {
		return raw;
	}
}
/**
* Fan-out PubSub over Redis Streams via HTTP (SRH/Upstash).
* Each channel maps to a stream; subscribers poll with XREAD from a cursor
* captured eagerly at subscribe() time, so only messages published after
* subscribing are delivered (memory parity, at-least-once within the
* subscribe handshake window, deduplicated by message id).
*/
var RedisStreamsPubSub = class {
	baseUrl;
	token;
	prefix;
	pollIntervalMs;
	batchSize;
	maxLen;
	logger;
	outbox = [];
	constructor(config, opts = {}) {
		if (!isStreamsConfigured(config)) throw new Error("[pubsub] Redis is not configured (UPSTASH_REDIS_REST_URL/TOKEN)");
		this.baseUrl = config.redis.url;
		this.token = config.redis.token;
		this.prefix = opts.prefix ?? DEFAULT_PREFIX;
		this.pollIntervalMs = opts.pollIntervalMs ?? 250;
		this.batchSize = opts.batchSize ?? 50;
		this.maxLen = opts.maxLen ?? 500;
		this.logger = opts.logger ?? createNoopLogger();
	}
	streamFor(channel) {
		return `${this.prefix}:${channel}`;
	}
	pruneOutbox(now) {
		while (this.outbox.length > 0) {
			const oldest = this.outbox[0];
			if (oldest && now - oldest.at < OUTBOX_TTL_MS) break;
			this.outbox.shift();
		}
	}
	drainOutbox(channel, subscribedAt, seen) {
		const now = Date.now();
		this.pruneOutbox(now);
		const pending = [];
		for (const entry of this.outbox) {
			if (entry.channel !== channel || entry.at < subscribedAt || seen.has(entry.mid)) continue;
			seen.add(entry.mid);
			pending.push(entry.data);
		}
		return pending;
	}
	async latestId(stream) {
		try {
			const result = await sendRedisCommand(this.baseUrl, this.token, [
				"XREVRANGE",
				stream,
				"+",
				"-",
				"COUNT",
				"1"
			]);
			if (Array.isArray(result) && result.length > 0) {
				const first = result[0];
				if (Array.isArray(first) && typeof first[0] === "string") return first[0];
			}
		} catch (error) {
			this.logger.debug("Failed to read latest stream id, starting from zero", {
				stream,
				error: String(error)
			});
		}
		return "0-0";
	}
	async readSince(stream, cursor) {
		const result = await sendRedisCommand(this.baseUrl, this.token, [
			"XREAD",
			"COUNT",
			String(this.batchSize),
			"STREAMS",
			stream,
			cursor
		]);
		const entries = [];
		if (!Array.isArray(result) || result.length === 0) return entries;
		const first = result[0];
		if (!Array.isArray(first)) return entries;
		const rawEntries = first[1];
		if (!Array.isArray(rawEntries)) return entries;
		for (const raw of rawEntries) {
			if (!Array.isArray(raw)) continue;
			const [id, rawFields] = raw;
			if (typeof id !== "string") continue;
			const fields = parseRedisFields(rawFields);
			entries.push({
				id,
				mid: fields.mid,
				data: decodePayload(fields.data)
			});
		}
		return entries;
	}
	publish(channel, data) {
		const mid = crypto.randomUUID();
		let payload;
		try {
			payload = JSON.stringify({ data });
		} catch (error) {
			this.logger.error("Failed to serialize pubsub payload", {
				channel,
				error: String(error)
			});
			return;
		}
		this.outbox.push({
			channel,
			mid,
			data,
			at: Date.now()
		});
		if (this.outbox.length > OUTBOX_MAX) this.outbox.splice(0, this.outbox.length - OUTBOX_MAX);
		const stream = this.streamFor(channel);
		sendRedisPipeline(this.baseUrl, this.token, [[
			"XADD",
			stream,
			"*",
			"data",
			payload,
			"mid",
			mid
		], [
			"XTRIM",
			stream,
			"MAXLEN",
			String(this.maxLen)
		]]).catch((error) => {
			this.logger.error("Failed to publish pubsub message", {
				channel,
				error: String(error)
			});
		});
	}
	subscribe(channel) {
		const self = this;
		const stream = this.streamFor(channel);
		const subscribedAt = Date.now();
		const cursorPromise = this.latestId(stream);
		let cancelled = false;
		async function* iterator() {
			const seen = /* @__PURE__ */ new Set();
			try {
				for (const local of self.drainOutbox(channel, subscribedAt, seen)) {
					if (cancelled) break;
					yield local;
				}
				let cursor = await cursorPromise;
				for (;;) {
					if (cancelled) break;
					for (const local of self.drainOutbox(channel, subscribedAt, seen)) {
						if (cancelled) break;
						yield local;
					}
					if (cancelled) break;
					let entries;
					try {
						entries = await self.readSince(stream, cursor);
					} catch (error) {
						self.logger.error("Failed to poll pubsub stream", {
							channel,
							error: String(error)
						});
						await sleep(self.pollIntervalMs);
						continue;
					}
					for (const entry of entries) {
						if (cancelled) break;
						cursor = entry.id;
						if (entry.mid && seen.has(entry.mid)) continue;
						if (entry.mid) seen.add(entry.mid);
						yield entry.data;
					}
					await sleep(self.pollIntervalMs);
				}
			} finally {
				cancelled = true;
			}
		}
		return {
			[Symbol.asyncIterator]() {
				return iterator();
			},
			close() {
				cancelled = true;
			}
		};
	}
};
function createRedisStreamsPubSub(config, opts = {}) {
	return new RedisStreamsPubSub(config, opts);
}

//#endregion
//#region src/adapters/node/s3-objects.ts
const SIGNED_URL_EARLY_REFRESH_SEC = 300;
const SIGNED_URL_CACHE_MAX_ENTRIES = 500;
const SIGNED_URL_MIN_MAX_AGE_SEC = 60;
function isS3Configured(config) {
	return Boolean(config.s3.accessKeyId && config.s3.secretAccessKey && (config.s3.endpoint || config.s3.bucket));
}
var S3Objects = class {
	client;
	bucket;
	region;
	endpoint;
	publicUrl;
	forcePathStyle;
	ids;
	signedUrlCache = /* @__PURE__ */ new Map();
	constructor(config, opts = {}) {
		this.ids = opts.ids ?? (() => crypto.randomUUID());
		this.client = new AwsClient({
			accessKeyId: config.s3.accessKeyId,
			secretAccessKey: config.s3.secretAccessKey,
			service: "s3",
			region: config.s3.region
		});
		this.bucket = config.s3.bucket;
		this.region = config.s3.region;
		this.endpoint = config.s3.endpoint;
		this.publicUrl = config.s3.publicUrl;
		this.forcePathStyle = config.s3.forcePathStyle;
	}
	getInternalUrl() {
		const normalized = this.endpoint.replace(/\/$/, "");
		if (this.forcePathStyle) return `${normalized}/${this.bucket}`;
		const host = normalized.replace(/^https?:\/\//, "");
		return `https://${this.bucket}.${host}`;
	}
	getExternalUrl() {
		if (this.publicUrl) return this.publicUrl.replace(/\/$/, "");
		return this.getInternalUrl();
	}
	async put(key, body, options) {
		const url = `${this.getInternalUrl()}/${key}`;
		const headers = { "Content-Type": options.contentType };
		if (options.metadata) for (const [name, value] of Object.entries(options.metadata)) headers[`x-amz-meta-${name}`] = value;
		const response = await this.client.fetch(url, {
			method: "PUT",
			headers,
			body,
			aws: {
				service: "s3",
				region: this.region
			}
		});
		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`S3 upload failed: ${response.status} ${errorText}`);
		}
		return this.getPublicUrl(key);
	}
	async delete(key) {
		for (const cacheKey of [...this.signedUrlCache.keys()]) if (cacheKey.startsWith(`${key}|`)) this.signedUrlCache.delete(cacheKey);
		const url = `${this.getInternalUrl()}/${key}`;
		const response = await this.client.fetch(url, {
			method: "DELETE",
			aws: {
				service: "s3",
				region: this.region
			}
		});
		if (!response.ok && response.status !== 404) {
			const errorText = await response.text();
			throw new Error(`S3 delete failed: ${response.status} ${errorText}`);
		}
	}
	async read(key) {
		const url = `${this.getInternalUrl()}/${key}`;
		const response = await this.client.fetch(url, {
			method: "GET",
			aws: {
				service: "s3",
				region: this.region
			}
		});
		if (!response.ok) throw new Error(`S3 read failed: ${response.status} ${key}`);
		return new Uint8Array(await response.arrayBuffer());
	}
	async getSignedUrl(key, expiresIn = 3600) {
		const cacheKey = `${key}|${expiresIn}`;
		const cached = this.signedUrlCache.get(cacheKey);
		if (cached && Date.now() < cached.expiresAtMs - SIGNED_URL_EARLY_REFRESH_SEC * 1e3) return cached.url;
		const maxAge = Math.max(expiresIn - SIGNED_URL_EARLY_REFRESH_SEC, SIGNED_URL_MIN_MAX_AGE_SEC);
		const url = new URL(`${this.getExternalUrl()}/${key}`);
		url.searchParams.set("X-Amz-Expires", String(expiresIn));
		url.searchParams.set("response-cache-control", `public, max-age=${maxAge}`);
		const signedUrl = (await this.client.sign(url.toString(), {
			method: "GET",
			aws: {
				service: "s3",
				region: this.region,
				signQuery: true
			}
		})).url.toString();
		if (this.signedUrlCache.size >= SIGNED_URL_CACHE_MAX_ENTRIES) {
			const oldest = this.signedUrlCache.keys().next();
			if (!oldest.done) this.signedUrlCache.delete(oldest.value);
		}
		this.signedUrlCache.set(cacheKey, {
			url: signedUrl,
			expiresAtMs: Date.now() + expiresIn * 1e3
		});
		return signedUrl;
	}
	getPublicUrl(key) {
		return `${this.getExternalUrl()}/${key}`;
	}
	generateKey(prefix) {
		return `${prefix}/${this.ids()}`;
	}
};
function createS3Port(config, opts = {}) {
	return new S3Objects(config, opts);
}

//#endregion
//#region src/runtime/node.ts
function createNodeInfra(opts) {
	const env = new NodeEnv(opts.vars);
	const config = opts.config ?? createEnvConfig(env);
	const cache = isRedisConfigured(config) ? createHttpRedisCache(config) : createMemoryCache();
	const db = createLibsqlPort(opts.dbClient, opts.dbClose, opts.dbOrm);
	const objects = opts.objectPort ?? createMemoryObjects();
	return createInfra({
		mode: "node",
		env,
		config,
		logger: createConsoleLogger("node"),
		clock: createSystemClock(),
		ids: createUuidIds(),
		db,
		cache,
		objects,
		queue: isStreamsConfigured(config) ? createRedisStreamsQueue(config) : createMemoryQueue(),
		pubsub: isStreamsConfigured(config) ? createRedisStreamsPubSub(config) : createMemoryPubSub(),
		realtime: opts.realtimePort ?? createMemoryRealtime()
	});
}

//#endregion
//#region src/runtime/app-runtime.ts
function resolveDatabaseUrl(config, forbidFileDb) {
	const url = config.database.url;
	if (!url) throw new Error("[microinfra] DATABASE_URL es requerido para createAppRuntime");
	if (forbidFileDb && url.startsWith("file:")) throw new Error("[microinfra] file: DATABASE_URL prohibido en createAppRuntime, usa libsql-server (http:) o forbidFileDb:false");
	return url;
}
/**
* One-line node runtime: parses env, opens the libsql client (branching by
* URL scheme), builds Drizzle with the app relations, and wires cache/queue/
* pubsub/objects with the standard fallbacks (memory unless Redis/S3 configured).
*/
function createAppRuntime(vars, opts = {}) {
	const env = new NodeEnv(vars);
	const config = opts.config ?? createEnvConfig(env);
	const url = resolveDatabaseUrl(config, opts.forbidFileDb ?? true);
	const remote = !url.startsWith("file:");
	const client = createClient(remote && config.database.authToken ? {
		url,
		authToken: config.database.authToken
	} : { url });
	const orm = remote ? createLibsqlHttpDrizzleDb(client, opts.relations) : createLibsqlDrizzleDb(client, opts.relations);
	const objects = opts.objects === void 0 || opts.objects === "auto" ? isS3Configured(config) ? createS3Port(config) : createMemoryObjects() : opts.objects;
	return createNodeInfra({
		vars,
		config,
		dbClient: client,
		dbClose: async () => {
			client.close();
		},
		dbOrm: orm,
		objectPort: objects
	});
}

//#endregion
export { RedisStreamsPubSub as a, createRedisStreamsQueue as c, isRedisConfigured as d, NodeEnv as f, createLibsqlHttpDrizzleDb as g, createLibsqlDrizzleDb as h, isS3Configured as i, isStreamsConfigured as l, isLibsqlConfigured as m, createNodeInfra as n, createRedisStreamsPubSub as o, createLibsqlPort as p, createS3Port as r, RedisStreamsQueue as s, createAppRuntime as t, createHttpRedisCache as u };
//# sourceMappingURL=app-runtime-D4UOJtdb.js.map