# Repository Instructions — 漢字 kanji flashcards

Shared instructions for all coding agents (Claude Code, Codex, others).
**Edit this file, not `CLAUDE.md`.** `CLAUDE.md` is a symlink to this file so
both harnesses read one source of truth.

This repository was set up following the principles in
[`docs/seed/APP_MANAGEMENT_GUIDE.md`](docs/seed/APP_MANAGEMENT_GUIDE.md) — the
application-oriented adaptation of the research-oriented
[`REPO_MANAGEMENT_GUIDE.md`](docs/seed/REPO_MANAGEMENT_GUIDE.md). Read the app
guide before making structural changes to docs, invariants, or agents.

## Orientation

A mobile-first spaced-repetition flashcard app for the 2,136 jōyō kanji, with an
optional **level 0** that teaches the kana first: pick it and the deck stays
hiragana/katakana-only until the whole chart is known (`INV-SCHED-7`).

- **Frontend:** React 18 + Vite. State orchestration in `src/Study.jsx`;
  presentational components in `src/components/`; SRS scheduling in
  `src/lesson.js` (pure, the algorithmic core).
- **Backend:** small Express 5 + `node:sqlite` server (`server/app.js`,
  factory `createApp(dbPath, opts)`), serving accounts, cross-device state
  sync, an admin dashboard, and — in production — the built frontend.
- **Sync:** offline-first. `localStorage` keeps the app fully usable with no
  network; the server is the source of truth when reachable and merges so
  progress made offline on any device is never lost (`src/api.js`,
  `mergeStats` in `src/Study.jsx`).
- **Data:** the kanji list and example words are static generated modules
  (`src/data.js`, `src/examples.js`), sourced from Wikipedia and kanjiapi.dev.
  The level-0 kana (`src/kana.js`, 92 cards) are authored in-repo and are
  ordinary editable source. `Study.jsx` joins both into `ALL_CARDS`/`BY_ID`.
- **Build:** a 3-stage pipeline (`vite build` → embed assets → esbuild bundle)
  produces one self-contained `build/kanji-server.mjs` that needs only
  Node ≥ 24 to run.

**What does not exist yet:** there is no reset-password flow, no rate limiting
on auth, no HTTPS termination (deploy behind a proxy), no migration framework
for the SQLite schema (tables are created with `CREATE TABLE IF NOT EXISTS`),
and no generator script committed for `src/data.js` / `src/examples.js` — they
are treated as vendored data (see [`docs/code_docs/data.md`](docs/code_docs/data.md)).

## Documentation map

Everything below links to one authoritative home — do not duplicate.

| Doc | Owns |
|---|---|
| [`docs/code_docs/README.md`](docs/code_docs/README.md) | system map, part table, glossary, "where do I look?" |
| [`docs/code_docs/lesson.md`](docs/code_docs/lesson.md) | SRS scheduling & daily-deck algorithm |
| [`docs/code_docs/frontend.md`](docs/code_docs/frontend.md) | React state orchestration, components, views, sync client |
| [`docs/code_docs/server.md`](docs/code_docs/server.md) | Express API, SQLite schema, auth, admin |
| [`docs/code_docs/data.md`](docs/code_docs/data.md) | kanji/kana/example dataset shape & provenance |
| [`docs/code_docs/bundling.md`](docs/code_docs/bundling.md) | build pipeline & single-file production server |
| [`docs/code_docs/build.md`](docs/code_docs/build.md) | authoritative command reference |
| [`docs/code_docs/invariants.md`](docs/code_docs/invariants.md) | `INV-*` contract catalog + enforcement |
| [`docs/TRICKY_ISSUES.md`](docs/TRICKY_ISSUES.md) | durable engineering-friction log |
| [`README.md`](README.md) | human-facing feature & usage orientation |

## Docs are part of done

When you change code, update the docs that describe it **in the same change.**

