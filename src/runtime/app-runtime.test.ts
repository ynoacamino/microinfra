import { defineRelations } from "drizzle-orm";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import { createAppRuntime } from "./app-runtime";
import { createAppRuntimeEdge } from "./app-runtime-edge";

const widgets = sqliteTable("widgets", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
});

function rawClientOf(orm: unknown): unknown {
  return (orm as { $client: unknown }).$client;
}

const widgetRelations = defineRelations({ widgets });

describe("createAppRuntime", () => {
  it("throws when DATABASE_URL is missing", () => {
    expect(() => createAppRuntime({})).toThrow("[microinfra] DATABASE_URL es requerido para createAppRuntime");
  });

  it("rejects file: URLs by default", () => {
    expect(() => createAppRuntime({ DATABASE_URL: "file:./data.db" })).toThrow(
      "[microinfra] file: DATABASE_URL prohibido en createAppRuntime",
    );
  });

  it("builds an embedded drizzle db and runs queries when forbidFileDb is false", async () => {
    const rt = createAppRuntime({ DATABASE_URL: "file::memory:" }, { forbidFileDb: false, relations: widgetRelations });
    expect(rt.mode).toBe("node");
    const orm = rt.db.orm;
    expect(orm).toBeDefined();
    expect(rawClientOf(orm)).toBe(rt.db.client);
    await rt.db.client.execute("CREATE TABLE widgets (id TEXT PRIMARY KEY, name TEXT NOT NULL)");
    await orm?.insert(widgets).values({ id: "w1", name: "alpha" });
    const rows = await orm?.select().from(widgets);
    expect(rows).toEqual([{ id: "w1", name: "alpha" }]);
    await rt.close?.();
  });

  it("builds a remote drizzle db without connecting and parses the auth token", () => {
    const rt = createAppRuntime(
      { DATABASE_URL: "http://127.0.0.1:8080", DATABASE_AUTH_TOKEN: "turso-token" },
      { relations: widgetRelations },
    );
    expect(rt.db.orm).toBeDefined();
    expect(rawClientOf(rt.db.orm)).toBeDefined();
    expect(rt.config.database.authToken).toBe("turso-token");
  });

  it("works without relations", () => {
    const rt = createAppRuntime({ DATABASE_URL: "http://127.0.0.1:8080" });
    expect(rt.db.orm).toBeDefined();
  });

  it("uses memory objects by default and S3 when configured", async () => {
    const memory = createAppRuntime({ DATABASE_URL: "file::memory:" }, { forbidFileDb: false });
    await memory.objects.put("k", new TextEncoder().encode("v"), { contentType: "text/plain" });
    const stored = await memory.objects.read("k");
    expect(new TextDecoder().decode(stored)).toBe("v");
    await memory.close?.();

    const s3 = createAppRuntime(
      {
        DATABASE_URL: "file::memory:",
        S3_ACCESS_KEY_ID: "key",
        S3_SECRET_ACCESS_KEY: "secret",
        S3_ENDPOINT: "http://127.0.0.1:9000",
      },
      { forbidFileDb: false },
    );
    expect(s3.objects).toBeDefined();
    await s3.close?.();
  });
});

describe("createAppRuntimeEdge", () => {
  it("throws when the D1 binding is missing", () => {
    expect(() => createAppRuntimeEdge({})).toThrow("[microinfra] binding D1 (DB) requerido para createAppRuntimeEdge");
  });

  it("builds the drizzle D1 db over the binding", () => {
    const fakeD1 = { tag: "fake-d1" };
    const rt = createAppRuntimeEdge({ DB: fakeD1 }, { relations: widgetRelations });
    expect(rt.mode).toBe("edge");
    expect(rt.db.client).toBe(fakeD1);
    expect(rt.db.orm).toBeDefined();
    expect(rawClientOf(rt.db.orm)).toBe(fakeD1);
  });
});
