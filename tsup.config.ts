import { defineConfig } from "tsup";

/**
 * Bundle the Action into a single CJS file so the published action folder has no node_modules
 * dependency at runtime. GitHub Actions JS actions prefer one `dist/index.js` entry.
 */
export default defineConfig({
  // Named entry so the Action's `runs.main: dist/index.js` resolves cleanly under CJS.
  entry: { index: "src/main.ts" },
  format: ["cjs"],
  platform: "node",
  target: "node20",
  outDir: "dist",
  outExtension: () => ({ js: ".js" }),
  sourcemap: true,
  clean: true,
  minify: false,
  // Bundle every dependency so the Action is self-contained when copied to its public repo.
  noExternal: [/.*/],
  treeshake: true,
});
