import { describe, expect, it } from "vitest";
import type { ObjectPort } from "../../ports/object-storage";

const PAYLOAD = new TextEncoder();

export function describeObjectsContract(name: string, makeObjects: () => ObjectPort | Promise<ObjectPort>): void {
  describe(`ObjectPort contract [${name}]`, () => {
    it("writes and reads bytes back", async () => {
      const objects = await makeObjects();
      const key = objects.generateKey("contract");
      await objects.put(key, PAYLOAD.encode("hello-bytes"), { contentType: "text/plain" });
      expect(new TextDecoder().decode(await objects.read(key))).toBe("hello-bytes");
      await objects.delete(key);
    });

    it("exposes public and signed urls containing the key", async () => {
      const objects = await makeObjects();
      const key = objects.generateKey("contract");
      await objects.put(key, PAYLOAD.encode("x"), { contentType: "text/plain" });
      expect(objects.getPublicUrl(key)).toContain(key);
      const signed = await objects.getSignedUrl(key, 3600);
      expect(typeof signed).toBe("string");
      expect(signed).toContain(key);
      await objects.delete(key);
    });

    it("rejects reads of missing keys", async () => {
      const objects = await makeObjects();
      await expect(objects.read(`contract/missing-${crypto.randomUUID()}`)).rejects.toThrow();
    });
  });
}
