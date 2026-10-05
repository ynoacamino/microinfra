import { r as isWebSocketUpgradeRequest } from "./realtime-hub-DeePlZ4G.js";
import { n as ensureWorkerStarted } from "./queue-helpers-BqPu8bam.js";
import { t as once } from "./singleton-Bej6xtaw.js";
import { n as cfEnv } from "./cf-env-IK8m1hFH.js";
import { n as stashDoEnv } from "./cf-hooks-BDklayoR.js";

//#region src/runtime/nitro-helpers.ts
function isEdgePreset() {
	return (typeof process === "undefined" ? void 0 : process.env.NITRO_PRESET) === "cloudflare-module";
}
/**
* Single source of truth for the Nitro switch (bun <-> cloudflare-module).
* Returns plain data — no nitro import — so the app's vite.config.ts is 3 lines.
* Encapsulates: websocket:false on CF (else crossws intercepts the DO proxy),
* ws-handler vs cf-ws-handler, worker vs cf-queue plugin, and the
* @whatwg-node/fetch esm-ponyfill alias required in workerd.
*/
function nitroMicroinfraConfig(opts = {}) {
	const edge = isEdgePreset();
	const route = opts.wsRoute ?? "/_ws";
	if (!edge) return {
		preset: "bun",
		features: { websocket: true },
		handlers: [{
			route,
			handler: "./server/ws-handler.ts"
		}],
		plugins: ["./server/plugins/worker.ts"],
		isEdge: false
	};
	return {
		preset: "cloudflare-module",
		features: { websocket: false },
		handlers: [{
			route,
			handler: "./server/cf-ws-handler.ts"
		}],
		plugins: ["./server/plugins/cf-queue.ts"],
		alias: opts.esmPonyfillPath ? { "@whatwg-node/fetch": opts.esmPonyfillPath } : void 0,
		isEdge: true
	};
}
/**
* Adapts the transport-agnostic graphql-ws machine to Nitro CrossWS events.
* The app still calls defineWebSocketHandler (keeps `nitro` out of microinfra
* deps) but the peer adaptation lives here, HMR-safe via once().
*/
function createNitroWsEvents(getHandler, singletonKey = "graphql-ws-nitro") {
	const handler = () => once(singletonKey, getHandler);
	return {
		open: (peer) => handler().open(peer.id),
		message: async (peer, raw) => {
			const text = typeof raw === "string" ? raw : raw.text();
			await handler().message({
				id: peer.id,
				send: (t) => peer.send(t),
				context: peer.context
			}, text);
		},
		close: async (peer) => {
			await handler().close(peer.id);
		}
	};
}
/**
* Framework-free CF WS proxy: Worker doesn't terminate the socket, it forwards
* the upgrade to the RealtimeDO singleton. Usable inside defineEventHandler.
*/
async function cfWsProxyFetch(request, opts = {}) {
	if (!isWebSocketUpgradeRequest(request)) return new Response("Expected WebSocket Upgrade", { status: 426 });
	const ns = cfEnv()?.[opts.bindingName ?? "REALTIME_DO"];
	if (!ns) return new Response("Durable Object REALTIME_DO no configurado", { status: 500 });
	return ns.get(ns.idFromName(opts.key ?? "realtime")).fetch(request);
}
/**
* Node worker plugin with retries (never fails silently when Redis wasn't up
* before dev). Skips on edge — CF consumes via the queue hook instead.
*/
function defineWorkerPlugin(getRuntime, start, opts = {}) {
	return async function workerPlugin() {
		if (cfEnv()) return;
		const rt = getRuntime();
		if (!rt.queue) return;
		await ensureWorkerStarted(rt, start, opts);
		rt.logger.info("queue worker iniciado (node)");
	};
}
/** CF queue consumer plugin (wires the Nitro `cloudflare:queue` hook). */
function defineCfQueuePlugin(runQueueBatch) {
	return function cfQueuePlugin(nitroApp) {
		nitroApp.hooks.hook("cloudflare:queue", async ({ batch }) => {
			await runQueueBatch({ batch });
		});
	};
}

//#endregion
//#region src/runtime/realtime-do.ts
function peerIdOf(ws) {
	const h = ws;
	if (typeof h.deserializeAttachment !== "function") return void 0;
	try {
		const att = h.deserializeAttachment();
		return typeof att?.peerId === "string" ? att.peerId : void 0;
	} catch {
		return;
	}
}
/**
* Base class factory for the GraphQL realtime Durable Object. Encapsulates:
* stashDoEnv, WebSocketPair + hibernation, graphql-transport-ws negotiation in
* the 101, accept→serializeAttachment ordering, and peerId routing.
* Subscriptions still don't survive DO eviction (documented) — re-subscribe
* from the client; attachment only carries peerId (auth via upgrade hook).
*/
function defineRealtimeDO(opts) {
	return class RealtimeDO {
		state;
		env;
		gql;
		constructor(state, env) {
			this.state = state;
			this.env = env;
			stashDoEnv({ env });
		}
		handler() {
			if (!this.gql) {
				stashDoEnv({ env: this.env });
				this.gql = opts.createHandler();
			}
			return this.gql;
		}
		async fetch(request) {
			if (!isWebSocketUpgradeRequest(request)) return new Response("Expected WebSocket", { status: 400 });
			await opts.onUpgrade?.(request, this.env);
			const gql = this.handler();
			const Pair = globalThis.WebSocketPair;
			if (!Pair) return new Response("WebSocketPair is not available", { status: 500 });
			const pair = new Pair();
			const client = pair[0];
			const server = pair[1];
			const peerId = crypto.randomUUID();
			const headers = (request.headers.get("Sec-WebSocket-Protocol") ?? "").split(",").map((p) => p.trim()).includes("graphql-transport-ws") ? { "Sec-WebSocket-Protocol": "graphql-transport-ws" } : void 0;
			this.state.acceptWebSocket(server);
			server.serializeAttachment({ peerId });
			gql.open(peerId);
			return new Response(null, {
				status: 101,
				webSocket: client,
				headers
			});
		}
		async webSocketMessage(ws, message) {
			const peerId = peerIdOf(ws);
			if (!peerId) {
				ws.close(1011, "sin sesion");
				return;
			}
			const text = typeof message === "string" ? message : new TextDecoder().decode(message);
			await this.handler().message({
				id: peerId,
				send: (t) => ws.send(t),
				context: { peerId }
			}, text);
		}
		async webSocketClose(ws) {
			const peerId = peerIdOf(ws);
			if (peerId) await this.handler().close(peerId);
		}
		async webSocketError(ws) {
			const peerId = peerIdOf(ws);
			if (peerId) await this.handler().close(peerId);
		}
	};
}

//#endregion
export { cfWsProxyFetch, createNitroWsEvents, defineCfQueuePlugin, defineRealtimeDO, defineWorkerPlugin, nitroMicroinfraConfig };
//# sourceMappingURL=nitro.js.map