import { describe, expect, it } from "vitest";
import { createTestInfra } from "../runtime/test";
import { ormOf, requireOrm } from "./types";

describe("db/types", () => {
  it("ormOf returns undefined on test infra and requireOrm throws", () => {
    const rt = createTestInfra();
    expect(ormOf(rt)).toBeUndefined();
    expect(() => requireOrm(rt)).toThrow("[microinfra] DB orm no disponible");
  });

  it("requireOrm returns the orm when present", () => {
    const orm = { tag: "fake-orm" };
    const rt = createTestInfra();
    (rt.db as { orm?: unknown }).orm = orm;
    expect(requireOrm(rt)).toBe(orm);
    expect(ormOf(rt)).toBe(orm);
  });
});
