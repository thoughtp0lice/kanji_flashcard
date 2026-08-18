# System Map — 漢字 kanji flashcards

The index of real surfaces. Start here, then follow into the part docs. Root
policy lives in [`../../AGENTS.md`](../../AGENTS.md); commands in
[`build.md`](build.md); the contract catalog in [`invariants.md`](invariants.md).

## What this is

A mobile-first spaced-repetition flashcard app for the 2,136 jōyō kanji, with an
optional level 0 that teaches hiragana + katakana first. React + Vite frontend,
Express + `node:sqlite` backend for accounts and cross-device sync.
Offline-first: `localStorage` keeps it fully usable with no network.

**One-line data/control flow:**
`Login → Study.jsx` loads local + server state (merge) → `generateDaily`
(`lesson.js`) builds today's deck → each answer updates `stats`/`known`/`day`,
written to `localStorage` and debounce-pushed to `PUT /api/state` → the server
persists the JSON blob in SQLite.

## Documentation tree

```
AGENTS.md                     # root policy (CLAUDE.md -> AGENTS.md)
README.md                     # human feature/usage orientation
docs/
  code_docs/
    README.md                 # this system map
    lesson.md                 # SRS scheduling & daily-deck algorithm  (src/lesson.js)
    frontend.md               # React orchestration, components, sync client
    server.md                 # Express API, SQLite schema, auth, admin
    data.md                   # kanji/kana/example dataset shape & provenance
    bundling.md               # 3-stage build → single-file server
    build.md                  # authoritative command reference
    invariants.md             # INV-* catalog + enforcement
  TRICKY_ISSUES.md            # durable friction log (newest first)
  seed/
    REPO_MANAGEMENT_GUIDE.md  # source guide (research-oriented)
    APP_MANAGEMENT_GUIDE.md   # app-oriented adaptation used for this repo
scripts/check_repo.mjs        # repository contract checks (npm run check)
.agents/ .claude/ .codex/     # shared roles/skills + harness adapters
```

## Parts

| Part | Doc | Code | Status |
|---|---|---|---|
| Scheduling & daily deck | [lesson.md](lesson.md) | `src/lesson.js` | active |
| Frontend (orchestration, views, sync client) | [frontend.md](frontend.md) | `src/App.jsx`, `src/Study.jsx`, `src/components/`, `src/api.js`, `src/reading.js`, `src/fonts.js`, `src/kanaExamples.js` | active |
| Backend API | [server.md](server.md) | `server/app.js`, `server/index.js`, `server/prod.js` | active |
| Bundled webfonts | [frontend.md](frontend.md) § Alt fonts | `src/fonts/`, `scripts/fetch-fonts.mjs` | active (generated, OFL) |
| Card datasets (kanji + level-0 kana) | [data.md](data.md) | `src/data.js`, `src/examples.js`, `src/kana.js` | active (kanji vendored/generated; kana authored) |
| Build pipeline & single-file server | [bundling.md](bundling.md) | `scripts/embed-assets.mjs`, `scripts/bundle.mjs`, `Makefile`, `Dockerfile` | active |
| Repo contract checks | — | `scripts/check_repo.mjs` | active |

_Not implemented:_ password reset, auth rate limiting, HTTPS termination, SQLite
migration framework, committed data-generator script. See per-part "open items"
and `AGENTS.md` § "What does not exist yet".

## Architecture & layering

```
                 App.jsx (auth gate)
                     │
                 Study.jsx ── owns state, persistence, sync, view routing
        ┌────────────┼───────────────┬─────────────┐
   components/     lesson.js       api.js        data.js / examples.js
   (presentational) (pure SRS)   (sync client)   (static data)
                                     │
                                HTTP /api
                                     │
                 server/app.js  ── createApp(dbPath) ── node:sqlite
```

Layering rules:
- `lesson.js` is a leaf (no app imports); scheduling logic lives only there.
- Components are presentational — no `fetch`, no scheduling; they take
  props/callbacks from `Study.jsx`.
- The server runs **no** SRS logic — it stores/merges an opaque state blob.
- Adapters (`.claude`/`.codex`) hold no behavior; it lives in `.agents/`.

## Central design problem

