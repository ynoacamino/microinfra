import { describe, expect, it } from "vitest";
import { createR2PortFromBinding, putOptions, type R2Binding, type R2GetResult } from "./r2-objects";

function makeBinding(): R2Binding & { store: Map<string, { bytes: Uint8Array }> } {
  const store = new Map<string, { bytes: Uint8Array }>();
  return {
    store,
    put: async (key, body) => {
      const bytes = body instanceof Uint8Array ? body : new Uint8Array(await new Response(body).arrayBuffer());
      store.set(key, { bytes });
    },
    get: async (key): Promise<R2GetResult | null> => {
      const entry = store.get(key);
      if (!entry) return null;
      return { arrayBuffer: async () => entry.bytes.buffer as ArrayBuffer };
    },
    delete: async (key) => void store.delete(key),
  };
}

describe("r2 objects", () => {
  it("writes and reads bytes through the binding", async () => {
    const port = createR2PortFromBinding(makeBinding(), { ids: () => "fixed" });
    const key = port.generateKey("media");
    expect(key).toBe("media/fixed");
    await port.put(key, new TextEncoder().encode("hi"), { contentType: "text/plain", metadata: { a: "b" } });
    expect(new TextDecoder().decode(await port.read(key))).toBe("hi");
    expect(port.getPublicUrl(key)).toBe(`r2://${key}`);
    expect(await port.getSignedUrl(key)).toBe(`r2://${key}`);
    await port.delete(key);
    await expect(port.read(key)).rejects.toThrow("R2 read failed");
  });

  it("prefixes public urls when configured", async () => {
    const port = createR2PortFromBinding(makeBinding(), { publicUrl: "https://cdn.example.com/" });
    expect(port.getPublicUrl("a")).toBe("https://cdn.example.com/a");
  });

  it("maps content type and metadata to R2 put options", () => {
    expect(putOptions("text/plain", { a: "b" })).toEqual({
      httpMetadata: { contentType: "text/plain" },
      customMetadata: { a: "b" },
    });
  });
});
