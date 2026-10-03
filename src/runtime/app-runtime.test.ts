import { describe, expect, it } from "vitest";
import { createAppRuntime } from "./app-runtime";
import { createAppRuntimeEdge } from "./app-runtime-edge";

const stubOrm = { tag: "stub-orm" };

describe("createAppRuntime", () => {
  it("throws when DATABASE_URL is missing", () => {
    expect(() => createAppRuntime({}, { createDb: () => stubOrm })).toThrow(
      "[microinfra] DATABASE_URL es requerido para createAppRuntime",
    );
  });

  it("rejects file: URLs by default", () => {
    expect(() => createAppRuntime({ DATABASE_URL: "file:./data.db" }, { createDb: () => stubOrm })).toThrow(
      "[microinfra] file: DATABASE_URL prohibido en createAppRuntime",
    );
  });

  it("opens embedded memory db and builds the orm when forbidFileDb is false", async () => {
    let seenRemote: boolean | undefined;
    const rt = createAppRuntime(
      { DATABASE_URL: "file::memory:" },
      {
        forbidFileDb: false,
        createDb: ({ client, remote }) => {
          seenRemote = remote;
          expect(client).toBeDefined();
          return stubOrm;
        },
      },
    );
    expect(rt.mode).toBe("node");
    expect(seenRemote).toBe(false);
    expect(rt.db.orm).toBe(stubOrm);
    expect(rt.db.client).toBeDefined();
    await rt.close?.();
  });

  it("branches remote for http(s): URLs and parses the auth token", () => {
    let seenRemote: boolean | undefined;
    const rt = createAppRuntime(
      { DATABASE_URL: "http://127.0.0.1:8080", DATABASE_AUTH_TOKEN: "turso-token" },
      {
        createDb: ({ remote }) => {
          seenRemote = remote;
          return stubOrm;
        },
      },
    );
    expect(seenRemote).toBe(true);
    expect(rt.config.database.authToken).toBe("turso-token");
    expect(rt.db.orm).toBe(stubOrm);
  });

  it("uses memory objects by default and S3 when configured", async () => {
    const memory = createAppRuntime(
      { DATABASE_URL: "file::memory:" },
      { forbidFileDb: false, createDb: () => stubOrm },
    );
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
      { forbidFileDb: false, createDb: () => stubOrm },
    );
    expect(s3.objects).toBeDefined();
    await s3.close?.();
  });
});

describe("createAppRuntimeEdge", () => {
  it("throws when the D1 binding is missing", () => {
    expect(() => createAppRuntimeEdge({}, { createDb: () => stubOrm })).toThrow(
      "[microinfra] binding D1 (DB) requerido para createAppRuntimeEdge",
    );
  });

  it("builds the orm over the D1 binding", () => {
    const fakeD1 = { tag: "fake-d1" };
    const rt = createAppRuntimeEdge({ DB: fakeD1 }, { createDb: (binding) => ({ binding }) });
    expect(rt.mode).toBe("edge");
    expect(rt.db.client).toBe(fakeD1);
    expect(rt.db.orm).toEqual({ binding: fakeD1 });
  });
});
