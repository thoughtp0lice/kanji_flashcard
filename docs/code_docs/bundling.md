# Part: Build Pipeline & Single-File Production Server

The app's one durable end-to-end workflow: turning source into a single
self-contained `build/kanji-server.mjs` that needs only Node ≥ 24 to run. This
is the app-scale analogue of a "pipeline" — three ordered stages with one
canonical entry point (`npm run bundle`, wrapped by `make build`).

- **Purpose:** produce a copy-anywhere production artifact (frontend embedded,
  API included) and, in dev, serve the built SPA from the API port.
- **Boundary:** build tooling only. It reads `src/`/`server/`, writes `dist/`
  and `build/`; it owns no runtime domain logic.

## Canonical entry point

`npm run bundle` = `vite build && node scripts/embed-assets.mjs && node scripts/bundle.mjs`.
`make build` calls it and prints the artifact size. **Use these; do not invoke a
single stage as a shortcut** — later stages depend on earlier outputs.

## Stages (ordered — each consumes the previous output)

| # | Command | Reads | Writes | Purpose |
|---|---|---|---|---|
| 1 | `vite build` | `index.html`, `src/**` | `dist/` | bundle + minify the React SPA |
| 2 | `node scripts/embed-assets.mjs` | `dist/**` | `build/assets.mjs` | pack every `dist` file as `{path: {type, b64}}` |
| 3 | `node scripts/bundle.mjs` | `server/prod.js` + `build/assets.mjs` | `build/kanji-server.mjs` | esbuild-bundle the server + embedded assets into one ESM file |

- **Stage 2** (`embed-assets.mjs`) walks `dist/` recursively, base64-encodes
  each file, and maps it by URL path with a MIME type (extension → `MIME`
  table; unknown → `application/octet-stream`).
- **Stage 3** (`bundle.mjs`) runs esbuild (`platform:node`, `format:esm`) over
  `server/prod.js`, which imports `../build/assets.mjs`. A `createRequire`
  banner lets the bundled CJS dep (`express`) `require` Node builtins from ESM
  output.
- At runtime `server/prod.js` serves `assets["/index.html"]` for `/` and any
  matching path, falling through to the API for the rest.

## Outputs & retention

| Path | Produced by | Retention |
|---|---|---|
| `dist/` | stage 1 | gitignored; overwritten each build; `make clean` removes |
| `build/assets.mjs` | stage 2 | gitignored intermediate |
| `build/kanji-server.mjs` | stage 3 | gitignored; the shippable artifact (~2 MB) |

Both `dist/` and `build/` are in `.gitignore` and removed by `make clean`. If a
build output ever moves, delete the old path in the same change (`INV-BUILD-2`).

## Deployment shapes

| Mode | Command | Port | Serves frontend via |
|---|---|---|---|
| dev | `npm run server` + `npm run dev` | 5173 (Vite) → 8034 (API, `/api` proxied) | Vite dev server |
| single-port dev/prod | `npm start` | 52654 | `express.static(dist/)` in `index.js` |
| single-file | `make run` / `node build/kanji-server.mjs` | 52654 (`PORT`) | embedded `assets.mjs` |
| Docker | `docker compose up -d` | 52654 | embedded (multi-stage `Dockerfile`) |

The `Dockerfile` runs `npm run bundle` in a build stage and copies only
`build/kanji-server.mjs` into a slim runtime image (`node:24-slim`, non-root,
`/data` volume). (`INV-BUILD-1`: the artifact is self-contained — the runtime
stage installs no npm deps.)

## Invariants & checks

- `INV-BUILD-1`: the single-file artifact runs with only Node ≥ 24 — verified
  by the Docker runtime stage carrying no `node_modules` and by `make build`
  succeeding. Smoke: `make build && node -e "import('./build/kanji-server.mjs')"`.
- `INV-BUILD-2`: generated outputs are gitignored and cleaned on move.

## Related

Server runtime & asset serving: [`server.md`](server.md). Commands:
[`build.md`](build.md). Data that gets bundled: [`data.md`](data.md).
