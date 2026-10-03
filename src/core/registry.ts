import type { RuntimeEnv } from "./types";

export interface CreateInfraOptions<TRaw = unknown, TOrm = unknown> extends RuntimeEnv<TRaw, TOrm> {}

export function createInfra<TRaw = unknown, TOrm = unknown>(
  options: CreateInfraOptions<TRaw, TOrm>,
): RuntimeEnv<TRaw, TOrm> {
  const runtime: RuntimeEnv<TRaw, TOrm> = { ...options };

  if (options.mode === "node" && !runtime.close) {
    const dbClose = options.db.close;
    if (dbClose) {
      runtime.close = () => dbClose.call(options.db);
    }
  }

  return Object.freeze(runtime);
}
