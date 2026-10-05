//#region src/adapters/memory/memory-queue.ts
function createMemoryQueue() {
	const pending = [];
	const acked = /* @__PURE__ */ new Set();
	let running = false;
	let worker = null;
	let counter = 0;
	async function drain() {
		if (!running || !worker) return;
		const next = pending.shift();
		if (!next) return;
		await worker(next);
		acked.add(next.streamId);
		await drain();
	}
	return {
		enqueueJob: async (jobId, jobType, data) => {
			counter += 1;
			const job = {
				jobId,
				jobType,
				streamId: `mem-${counter}`
			};
			if (data !== void 0) job.data = data;
			pending.push(job);
			if (running) await drain();
			return true;
		},
		processNextJob: async () => pending.shift() ?? null,
		ackJob: async (streamId) => {
			acked.add(streamId);
		},
		startWorker: async (onJob) => {
			worker = onJob;
			running = true;
			await drain();
		},
		stopWorker: async () => {
			running = false;
			worker = null;
		},
		isWorkerRunning: () => running
	};
}

//#endregion
export { createMemoryQueue as t };
//# sourceMappingURL=memory-queue-Fm7wdof8.js.map