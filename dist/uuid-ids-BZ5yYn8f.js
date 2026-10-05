import { t as RealtimeHub } from "./realtime-hub-DeePlZ4G.js";

//#region src/adapters/memory/loggers.ts
function noop() {}
function createNoopLogger() {
	const logger = {
		debug: noop,
		info: noop,
		warn: noop,
		error: noop,
		child: () => logger
	};
	return logger;
}
function createConsoleLogger(context = "App") {
	const prefix = `[microinfra:${context}]`;
	const make = (scope) => ({
		debug: (message, data) => console.debug(prefix, scope, message, data ?? ""),
		info: (message, data) => console.info(prefix, scope, message, data ?? ""),
		warn: (message, data) => console.warn(prefix, scope, message, data ?? ""),
		error: (message, errorOrData, extra) => console.error(prefix, scope, message, errorOrData ?? "", extra ?? ""),
		child: (name) => make(`${scope}:${name}`)
	});
	return make(context);
}

//#endregion
//#region src/adapters/memory/memory-cache.ts
function createMemoryCache() {
	const map = /* @__PURE__ */ new Map();
	return {
		get: async (key) => {
			const entry = map.get(key);
			if (!entry) return null;
			if (entry.expiresAt !== void 0 && Date.now() > entry.expiresAt) {
				map.delete(key);
				return null;
			}
			return entry.value;
		},
		put: async (key, value, opts) => {
			map.set(key, opts?.ttl ? {
				value,
				expiresAt: Date.now() + opts.ttl * 1e3
			} : { value });
		},
		delete: async (key) => {
			map.delete(key);
		},
		list: async (prefix = "") => {
			return [...map.keys()].filter((key) => key.startsWith(prefix));
		}
	};
}

//#endregion
//#region src/adapters/memory/memory-objects.ts
function createMemoryObjects() {
	const map = /* @__PURE__ */ new Map();
	return {
		put: async (key, body, options) => {
			const bytes = body instanceof Uint8Array ? body : new Uint8Array(await new Response(body).arrayBuffer());
			map.set(key, {
				bytes,
				contentType: options.contentType
			});
			return key;
		},
		delete: async (key) => {
			map.delete(key);
		},
		read: async (key) => {
			const entry = map.get(key);
			if (!entry) throw new Error(`[objects] Missing key: ${key}`);
			return entry.bytes;
		},
		getSignedUrl: async (key) => `memory://${key}`,
		getPublicUrl: (key) => `memory://${key}`,
		generateKey: (prefix) => `${prefix}/${crypto.randomUUID()}`,
		size: () => map.size
	};
}

//#endregion
//#region src/adapters/memory/memory-pubsub.ts
function createMemoryPubSub() {
	const channels = /* @__PURE__ */ new Map();
	return {
		publish(channel, data) {
			for (const push of channels.get(channel) ?? []) push(data);
		},
		subscribe(channel) {
			const queue = [];
			const waiters = [];
			const push = (data) => {
				queue.push(data);
				for (const wake of waiters.splice(0)) wake();
			};
			let set = channels.get(channel);
			if (!set) {
				set = /* @__PURE__ */ new Set();
				channels.set(channel, set);
			}
			set.add(push);
			let closed = false;
			const iterable = (async function* () {
				try {
					let index = 0;
					for (;;) {
						if (closed) break;
						while (index < queue.length) yield queue[index++];
						if (closed) break;
						await new Promise((resolve) => waiters.push(resolve));
					}
				} finally {
					set?.delete(push);
				}
			})();
			return {
				[Symbol.asyncIterator]() {
					return iterable[Symbol.asyncIterator]();
				},
				close() {
					closed = true;
					for (const wake of waiters.splice(0)) wake();
				}
			};
		}
	};
}

//#endregion
//#region src/adapters/memory/memory-realtime.ts
function createMemoryRealtime(events) {
	const hub = new RealtimeHub(events);
	return {
		broadcast: (message) => hub.broadcast(message),
		sendTo: (connectionId, message) => hub.sendTo(connectionId, message),
		connectionCount: () => hub.connectionCount(),
		closeAll: (code, reason) => hub.closeAll(code, reason),
		connectClient: async (id) => {
			const received = [];
			let closed = false;
			const connection = await hub.connect({
				send: (message) => {
					received.push(message);
				},
				close: () => {
					closed = true;
				}
			}, { id });
			return {
				id: connection.id,
				received,
				get closed() {
					return closed;
				},
				sendToServer: async (message) => {
					await hub.incoming(connection.id, message);
				},
				closeFromClient: async (code, reason) => {
					await hub.disconnect(connection.id, code, reason);
				}
			};
		}
	};
}

//#endregion
//#region src/adapters/memory/system-clock.ts
function createSystemClock() {
	return {
		now: () => /* @__PURE__ */ new Date(),
		nowMs: () => Date.now()
	};
}

//#endregion
//#region src/adapters/memory/uuid-ids.ts
function createUuidIds() {
	return { createId: () => crypto.randomUUID() };
}

//#endregion
export { createMemoryObjects as a, createNoopLogger as c, createMemoryPubSub as i, createSystemClock as n, createMemoryCache as o, createMemoryRealtime as r, createConsoleLogger as s, createUuidIds as t };
//# sourceMappingURL=uuid-ids-BZ5yYn8f.js.map