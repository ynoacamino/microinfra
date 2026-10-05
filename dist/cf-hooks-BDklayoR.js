import { t as runUniversalWorker } from "./universal-worker-oXfN3-sG.js";
import { n as cfEnv } from "./cf-env-IK8m1hFH.js";

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
export { stashDoEnv as n, createBatchRunner as t };
//# sourceMappingURL=cf-hooks-BDklayoR.js.map