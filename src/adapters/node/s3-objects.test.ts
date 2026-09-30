import { afterEach, describe, expect, it, vi } from "vitest";
import { createEnvConfig } from "../../schema/env-schema";
import { createMapEnv } from "../memory/map-env";
import { createS3Port, isS3Configured } from "./s3-objects";

afterEach(() => {
  vi.unstubAllGlobals();
});

function s3Config(overrides: Record<string, string> = {}) {
  return createEnvConfig(
    createMapEnv({
      S3_ACCESS_KEY_ID: "key",
      S3_SECRET_ACCESS_KEY: "secret",
      S3_REGION: "garage",
      S3_BUCKET_NAME: "test-bucket",
      S3_ENDPOINT: "http://127.0.0.1:3900",
      S3_FORCE_PATH_STYLE: "true",
      ...overrides,
    }),
  );
}

interface SeenRequest {
  url: string;
  method: string;
}

function stubFetch(handler: (seen: SeenRequest) => Response) {
  const seen: SeenRequest[] = [];
  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? (typeof input === "object" && !(input instanceof URL) ? input.method : "GET");
    seen.push({ url, method });
    return handler({ url, method });
  });
  return seen;
}

describe("s3 port", () => {
  it("reports configuration from env", () => {
    expect(isS3Configured(s3Config())).toBe(true);
    expect(isS3Configured(createEnvConfig(createMapEnv({})))).toBe(false);
  });

  it("puts objects with content type and metadata, returning the public url", async () => {
    const seen = stubFetch(() => new Response("ok"));
    const port = createS3Port(s3Config(), { ids: () => "fixed-id" });
    const url = await port.put("a/b.txt", new TextEncoder().encode("hi"), {
      contentType: "text/plain",
      metadata: { owner: "u1" },
    });
    expect(url).toBe("http://127.0.0.1:3900/test-bucket/a/b.txt");
    expect(seen).toHaveLength(1);
    expect(seen[0]?.url).toBe("http://127.0.0.1:3900/test-bucket/a/b.txt");
    expect(port.generateKey("media")).toBe("media/fixed-id");
  });

  it("throws on failed uploads", async () => {
    stubFetch(() => new Response("denied", { status: 403 }));
    const port = createS3Port(s3Config());
    await expect(port.put("k", new Uint8Array([1]), { contentType: "bin" })).rejects.toThrow("S3 upload failed");
  });

  it("reads objects and throws on missing keys", async () => {
    stubFetch(({ url }) => (url.endsWith("/missing") ? new Response("nope", { status: 404 }) : new Response("hello")));
    const port = createS3Port(s3Config());
    expect(new TextDecoder().decode(await port.read("present"))).toBe("hello");
    await expect(port.read("missing")).rejects.toThrow("S3 read failed");
  });

  it("tolerates 404 on delete but throws on other errors", async () => {
    stubFetch(({ url }) =>
      url.endsWith("/gone") ? new Response("nope", { status: 404 }) : new Response("denied", { status: 403 }),
    );
    const port = createS3Port(s3Config());
    await expect(port.delete("gone")).resolves.toBeUndefined();
    await expect(port.delete("bad")).rejects.toThrow("S3 delete failed");
  });

  it("caches signed urls and invalidates them on delete", async () => {
    stubFetch(() => new Response("ok"));
    const port = createS3Port(s3Config());
    const first = await port.getSignedUrl("doc.pdf", 3600);
    const second = await port.getSignedUrl("doc.pdf", 3600);
    expect(second).toBe(first);
    expect(first).toContain("X-Amz-Signature=");
    await port.delete("doc.pdf");
    const third = await port.getSignedUrl("doc.pdf", 3600);
    expect(typeof third).toBe("string");
  });

  it("prefers the public url for external links and supports virtual-hosted style", async () => {
    stubFetch(() => new Response("ok"));
    const withPublic = createS3Port(s3Config({ S3_PUBLIC_URL: "https://cdn.example.com" }));
    expect(withPublic.getPublicUrl("x")).toBe("https://cdn.example.com/x");
    expect(await withPublic.getSignedUrl("x", 60)).toContain("https://cdn.example.com/x?");

    const virtualHosted = createS3Port(s3Config({ S3_FORCE_PATH_STYLE: "false" }));
    expect(virtualHosted.getPublicUrl("x")).toBe("https://test-bucket.127.0.0.1:3900/x");
  });
});
