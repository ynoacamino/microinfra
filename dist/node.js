import { a as decodeRealtimeMessage, i as RealtimeHub, o as isWebSocketUpgradeRequest } from "./uuid-ids-DloHpFiV.js";
import { a as RedisStreamsPubSub, c as createRedisStreamsQueue, d as isRedisConfigured, f as NodeEnv, g as createLibsqlHttpDrizzleDb, h as createLibsqlDrizzleDb, i as isS3Configured, l as isStreamsConfigured, m as isLibsqlConfigured, n as createNodeInfra, o as createRedisStreamsPubSub, p as createLibsqlPort, r as createS3Port, s as RedisStreamsQueue, t as createAppRuntime, u as createHttpRedisCache } from "./app-runtime--43GvF4R.js";

//#region src/adapters/node/bun-realtime.ts
function handleBunUpgrade(server, request, data) {
	if (!isWebSocketUpgradeRequest(request)) return null;
	if (!server.upgrade(request, { data })) return new Response("Internal Server Error", { status: 500 });
	return new Response();
}
function createBunRealtimeHandler(events) {
	const hub = new RealtimeHub(events);
	const ids = /* @__PURE__ */ new WeakMap();
	return {
		handler: {
			open: async (ws) => {
				const connection = await hub.connect({
					send: (message) => ws.sendText(message),
					close: (code, reason) => ws.close(code, reason)
				}, { meta: ws.data });
				ids.set(ws, connection.id);
			},
			message: async (ws, message) => {
				const id = ids.get(ws);
				if (!id) throw new Error("Message received for a missing client");
				await hub.incoming(id, decodeRealtimeMessage(message));
			},
			close: async (ws, code, reason) => {
				const id = ids.get(ws);
				if (!id) throw new Error("Closing a missing client");
				await hub.disconnect(id, code, reason);
			}
		},
		port: {
			broadcast: (message) => hub.broadcast(message),
			sendTo: (connectionId, message) => hub.sendTo(connectionId, message),
			connectionCount: () => hub.connectionCount(),
			closeAll: (code, reason) => hub.closeAll(code, reason)
		}
	};
}

//#endregion
//#region src/adapters/node/ws-realtime.ts
function attachWsRealtime(server, events) {
	const hub = new RealtimeHub(events);
	server.on("connection", (socket) => {
		let connectionId = null;
		const ready = hub.connect({
			send: (message) => socket.send(message),
			close: (code, reason) => socket.close(code, reason)
		}).then((connection) => {
			connectionId = connection.id;
		});
		socket.on("message", (data) => {
			ready.then(() => {
				if (connectionId) hub.incoming(connectionId, decodeRealtimeMessage(data));
			});
		});
		socket.on("close", (code, reason) => {
			ready.then(() => {
				if (connectionId) hub.disconnect(connectionId, code, decodeRealtimeMessage(reason));
			});
		});
		socket.on("error", () => {
			ready.then(() => {
				if (connectionId) hub.disconnect(connectionId, 1011, "socket error");
			});
		});
	});
	return {
		broadcast: (message) => hub.broadcast(message),
		sendTo: (connectionId, message) => hub.sendTo(connectionId, message),
		connectionCount: () => hub.connectionCount(),
		closeAll: (code, reason) => hub.closeAll(code, reason)
	};
}

//#endregion
export { NodeEnv, RedisStreamsPubSub, RedisStreamsQueue, attachWsRealtime, createAppRuntime, createBunRealtimeHandler, createHttpRedisCache, createLibsqlDrizzleDb, createLibsqlHttpDrizzleDb, createLibsqlPort, createNodeInfra, createRedisStreamsPubSub, createRedisStreamsQueue, createS3Port, handleBunUpgrade, isLibsqlConfigured, isRedisConfigured, isS3Configured, isStreamsConfigured };
//# sourceMappingURL=node.js.map