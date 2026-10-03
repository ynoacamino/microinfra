import { describe, expect, it } from "vitest";
import { once } from "./singleton";

describe("once", () => {
  it("initializes once and returns the same instance", () => {
    let calls = 0;
    const first = once("singleton-test-a", () => {
      calls += 1;
      return { tag: "deps" };
    });
    const second = once("singleton-test-a", () => {
      calls += 1;
      return { tag: "deps" };
    });
    expect(first).toBe(second);
    expect(calls).toBe(1);
  });

  it("isolates different keys", () => {
    const a = once("singleton-test-b", () => "a");
    const b = once("singleton-test-c", () => "b");
    expect(a).toBe("a");
    expect(b).toBe("b");
  });
});
