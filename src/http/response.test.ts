import { describe, expect, it } from "vitest";
import { toNativeResponse } from "./response";

describe("toNativeResponse", () => {
  it("returns a native Response preserving status, headers and body", async () => {
    const original = new Response(JSON.stringify({ ok: true }), {
      status: 201,
      headers: { "content-type": "application/json", "x-custom": "1" },
    });
    const native = await toNativeResponse(original);
    expect(native).toBeInstanceOf(Response);
    expect(native.constructor).toBe(Response);
    expect(native.status).toBe(201);
    expect(native.headers.get("content-type")).toBe("application/json");
    expect(native.headers.get("x-custom")).toBe("1");
    expect(await native.json()).toEqual({ ok: true });
  });

  it("handles empty bodies without throwing on null-body statuses", async () => {
    const native = await toNativeResponse(new Response(null, { status: 204 }));
    expect(native.status).toBe(204);
    expect(await native.text()).toBe("");
  });
});
