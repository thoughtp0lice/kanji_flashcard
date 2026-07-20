// Packs the vite build (dist/) into a JS module so the production server
// can be bundled into a single self-contained file.
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { join, relative, extname } from "path";

const DIST = "dist";
const OUT = "build/assets.mjs";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".map": "application/json",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

const assets = {};
for (const file of walk(DIST)) {
  const path = "/" + relative(DIST, file).replaceAll("\\", "/");
  assets[path] = {
    type: MIME[extname(file)] || "application/octet-stream",
    b64: readFileSync(file).toString("base64"),
  };
}

mkdirSync("build", { recursive: true });
writeFileSync(OUT, `export default ${JSON.stringify(assets)};\n`);
const total = Object.values(assets).reduce((n, a) => n + a.b64.length, 0);
console.log(
  `embedded ${Object.keys(assets).length} assets (${(total / 1024 / 1024).toFixed(1)} MB) -> ${OUT}`
);
