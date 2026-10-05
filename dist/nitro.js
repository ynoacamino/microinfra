import { n as ensureWorkerStarted } from "./queue-helpers-BqPu8bam.js";
import { t as once } from "./singleton-Bej6xtaw.js";
import { n as cfEnv } from "./cf-env-DV3BYeCw.js";
import { n as defineRealtimeDO, t as defineDoExports } from "./realtime-do-BqlajA3u.js";

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
	if (request.headers.get("upgrade") !== "websocket" && request.headers.get("Upgrade") !== "websocket") return new Response("Expected WebSocket Upgrade", { status: 426 });
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
export { cfWsProxyFetch, createNitroWsEvents, defineCfQueuePlugin, defineDoExports, defineRealtimeDO, defineWorkerPlugin, nitroMicroinfraConfig };
//# sourceMappingURL=nitro.js.map