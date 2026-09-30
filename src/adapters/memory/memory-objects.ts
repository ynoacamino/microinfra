import type { ObjectPort } from "../../ports/object-storage";

export function createMemoryObjects(): ObjectPort & { size(): number } {
  const map = new Map<string, { bytes: Uint8Array; contentType: string }>();
  return {
    put: async (key, body, options) => {
      const bytes = body instanceof Uint8Array ? body : new Uint8Array(await new Response(body).arrayBuffer());
      map.set(key, { bytes, contentType: options.contentType });
      return key;
    },
    delete: async (key) => {
      map.delete(key);
    },
    read: async (key) => {
      const entry = map.get(key);
      if (!entry) throw new Error(`[objects] Missing key: ${key}`);
      return entry.bytes;
    },
    getSignedUrl: async (key) => `memory://${key}`,
    getPublicUrl: (key) => `memory://${key}`,
    generateKey: (prefix) => `${prefix}/${crypto.randomUUID()}`,
    size: () => map.size,
  };
}
