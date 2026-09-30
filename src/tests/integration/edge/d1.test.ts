import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { createD1Port } from "../../../adapters/edge/d1-db";
import { describeDatabaseContract } from "../../contract/database.contract";

interface D1BoundStatement {
  run(): Promise<unknown>;
  first<T>(): Promise<T | null>;
}

interface D1DatabaseLike {
  exec(query: string): Promise<unknown>;
  prepare(query: string): { bind(...args: unknown[]): D1BoundStatement };
}

function database(): D1DatabaseLike {
  return env.DB as unknown as D1DatabaseLike;
}

beforeAll(async () => {
  await database().exec("CREATE TABLE IF NOT EXISTS probe (id TEXT PRIMARY KEY, label TEXT)");
});

describe("d1 stack", () => {
  it("runs SQL roundtrips through the injected client", async () => {
    const id = `id-${crypto.randomUUID()}`;
    await database().prepare("INSERT INTO probe (id, label) VALUES (?1, ?2)").bind(id, "one").run();
    const row = await database().prepare("SELECT label FROM probe WHERE id = ?1").bind(id).first<{ label: string }>();
    expect(row?.label).toBe("one");
  });
});

describeDatabaseContract("d1", () => createD1Port(database()));
