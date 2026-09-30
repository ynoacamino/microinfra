import { describe, expect, it } from "vitest";
import { createMapEnv } from "../adapters/memory/map-env";
import { createEnvConfig } from "./env-schema";

describe("createEnvConfig", () => {
  it("applies agnostic defaults", () => {
    const config = createEnvConfig(createMapEnv({}));
    expect(config.backendUrl).toBe("http://localhost:7000");
    expect(config.port).toBe(7000);
    expect(config.corsOrigins).toEqual([]);
    expect(config.export.maxRows).toBe(50000);
  });

  it("parses origins and redis settings", () => {
    const config = createEnvConfig(
      createMapEnv({
        CORS_ORIGINS: "http://a:8000, http://b:8000",
        UPSTASH_REDIS_REST_URL: "https://x",
        UPSTASH_REDIS_REST_TOKEN: "t",
        DATABASE_URL: "libsql://x",
      }),
    );
    expect(config.corsOrigins).toEqual(["http://a:8000", "http://b:8000"]);
    expect(config.redis.url).toBe("https://x");
    expect(config.database.url).toBe("libsql://x");
  });

  it("throws a clear error on invalid PORT", () => {
    expect(() => createEnvConfig(createMapEnv({ PORT: "-1" }))).toThrow("[env]");
  });
});
