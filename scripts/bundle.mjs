// Bundles server + embedded frontend into a single self-contained file.
// Run after `vite build` and `scripts/embed-assets.mjs`.
import { build } from "esbuild";

await build({
  entryPoints: ["server/prod.js"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: "build/kanji-server.mjs",
  logLevel: "error",
  banner: {
    // lets bundled CJS deps (express) require node builtins from ESM output
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
});
console.log("built build/kanji-server.mjs");
