import { a as createMemoryObjects, c as createNoopLogger, i as createMemoryPubSub, n as createSystemClock, o as createMemoryCache, r as createMemoryRealtime, s as createConsoleLogger, t as createUuidIds } from "./uuid-ids-BZ5yYn8f.js";
import { n as createMapEnv, t as createNoopCache } from "./noop-cache-DW5EVV6R.js";
import { t as createMemoryQueue } from "./memory-queue-Fm7wdof8.js";
import { n as decodeRealtimeMessage, r as isWebSocketUpgradeRequest, t as RealtimeHub } from "./realtime-hub-DeePlZ4G.js";
import { n as createInfra, t as createEnvConfig } from "./env-schema-CHblobMd.js";
import { n as ensureWorkerStarted, t as enqueueJobAndWait } from "./queue-helpers-BqPu8bam.js";
import { t as once } from "./singleton-Bej6xtaw.js";
import { n as runWorker, t as runUniversalWorker } from "./universal-worker-oXfN3-sG.js";
import { execute, getOperationAST, parse, subscribe, validate } from "graphql";

//#region src/core/cache-json.ts
/**
* JSON over CachePort under a namespace. Reads never throw (miss, corrupt
* payload or backend error all resolve to null); writes propagate errors so
* silent cache loss stays visible — callers add .catch() only for
* fire-and-forget writes.
*/
function cacheJson(cache, namespace) {
	const buildKey = (parts) => `${namespace}:${parts.join(":")}`;
	return {
		key: (...parts) => buildKey(parts),
		get: async (...parts) => {
			try {
				const raw = await cache.get(buildKey(parts));
				if (raw === null) return null;
				return JSON.parse(raw);
			} catch {
				return null;
			}
		},
		put: async (value, parts, opts) => {
			await cache.put(buildKey(parts), JSON.stringify(value), opts?.ttl === void 0 ? void 0 : { ttl: opts.ttl });
		},
		invalidate: async (...parts) => {
			await cache.delete(buildKey(parts));
		}
	};
}

//#endregion
//#region src/core/define-adapter.ts
function defineAdapter(def) {
	return def;
}

//#endregion
//#region src/db/types.ts
/** Returns the typed orm or undefined (no throw). */
function ormOf(rt) {
	return rt.db.orm;
}
/** Returns the typed orm or throws with an actionable message. */
function requireOrm(rt) {
	const orm = ormOf(rt);
	if (!orm) throw new Error("[microinfra] DB orm no disponible (revisa DATABASE_URL o binding D1)");
	return orm;
}

//#endregion
//#region src/http/response.ts
/**
* Re-wraps a Response as a native global Response. Frameworks (Yoga, Hono)
* may return cross-realm Response objects that break `instanceof` checks in
* adapters like TanStack Start; re-wrapping fixes the prototype chain.
* Note: buffers the body, so it is not suitable for SSE/streaming responses.
*/
async function toNativeResponse(res) {
	const headers = new Headers();
	res.headers.forEach((value, key) => {
		headers.append(key, value);
	});
	const buffer = await res.arrayBuffer();
	return new Response(buffer.byteLength === 0 ? null : buffer, {
		status: res.status,
		statusText: res.statusText,
		headers
	});
}

//#endregion
//#region src/runtime/test.ts
function createTestInfra(opts = {}) {
	const env = createMapEnv(opts.env ?? {});
	const config = createEnvConfig(env);
	return createInfra({
		mode: opts.mode ?? "test",
		env,
		config,
		logger: opts.silent === false ? createConsoleLogger("test") : createNoopLogger(),
		clock: createSystemClock(),
		ids: createUuidIds(),
		db: { client: { tag: "memory-test-db" } },
		cache: createMemoryCache(),
		objects: createMemoryObjects(),
		queue: createMemoryQueue(),
		pubsub: createMemoryPubSub(),
		realtime: createMemoryRealtime()
	});
}

//#endregion
//#region src/sanitize.ts
function sanitize(obj) {
	return sanitizeValue(obj);
}
function sanitizeValue(obj) {
	if (obj === null) return;
	if (typeof obj !== "object") return obj;
	if (Array.isArray(obj)) return obj.map((item) => sanitizeValue(item));
	const result = {};
	for (const [key, value] of Object.entries(obj)) result[key] = sanitizeValue(value);
	return result;
}

//#endregion
//#region src/service/context.ts
/** Maps a better-auth style session to a ServiceUser (null when signed out). */
function sessionUser(session) {
	if (!session?.user) return null;
	return {
		id: session.user.id,
		email: session.user.email ?? null,
		name: session.user.name ?? null
	};
}
/** Builds the shared GraphQL/WS service context from a runtime. */
function contextFromRuntime(rt, opts) {
	return {
		db: opts.db,
		runtime: rt,
		user: opts.user,
		request: opts.request
	};
}
/** Placeholder request for transports without one (e.g. WebSocket upgrade). */
function syntheticRequest(url = "ws://internal") {
	return new Request(url);
}

