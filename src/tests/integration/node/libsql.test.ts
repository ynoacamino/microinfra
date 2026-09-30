import { type Client, createClient } from "@libsql/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLibsqlPort } from "../../../adapters/node/libsql-db";
import { describeDatabaseContract } from "../../contract/database.contract";
import { type LibsqlStack, startLibsql } from "./containers";

let stack!: LibsqlStack;

beforeAll(async () => {
  stack = await startLibsql();
}, 180_000);

afterAll(async () => {
  await stack.stop();
});

function openClient(): Client {
  return createClient({ url: stack.url });
}

describe("libsql stack", () => {
  it("runs SQL roundtrips through the injected client", async () => {
    const client = openClient();
    const port = createLibsqlPort(client, async () => {
      client.close();
    });
    await client.execute("CREATE TABLE probe (id TEXT PRIMARY KEY, label TEXT)");
    await client.execute({ sql: "INSERT INTO probe (id, label) VALUES (?, ?)", args: ["1", "one"] });
    const rows = await client.execute("SELECT label FROM probe WHERE id = '1'");
    expect(rows.rows[0]?.label).toBe("one");
    await port.close?.();
  });
});

describeDatabaseContract("libsql", () => {
  const client = openClient();
  return createLibsqlPort(client, async () => {
    client.close();
  });
});
