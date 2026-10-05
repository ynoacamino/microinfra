import type { RuntimeEnv } from "../core/types";

/**
 * Enqueue + await. En Workers el trabajo flotante sin `waitUntil` se congela
 * al responder (en Node seguía corriendo). Este helper fuerza el `await` y, si
 * el runtime expone `waitUntil` (CF), lo registra además para mayor seguridad.
 */
export async function enqueueJobAndWait(
  rt: RuntimeEnv,
  jobId: string,
  jobType: string,
  data?: string,
): Promise<boolean> {
  if (!rt.queue) throw new Error("[microinfra] No queue configured in RuntimeEnv");
  const promise = rt.queue.enqueueJob(jobId, jobType, data);
  const waitUntil = (globalThis as { waitUntil?: (p: Promise<unknown>) => void }).waitUntil;
  if (typeof waitUntil === "function") {
    try {
      waitUntil(promise);
    } catch {
      // waitUntil fuera de un handler CF lanza; el await de abajo cubre.
    }
  }
  return await promise;
}

export interface EnsureWorkerOptions {
  retries?: number;
  retryDelayMs?: number;
  logPrefix?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Starts the node worker with retries instead of failing silently when Redis
 * wasn't up before dev. Returns the stop function. Throws after `retries`.
 */
export async function ensureWorkerStarted(
  rt: RuntimeEnv,
  start: (rt: RuntimeEnv) => Promise<() => Promise<void>>,
  opts: EnsureWorkerOptions = {},
): Promise<() => Promise<void>> {
  const retries = opts.retries ?? 5;
  const delay = opts.retryDelayMs ?? 1000;
  let lastError: unknown;
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      const stop = await start(rt);
      if (attempt > 1) rt.logger.info(`${opts.logPrefix ?? "queue worker"} iniciado (intento ${attempt})`);
      return stop;
    } catch (err) {
      lastError = err;
      rt.logger.error(`${opts.logPrefix ?? "queue worker"} no disponible (intento ${attempt}/${retries + 1})`, {
        error: String(err),
      });
      if (attempt <= retries) await sleep(delay);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`[microinfra] worker failed: ${String(lastError)}`);
}
