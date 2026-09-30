import path from "node:path";
import { fileURLToPath } from "node:url";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const srcDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.toml" } })],
  resolve: {
    alias: {
      "@": path.resolve(srcDir, "src"),
    },
  },
  test: {
    globals: true,
    pool: "@cloudflare/vitest-pool-workers",
    include: ["src/tests/integration/edge/**/*.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
