//#region src/core/realtime-hub.ts
const noopEvents = {
	onConnect: () => {},
	onMessage: () => {},
	onDisconnect: () => {}
};
function isWebSocketUpgradeRequest(request) {
	return request.headers.get("upgrade")?.toLowerCase() === "websocket";
}
const textDecoder = new TextDecoder();
function decodeRealtimeMessage(data) {
	if (typeof data === "string") return data;
	if (data instanceof ArrayBuffer) return textDecoder.decode(new Uint8Array(data));
	if (ArrayBuffer.isView(data)) return textDecoder.decode(data);
	return String(data);
}
var RealtimeHub = class {
	events;
	entries = /* @__PURE__ */ new Map();
	counter = 0;
	constructor(events) {
		this.events = events ?? noopEvents;
	}
	async connect(sender, options = {}) {
		this.counter += 1;
		const id = options.id ?? `conn-${this.counter}`;
		const connection = {
			id,
			meta: options.meta,
			send: (message) => sender.send(message),
			close: (code, reason) => sender.close(code, reason)
		};
		this.entries.set(id, {
			connection,
			sender
		});
		await this.events.onConnect(connection);
		return connection;
	}
	async incoming(id, message) {
		const entry = this.entries.get(id);
		if (!entry) return false;
		await this.events.onMessage(entry.connection, message);
		return true;
	}
	async disconnect(id, code, reason) {
		const entry = this.entries.get(id);
		if (!entry) return false;
		this.entries.delete(id);
		await this.events.onDisconnect(entry.connection, code, reason);
		return true;
	}
	async broadcast(message) {
		for (const [id, entry] of [...this.entries]) try {
			entry.sender.send(message);
		} catch {
			await this.drop(id);
		}
	}
	async sendTo(connectionId, message) {
		const entry = this.entries.get(connectionId);
		if (!entry) return false;
		try {
			entry.sender.send(message);
		} catch {
			await this.drop(connectionId);
			return false;
		}
		return true;
	}
	async connectionCount() {
		return this.entries.size;
	}
	async closeAll(code, reason) {
		for (const id of [...this.entries.keys()]) {
			const entry = this.entries.get(id);
			if (!entry) continue;
			try {
				entry.sender.close(code, reason);
			} catch {}
			await this.disconnect(id, code, reason);
		}
	}
	async drop(id) {
		const entry = this.entries.get(id);
		if (!entry) return;
		this.entries.delete(id);
		await this.events.onDisconnect(entry.connection);
	}
};

//#endregion
export { decodeRealtimeMessage as n, isWebSocketUpgradeRequest as r, RealtimeHub as t };
//# sourceMappingURL=realtime-hub-DeePlZ4G.js.map