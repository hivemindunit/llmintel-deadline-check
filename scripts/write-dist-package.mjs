import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Mark dist/ as CommonJS so GitHub Actions can require dist/index.js under a type:module package. */
const distDir = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
writeFileSync(join(distDir, "package.json"), `${JSON.stringify({ type: "commonjs" }, null, 2)}\n`);
