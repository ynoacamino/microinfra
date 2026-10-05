import { t as createQueueConsumer } from "./queues-C77o1reO.js";

//#region src/runtime/worker.ts
async function runWorker(rt, handlers) {
	const queue = rt.queue;
	if (!queue) throw new Error("[worker] No queue configured in RuntimeEnv");
	await queue.startWorker(async (job) => {
		const handler = handlers[job.jobType];
		if (!handler) {
			rt.logger.error("No handler registered for job type", {
				jobId: job.jobId,
				jobType: job.jobType
			});
			throw new Error(`[worker] Unhandled job type: ${job.jobType}`);
		}
		await handler(job);
	});
	return () => queue.stopWorker();
}

//#endregion
//#region src/runtime/universal-worker.ts
function adaptToEdge(handlers) {
	return Object.fromEntries(Object.entries(handlers).map(([jobType, handler]) => [jobType, async (message) => {
		await handler({
			jobId: message.jobId,
			jobType: message.jobType,
			streamId: message.jobId,
			data: message.data
		});
	}]));
}
/**
* Starts background job processing on any runtime. On node/test it polls via
* runWorker and returns a stop function; on edge (no polling allowed) it
* returns an onBatch consumer for the worker queue() entrypoint.
*/
async function runUniversalWorker(rt, handlers) {
	if (rt.mode === "edge") return {
		kind: "edge",
		onBatch: createQueueConsumer(adaptToEdge(handlers))
	};
	return {
		kind: "local",
		stop: await runWorker(rt, handlers)
	};
}

//#endregion
export { runWorker as n, runUniversalWorker as t };
//# sourceMappingURL=universal-worker-oXfN3-sG.js.map