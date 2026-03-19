import { defineConfig } from "bunup";

export default defineConfig({
  entry: ["source/index.ts"],
  format: ["esm", "cjs"],
  outDir: "dist",
  dts: true,
  minify: true,
  sourcemap: true,
});
