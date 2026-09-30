interface CommandResult {
  result: unknown;
}

function normalizeUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "");
}

export async function sendRedisCommand(
  baseUrl: string,
  token: string,
  command: unknown[],
): Promise<unknown> {
  const res = await fetch(`${normalizeUrl(baseUrl)}/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  if (!res.ok) {
    throw new Error(`[redis-http] Command failed with status ${res.status}`);
  }
  const body = (await res.json()) as CommandResult;
  return body.result;
}

export async function sendRedisPipeline(
  baseUrl: string,
  token: string,
  commands: unknown[][],
): Promise<unknown[]> {
  const res = await fetch(`${normalizeUrl(baseUrl)}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
  });
  if (!res.ok) {
    throw new Error(`[redis-http] Pipeline failed with status ${res.status}`);
  }
  const body = (await res.json()) as Array<CommandResult>;
  return body.map((entry) => entry.result);
}

/** Converts flat `["k1","v1","k2","v2"]` field arrays into an object. */
export function parseRedisFields(rawFields: unknown): Record<string, string> {
  const fields: Record<string, string> = {};
  if (!Array.isArray(rawFields)) {
    return fields;
  }
  for (let index = 0; index < rawFields.length; index += 2) {
    const key = rawFields[index];
    const value = rawFields[index + 1];
    if (typeof key !== "string" || value === undefined) {
      continue;
    }
    fields[key] = String(value);
  }
  return fields;
}
