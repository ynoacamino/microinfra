import type { RuntimeEnv } from "./types";

export interface CreateInfraOptions<TDb = unknown> extends RuntimeEnv<TDb> {}

export function createInfra<TDb = unknown>(options: CreateInfraOptions<TDb>): RuntimeEnv<TDb> {
  const runtime: RuntimeEnv<TDb> = { ...options };

  if (options.mode === "node" && !runtime.close) {
    const dbClose = options.db.close;
    if (dbClose) {
      runtime.close = () => dbClose.call(options.db);
    }
  }

  return Object.freeze(runtime);
}
