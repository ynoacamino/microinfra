import { n as decodeRealtimeMessage, r as isWebSocketUpgradeRequest, t as RealtimeHub } from "./realtime-hub-DeePlZ4G.js";
import { n as createQueuesQueue, r as isQueueBindingConfigured, t as createQueueConsumer } from "./queues-C77o1reO.js";
import { n as cfEnv, r as cfVars, t as CloudflareEnv } from "./cf-env-IK8m1hFH.js";
import { a as createR2PortFromBinding, c as isKvConfigured, d as isD1Configured, i as createR2Port, l as createD1DrizzleDb, n as createEdgeInfra, o as isR2Configured, r as R2Objects, s as createKvCache, t as createAppRuntimeEdge, u as createD1Port } from "./app-runtime-edge-Cojf_wPv.js";
import { n as stashDoEnv, t as createBatchRunner } from "./cf-hooks-BDklayoR.js";

//#region src/adapters/edge/durable-realtime.ts
function defaultPair() {
	if (typeof WebSocketPair === "undefined") return null;
	const pair = new WebSocketPair();
	return {
		client: pair[0],
		server: pair[1]
	};
}
function upgradeResponse(client) {
	return new Response(null, {
		status: 101,
		webSocket: client
	});
}
function createDurableRealtime(state, events) {
	const hub = new RealtimeHub(events);
	const ids = /* @__PURE__ */ new Map();
	function register(ws, meta) {
		hub.connect({
			send: (message) => ws.send(message),
			close: (code, reason) => ws.close(code, reason)
		}, { meta }).then((connection) => {
			ids.set(ws, connection.id);
		});
	}
	async function ensureConnection(ws) {
		const known = ids.get(ws);
		if (known) return known;
		const meta = typeof ws.deserializeAttachment === "function" ? ws.deserializeAttachment() : void 0;
		const connection = await hub.connect({
			send: (message) => ws.send(message),
			close: (code, reason) => ws.close(code, reason)
		}, { meta });
		ids.set(ws, connection.id);
		return connection.id;
	}
	return {
		broadcast: (message) => hub.broadcast(message),
		sendTo: (connectionId, message) => hub.sendTo(connectionId, message),
		connectionCount: () => hub.connectionCount(),
		closeAll: (code, reason) => hub.closeAll(code, reason),
		handleUpgrade: (request, meta, sockets) => {
			if (!isWebSocketUpgradeRequest(request)) return new Response("Expected WebSocket", { status: 400 });
			const pair = sockets?.createPair ? sockets.createPair() : defaultPair();
			if (!pair) return new Response("WebSocketPair is not available", { status: 500 });
			state.acceptWebSocket(pair.server);
			if (meta !== void 0 && typeof pair.server.serializeAttachment === "function") pair.server.serializeAttachment(meta);
			register(pair.server, meta);
			return (sockets?.respond ?? upgradeResponse)(pair.client);
		},
		handleMessage: async (ws, message) => {
			const id = await ensureConnection(ws);
			await hub.incoming(id, decodeRealtimeMessage(message));
		},
		handleClose: async (ws, code, reason) => {
			const id = await ensureConnection(ws);
			ids.delete(ws);
			await hub.disconnect(id, code, reason);
		}
	};
}

//#endregion
export { CloudflareEnv, R2Objects, cfEnv, cfVars, createAppRuntimeEdge, createBatchRunner, createD1DrizzleDb, createD1Port, createDurableRealtime, createEdgeInfra, createKvCache, createQueueConsumer, createQueuesQueue, createR2Port, createR2PortFromBinding, isD1Configured, isKvConfigured, isQueueBindingConfigured, isR2Configured, stashDoEnv };
//# sourceMappingURL=edge.js.map