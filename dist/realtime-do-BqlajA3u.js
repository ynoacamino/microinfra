import { t as runUniversalWorker } from "./universal-worker-oXfN3-sG.js";
import { n as cfEnv } from "./cf-env-DV3BYeCw.js";

//#region src/runtime/cf-hooks.ts
/**
* Saves Durable Object `env` for code running inside the DO (WS handlers,
* internal stub.fetch), where the worker entrypoints that populate
* `globalThis.__env__` never run. Wire it to your runtime's DO-init hook.
*/
function stashDoEnv(payload) {
	globalThis.__do_env__ = payload.env;
}
/**
* CF Queues consumer: builds the edge runtime from worker bindings and runs
* the universal worker batch. Wire the returned function to your runtime's
* queue hook (e.g. Nitro `cloudflare:queue`). Throws when bindings are absent,
* same as a misconfigured worker.
*/
function createBatchRunner({ createRuntime, createHandlers }) {
	return async (payload) => {
		const bindings = cfEnv();
		if (!bindings) throw new Error("[edge] queue without bindings (globalThis.__env__ missing)");
		const runtime = createRuntime(bindings);
		const worker = await runUniversalWorker(runtime, createHandlers(runtime));
		if (worker.kind === "edge") {
			const batch = {
				queue: payload.batch.queue,
				messages: payload.batch.messages.map((m) => ({
					body: m.body,
					ack: () => m.ack(),
					retry: () => m.retry()
				}))
			};
			await worker.onBatch(batch);
		}
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
			if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected WebSocket", { status: 400 });
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
/** Helper for `exports.cloudflare.ts`: re-export DO classes for the CF entrypoint. */
function defineDoExports(classes) {
	return { ...classes };
}

//#endregion
export { stashDoEnv as i, defineRealtimeDO as n, createBatchRunner as r, defineDoExports as t };
//# sourceMappingURL=realtime-do-BqlajA3u.js.map