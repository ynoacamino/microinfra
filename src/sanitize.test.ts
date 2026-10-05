import { describe, expect, it } from "vitest";
import { sanitize } from "./sanitize";

describe("sanitize", () => {
  it("convierte null raiz en undefined", () => {
    expect(sanitize(null)).toBeUndefined();
  });

  it("deja primitivos intactos", () => {
    expect(sanitize("a")).toBe("a");
    expect(sanitize(0)).toBe(0);
    expect(sanitize(false)).toBe(false);
    expect(sanitize(undefined)).toBeUndefined();
  });

  it("convierte null en profundidad (objetos y arreglos)", () => {
    expect(sanitize({ a: null, b: { c: null, d: [null, { e: null, f: 1 }] } })).toEqual({
      a: undefined,
      b: { c: undefined, d: [undefined, { e: undefined, f: 1 }] },
    });
  });
});
