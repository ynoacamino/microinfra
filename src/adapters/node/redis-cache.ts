import type { CachePort } from "../../ports/cache";
import type { EnvConfig } from "../../ports/config";

export function isRedisConfigured(config: EnvConfig): boolean {
  return Boolean(config.redis.url && config.redis.token);
}

interface UpstashResult {
  result: unknown;
}

async function upstashCommand<T>(baseUrl: string, token: string, command: unknown[]): Promise<T> {
  const normalized = baseUrl.replace(/\/$/, "");
  const res = await fetch(`${normalized}/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  if (!res.ok) throw new Error(`[cache] Upstash error: ${res.status}`);
  const body = (await res.json()) as UpstashResult;
  return body.result as T;
}

export function createHttpRedisCache(config: EnvConfig): CachePort {
  const baseUrl = config.redis.url as string;
  const token = config.redis.token as string;
  return {
    get: (key) => upstashCommand<string | null>(baseUrl, token, ["GET", key]),
    put: async (key, value, opts) => {
      const command = opts?.ttl ? ["SET", key, value, "EX", String(opts.ttl)] : ["SET", key, value];
      await upstashCommand(baseUrl, token, command);
    },
    delete: async (key) => {
      await upstashCommand(baseUrl, token, ["DEL", key]);
    },
    list: (prefix = "") => upstashCommand<string[]>(baseUrl, token, ["KEYS", `${prefix}*`]),
  };
}