Keep progress correct and never-lost across **offline use on multiple devices**,
while the scheduler and UI stay simple. The answer: `localStorage` is always
authoritative locally and written first; the server is a mergeable backup whose
load-time merge (`mergeStats`, per-key `PUT`) is designed to never drop offline
work. See [frontend.md](frontend.md) § "Load & merge" and `INV-SYNC-*`.

## Cross-cutting conventions

- **Local-time dates** everywhere (`INV-SCHED-4`).
- **Docs are part of done** — see the trigger table in `AGENTS.md`.
- **Honest status** — verify before recording (dates, test results, sizes).
- Formal contracts: [invariants.md](invariants.md).

## Generated artifacts

| Path | By | Retention |
|---|---|---|
| `dist/` | `vite build` | gitignored; overwritten each build |
| `build/assets.mjs`, `build/kanji-server.mjs` | `npm run bundle` | gitignored; shippable artifact |
| `server/data/kanji.db` (dev), `$KANJI_DATA` (prod) | server runtime | gitignored user data — never commit |

## Worked trace — one ✓ answer

1. User presses `2`/✓ → `check()` sets `pending="check"`, flips to the answer.
2. User presses `2` again → `confirmCheck()`:
   `onSuccess(stat, today)` (`lesson.js`) grows the interval; card added to
   `known`; `day.queue` advances, `day.done` appends.
3. `saveStats`/`saveKnown`/`saveDay` write `localStorage` and call
   `pushState`, which coalesces and (after 400 ms) `PUT /api/state`.
4. Server shallow-merges `stats`/`days` per key and unions `known`, persisting
   the JSON blob for the user.

## Glossary (authoritative)

| Term | Meaning |
|---|---|
| **card** | anything studiable: a kanji (`src/data.js`) or a kana (`src/kana.js`); `ALL_CARDS` is both |
| **stat** | per-card SRS record: `{seen, fails:{date:n}, interval, due}` |
| **known** | `Set` of card ids the user confirmed (✓ + confirm) |
| **day / deck** | `{date, queue:[id], done:[id]}` — today's cards |
| **interval** | days until a card is next due |
| **due** | the date a card is next scheduled |
| **lapse** | a failure; shrinks the interval to ~20%, not a reset |
| **graduate** | a first-sight ✓ → 4-day interval |
| **grade** | school grade `1..6`, `S` (secondary/jōyō-only), or `0` = level 0 |
| **level 0 / kana gate** | the 92-card hiragana+katakana course; while it holds, the deck is kana-only (`INV-SCHED-7`) |
| **new-per-day / review-limit** | intake cap / review cap in the daily plan |
| **infinite mode** | keep drawing capped-out reviews + extra new cards |
| **typing test** | ✓ demands the reading typed in; correct passes the card, wrong is a miss (`INV-TYPE-1`) |
| **state blob** | the JSON `{known,prefs,stats,days}` stored per user |

## Where do I look?

| I want to… | Go to |
|---|---|
| change interval math / deck mix | `src/lesson.js` → [lesson.md](lesson.md) |
| change the calligraphic faces | `scripts/fetch-fonts.mjs`, `src/fonts.js` → [src/fonts/README.md](../../src/fonts/README.md) |
| change how a typed answer is judged | `src/reading.js` → [frontend.md](frontend.md) |
| change the study loop / a view / a shortcut | `src/Study.jsx`, `src/components/` → [frontend.md](frontend.md) |
| add/change an API route or auth rule | `server/app.js` → [server.md](server.md) |
| change what syncs or how merges resolve | `src/api.js`, `mergeStats` → [frontend.md](frontend.md), [server.md](server.md) |
| touch the kanji/example data | `src/data.js`, `src/examples.js` → [data.md](data.md) |
| change level 0 / the kana set | `src/kana.js`, `kanaLocked` in `src/lesson.js` → [data.md](data.md), [lesson.md](lesson.md) |
| change the build / ship a single file | `scripts/`, `Makefile` → [bundling.md](bundling.md) |
| run/verify something | [build.md](build.md) |
| understand a standing contract | [invariants.md](invariants.md) |
| record non-obvious friction | [../TRICKY_ISSUES.md](../TRICKY_ISSUES.md) |