//#endregion
//#region src/service/graphql-ws.ts
function errPayload(err) {
	return [{ message: err instanceof Error ? err.message : "Subscription failed" }];
}
/**
* graphql-ws protocol machine (connection_init/ack, ping/pong, subscribe with
* query/mutation/subscription, complete). State lives on the instance, so each
* handler owns its peer/operation registry and is independently testable with
* fake peers — no transport involved.
*/
function createGraphqlWs({ schema, getContext }) {
	const ops = /* @__PURE__ */ new Map();
	function peerOps(peerId) {
		let m = ops.get(peerId);
		if (!m) {
			m = /* @__PURE__ */ new Map();
			ops.set(peerId, m);
		}
		return m;
	}
	async function stopOp(peerId, id) {
		const op = ops.get(peerId)?.get(id);
		if (!op) return;
		ops.get(peerId)?.delete(id);
		stopOpState(op);
	}
	async function stopAll(peerId) {
		const m = ops.get(peerId);
		if (!m) return;
		ops.delete(peerId);
		for (const op of m.values()) stopOpState(op);
	}
	function stopOpState(op) {
		if (op.done) return;
		op.done = true;
		try {
			const result = op.iterator.return?.();
			if (result && typeof result.catch === "function") result.catch(() => {});
		} catch {}
	}
	return {
		open(peerId) {
			peerOps(peerId);
		},
		async message(peer, data) {
			let msg;
			try {
				msg = JSON.parse(data);
			} catch {
				return;
			}
			if (msg.type === "connection_init") {
				peer.send(JSON.stringify({ type: "connection_ack" }));
				return;
			}
			if (msg.type === "ping") {
				peer.send(JSON.stringify({ type: "pong" }));
				return;
			}
			if (msg.type === "complete") {
				if (msg.id) await stopOp(peer.id, msg.id);
				return;
			}
			if (msg.type !== "subscribe" || !msg.id || typeof msg.payload?.query !== "string") return;
			const id = msg.id;
			const send = (type, payload) => {
				peer.send(JSON.stringify(payload === void 0 ? {
					type,
					id
				} : {
					type,
					id,
					payload
				}));
			};
			const contextValue = await getContext(peer);
			let document;
			try {
				document = parse(msg.payload.query);
			} catch (err) {
				send("error", errPayload(err));
				return;
			}
			const validationErrors = validate(schema, document);
			if (validationErrors.length > 0) {
				send("error", validationErrors.map((e) => ({ message: e.message })));
				return;
			}
			const operation = getOperationAST(document, msg.payload.operationName);
			const variableValues = msg.payload.variables ?? void 0;
			try {
				if (operation?.operation === "subscription") {
					const result = await subscribe({
						schema,
						document,
						variableValues,
						contextValue
					});
					if (typeof result[Symbol.asyncIterator] !== "function") {
						send("error", result.errors?.map((e) => ({ message: e.message })) ?? errPayload("subscribe failed"));
						send("complete");
						return;
					}
					const iterator = result[Symbol.asyncIterator]();
					peerOps(peer.id).set(id, {
						iterator,
						done: false
					});
					try {
						while (true) {
							const { value, done } = await iterator.next();
							const state = peerOps(peer.id).get(id);
							if (!state || state.done) break;
							if (done) break;
							send("next", value);
						}
					} catch (err) {
						send("error", errPayload(err));
					} finally {
						peerOps(peer.id).delete(id);
						send("complete");
					}
					return;
				}
				const result = await execute({
					schema,
					document,
					variableValues,
					contextValue
				});
				if (typeof result[Symbol.asyncIterator] === "function") send("error", errPayload("@stream/@defer is not supported over WS"));
				else send("next", result);
				send("complete");
			} catch (err) {
				send("error", errPayload(err));
				send("complete");
			}
		},
		async close(peerId) {
			await stopAll(peerId);
		}
	};
}

//#endregion
export { RealtimeHub, cacheJson, contextFromRuntime, createConsoleLogger, createEnvConfig, createGraphqlWs, createInfra, createMapEnv, createMemoryCache, createMemoryObjects, createMemoryPubSub, createMemoryQueue, createMemoryRealtime, createNoopCache, createNoopLogger, createSystemClock, createTestInfra, createUuidIds, decodeRealtimeMessage, defineAdapter, enqueueJobAndWait, ensureWorkerStarted, isWebSocketUpgradeRequest, once, ormOf, requireOrm, runUniversalWorker, runWorker, sanitize, sessionUser, syntheticRequest, toNativeResponse };
//# sourceMappingURL=index.js.map