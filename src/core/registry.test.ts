import { describe, expect, it } from "vitest";
import { createTestInfra } from "../runtime/test";
import { createInfra } from "./registry";

describe("createInfra", () => {
  it("assembles a RuntimeEnv and freezes it", () => {
    const rt = createTestInfra();
    expect(rt.mode).toBe("test");
    expect(Object.isFrozen(rt)).toBe(true);
    expect(rt.cache).toBeDefined();
    expect(rt.db).toBeDefined();
  });

  it("wires close() to db.close in node mode", async () => {
    const base = createTestInfra();
    let closed = false;
    const markClosed = (): void => {
      closed = true;
    };
    const rt = createInfra({
      ...base,
      mode: "node",
      db: { client: {}, close: async () => markClosed() },
    });
    await rt.close?.();
    expect(closed).toBe(true);
  });
});
