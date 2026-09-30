import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const srcDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(srcDir, "src"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/tests/integration/node/**/*.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 180_000,
    coverage: { enabled: false },
  },
});
