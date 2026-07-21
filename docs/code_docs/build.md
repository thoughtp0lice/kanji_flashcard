# Build, Test & Run — Authoritative Command Reference

The single source of truth for commands. Only verified commands are listed. If a
command is not here, assume it does not exist. Architecture of the build is in
[`bundling.md`](bundling.md).

## Prerequisites

- **Node ≥ 24** (the backend uses the built-in `node:sqlite`). CI pins Node 24.
  See the [Node 26 test caveat](#node-26-test-caveat) below.
- `npm install` (or `npm ci` for a clean, lockfile-exact install).

## Commands

| Command | What it does |
|---|---|
| `npm install` / `npm ci` | install dependencies |
| `npm run dev` | Vite dev server on `:5173`, proxying `/api` → `:8034` |
| `npm run server` | API server on `:8034` (dev); serves `dist/` if built |
| `npm start` | `vite build` then serve app + API from `:8033` |
| `npm test` | full Vitest suite (scheduler + server + UI) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run build` | `vite build` only → `dist/` |
| `npm run bundle` | full 3-stage single-file build → `build/kanji-server.mjs` |
| `npm run check` | repository contract checks (`scripts/check_repo.mjs`) |
| `make build` | `npm run bundle` + prints artifact size |
| `make run` | build then run the single-file server (`PORT`, `KANJI_ADMINS`) |
| `make test` | `npm test` |
| `make clean` | remove `dist/` and `build/` |
| `make docker` | `docker build -t kanji-flashcard .` |
| `docker compose up -d` | build + run on `:8033` (data in `kanji-data` volume) |

Typical dev loop: `npm run server &` then `npm run dev`.

## Environment variables

| Var | Default | Effect |
|---|---|---|
| `PORT` | 8034 dev / 8033 prod | listen port |
| `KANJI_ADMINS` | `""` | comma-separated admin usernames |
| `KANJI_DATA` | `./data` next to the bundle | prod SQLite data directory |

## Verified status (2026-07-20, Node 26.3.0)

- `npm ci` — OK.
- `npm test -- test/lesson.test.js test/server.test.js` — **47 passed.**
- `npm test` (full) — **15 UI tests fail on Node 26**; see caveat. Passes on
  Node 24 / CI.
- `make build` — OK, produces `build/kanji-server.mjs` (~2.1 MB).
- `node scripts/check_repo.mjs` — OK (see the script for the current check set).

Record the date and Node version whenever you re-verify; do not copy an old
"passing" claim forward without re-running.

## Node 26 test caveat

The jsdom UI suite (`test/ui.test.jsx`, 15 tests) fails on Node 26 because Node
ships a native experimental `localStorage` global that shadows jsdom's and is
`undefined` without `--localstorage-file`. It passes on **Node 24** (CI's
version). The scheduler and server suites are Node-environment and unaffected.
Full analysis and candidate fixes: [`../TRICKY_ISSUES.md`](../TRICKY_ISSUES.md).

To run only the unaffected suites on Node 26:
`npm test -- test/lesson.test.js test/server.test.js`.

## CI

`.github/workflows/ci.yml` runs on every push to `main` and every PR:
`npm ci` → `npm run build` → `npm test`, on Node 24.
