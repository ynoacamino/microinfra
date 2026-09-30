import { describe, expect, it } from "vitest";
import { postgresCacheAdapter } from "./custom-adapter";

describe("custom-adapter example", () => {
  it("documents how to extend without modifying the core", () => {
    expect(postgresCacheAdapter.name).toBe("postgres-cache");
    expect(postgresCacheAdapter.port).toBeDefined();
  });
});