| When you change... | Update all of... |
|---|---|
| the SRS algorithm, intervals, or deck generation | `src/lesson.js`, `docs/code_docs/lesson.md`, affected `INV-SCHED-*`, `test/lesson.test.js` |
| the sync/state shape (`known`/`prefs`/`stats`/`days`) | `server/app.js`, `src/api.js`, `src/Study.jsx`, `docs/code_docs/server.md`, `docs/code_docs/frontend.md`, `INV-STATE-*` |
| an API route, auth rule, or DB table | `server/app.js`, `docs/code_docs/server.md`, `test/server.test.js`, `INV-AUTH-*`/`INV-ADMIN-*` |
| a React view, component prop, or keyboard shortcut | the component, `docs/code_docs/frontend.md`, `README.md` (shortcut table), `test/ui.test.jsx` |
| the kanji/kana/example data shape | `src/data.js`/`src/examples.js`/`src/kana.js`, `docs/code_docs/data.md`, `INV-DATA-*` |
| a command, flag, or dependency | `docs/code_docs/build.md`, `package.json`/`Makefile`, `scripts/check_repo.mjs` if it asserts the command |
| the build/bundling flow or an output path | `scripts/*.mjs`, `docs/code_docs/bundling.md`, and delete the stale artifact location |
| a shared agent role or skill | canonical `.agents/` source **and** every `.claude/`/`.codex/` adapter |

## Conventions & verification

- **Node ≥ 24 is required** — the backend uses the built-in `node:sqlite`
  module. CI pins Node 24. See the Node 26 test caveat below.
- Run `npm test` (scheduler + server + UI) before committing behavior changes.
  Add a test with every behavior change; the test suites are the enforcement
  point for the algorithmic and API invariants.
- Run `node scripts/check_repo.mjs` (or `npm run check`) to verify the
  repository contracts (symlinks, doc links, data integrity, adapters).
- Dates are formatted as **local** `YYYY-MM-DD` everywhere. Never build a day
  key with `new Date("YYYY-MM-DD")` (that parses as UTC midnight and shifts the
  day in negative-offset timezones). Use `todayStr`/`addDays` from `lesson.js`
  on the client and `localDate()` in `server/app.js`. (`INV-SCHED-4`)
- Never record fabricated status: verify a command runs and a test passes
  before saying it does. Re-derive dates and numbers from the source.

## Footguns & boundaries

- **`localStorage` on Node 26 breaks the jsdom UI suite.** All 15 tests in
  `test/ui.test.jsx` fail locally on Node 26 because Node ships a native
  experimental `localStorage` global that shadows jsdom's and is `undefined`
  without `--localstorage-file`. The suite passes on Node 24 (which CI uses).
  This is not a code bug — see [`docs/TRICKY_ISSUES.md`](docs/TRICKY_ISSUES.md).
- **`build/` and `dist/` are generated and gitignored.** `make clean` removes
  both. Do not commit them. When you move an output, delete the old location.
- **User data lives in SQLite** (`server/data/kanji.db` in dev, `KANJI_DATA` in
  prod) and is gitignored. Deleting a user via the admin route is irreversible
  and cascades across four tables.
- **Auth is plain HTTP.** Fine for a home LAN; put it behind HTTPS before wider
  exposure. Passwords are scrypt-hashed with a per-user salt.
- **`src/data.js` and `src/examples.js` are large generated data** (~350 KB
  each, effectively one line). Do not hand-edit or reformat them; treat as
  vendored. Read their shape from [`docs/code_docs/data.md`](docs/code_docs/data.md).

## Harness map

- **Canonical, harness-neutral content** lives in `.agents/`:
  - `.agents/roles/<name>.md` — role procedures (no tool lists / model slugs).
  - `.agents/skills/<name>/SKILL.md` — open-format Agent Skills.
- **Thin adapters** carry only harness-specific metadata and point back:
  - `.claude/agents/<name>.md` — Claude Code frontmatter (tools, model).
  - `.codex/agents/<name>.toml` — Codex config (sandbox mode).
  - `.claude/skills` → `../.agents/skills` (symlink; Codex reads `.agents/skills`
    directly).

Change behavior in the canonical `.agents/` file; touch adapters only for
tool/model/permission changes. `scripts/check_repo.mjs` verifies every adapter
references an existing role and that the skills symlink resolves.

## Review priorities

1. **Correctness of the SRS scheduler** — interval growth/lapse, due-date math,
   and "yesterday's fails are always due" are the product. Guard with
   `test/lesson.test.js`.
2. **Sync safety** — a merge must never drop offline progress from another
   device (`mergeStats`, `PUT /api/state` per-key merge).
3. **Auth & admin** — hashing, session handling, `requireAdmin`, and the
   self-delete guard.
4. **Docs & invariants stay in sync** with the change (the table above).
