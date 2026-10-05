//#region src/adapters/edge/queues.ts
function isQueueBindingConfigured(binding) {
	return typeof binding?.send === "function";
}
function createQueuesQueue(binding) {
	return {
		enqueueJob: async (jobId, jobType, data) => {
			const message = {
				jobId,
				jobType
			};
			if (data !== void 0) message.data = data;
			await binding.send(message);
			return true;
		},
		processNextJob: async () => null,
		ackJob: async () => {},
		startWorker: async () => {
			throw new Error("[queue] Polling is not supported on edge; handle batches with createQueueConsumer in the worker entry.");
		},
		stopWorker: async () => {},
		isWorkerRunning: () => false
	};
}
function createQueueConsumer(handlers) {
	return async (batch) => {
		for (const message of batch.messages) {
			const handler = handlers[message.body.jobType];
			if (!handler) {
				message.retry();
				continue;
			}
			try {
				await handler(message.body);
				message.ack();
			} catch {
				message.retry();
			}
		}
	};
}

//#endregion
export { createQueuesQueue as n, isQueueBindingConfigured as r, createQueueConsumer as t };
//# sourceMappingURL=queues-C77o1reO.js.map