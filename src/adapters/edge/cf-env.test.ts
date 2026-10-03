import { afterEach, describe, expect, it } from "vitest";
import { type CfEnvMap, cfEnv, cfVars } from "./cf-env";

afterEach(() => {
  globalThis.__env__ = undefined;
  globalThis.__do_env__ = undefined;
});

describe("cfEnv", () => {
  it("returns undefined without bindings", () => {
    expect(cfEnv()).toBeUndefined();
  });

  it("reads worker bindings", () => {
    const env: CfEnvMap = { DB: { tag: "d1" } };
    globalThis.__env__ = env;
    expect(cfEnv()).toBe(env);
  });

  it("prefers Durable Object env over worker env", () => {
    globalThis.__env__ = { DB: { tag: "worker" } };
    const doEnv: CfEnvMap = { DB: { tag: "do" } };
    globalThis.__do_env__ = doEnv;
    expect(cfEnv()).toBe(doEnv);
  });
});

describe("cfVars", () => {
  it("keeps only string entries", () => {
    expect(cfVars({ TOKEN: "abc", COUNT: 3, DB: { tag: "d1" }, EMPTY: undefined })).toEqual({
      TOKEN: "abc",
    });
  });
});
