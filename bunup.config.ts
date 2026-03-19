import { defineConfig } from "bunup";
import { exports } from "bunup/plugins";

export default defineConfig({
  entry: ["source/index.ts"],
  format: ["esm", "cjs"],
  outDir: "dist",
  dts: true,
  minify: false,
  sourcemap: true,
  plugins: [exports()],
});
