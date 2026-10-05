import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/edge.ts", "src/node.ts", "src/memory.ts", "src/hybrid.ts", "src/nitro.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  minify: false,
  sourcemap: true,
  treeshake: true,
  platform: "neutral",
});
