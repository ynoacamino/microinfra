//#region src/runtime/queue-helpers.ts
/**
* Enqueue + await. En Workers el trabajo flotante sin `waitUntil` se congela
* al responder (en Node seguía corriendo). Este helper fuerza el `await` y, si
* el runtime expone `waitUntil` (CF), lo registra además para mayor seguridad.
*/
async function enqueueJobAndWait(rt, jobId, jobType, data) {
	if (!rt.queue) throw new Error("[microinfra] No queue configured in RuntimeEnv");
	const promise = rt.queue.enqueueJob(jobId, jobType, data);
	const waitUntil = globalThis.waitUntil;
	if (typeof waitUntil === "function") try {
		waitUntil(promise);
	} catch {}
	return await promise;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/**
* Starts the node worker with retries instead of failing silently when Redis
* wasn't up before dev. Returns the stop function. Throws after `retries`.
*/
async function ensureWorkerStarted(rt, start, opts = {}) {
	const retries = opts.retries ?? 5;
	const delay = opts.retryDelayMs ?? 1e3;
	let lastError;
	for (let attempt = 1; attempt <= retries + 1; attempt++) try {
		const stop = await start(rt);
		if (attempt > 1) rt.logger.info(`${opts.logPrefix ?? "queue worker"} iniciado (intento ${attempt})`);
		return stop;
	} catch (err) {
		lastError = err;
		rt.logger.error(`${opts.logPrefix ?? "queue worker"} no disponible (intento ${attempt}/${retries + 1})`, { error: String(err) });
		if (attempt <= retries) await sleep(delay);
	}
	throw lastError instanceof Error ? lastError : /* @__PURE__ */ new Error(`[microinfra] worker failed: ${String(lastError)}`);
}

//#endregion
export { ensureWorkerStarted as n, enqueueJobAndWait as t };
//# sourceMappingURL=queue-helpers-BqPu8bam.js.map