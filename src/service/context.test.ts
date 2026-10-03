import { describe, expect, it } from "vitest";
import { createTestInfra } from "../runtime/test";
import { contextFromRuntime, sessionUser, syntheticRequest } from "./context";

describe("sessionUser", () => {
  it("returns null for signed-out sessions", () => {
    expect(sessionUser(null)).toBeNull();
  });

  it("maps id/email/name", () => {
    expect(sessionUser({ user: { id: "u1", email: "a@x.test", name: "Ada" } })).toEqual({
      id: "u1",
      email: "a@x.test",
      name: "Ada",
    });
  });
});

describe("contextFromRuntime", () => {
  it("builds the shared service context", () => {
    const rt = createTestInfra();
    const request = new Request("http://localhost/api/graphql");
    const user = { id: "u1" };
    const ctx = contextFromRuntime(rt, { db: { tag: "db" }, user, request });
    expect(ctx.db).toEqual({ tag: "db" });
    expect(ctx.runtime).toBe(rt);
    expect(ctx.user).toBe(user);
    expect(ctx.request).toBe(request);
  });

  it("syntheticRequest returns a native Request", () => {
    const request = syntheticRequest();
    expect(request).toBeInstanceOf(Request);
  });
});
