import { describe, expect, it } from "vitest";
import { defineAdapter } from "./define-adapter";

describe("defineAdapter", () => {
  it("returns the definition as-is (open for extension)", () => {
    const def = defineAdapter({ name: "my-cache", port: { tag: true } });
    expect(def.name).toBe("my-cache");
    expect(def.port).toEqual({ tag: true });
  });
});
