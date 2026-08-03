# Invariants

The catalog of standing contracts. Each has a stable `INV-<AREA>-<N>` ID, the
place it is defined/enforced, and a concrete check (a named test, a script, or a
review question). "How checked" must name something runnable or reviewable — not
a promise.

Enforcement points: the Vitest suites (`test/`) cover algorithmic/API contracts;
`scripts/check_repo.mjs` (`npm run check`) covers repository/doc/data structure.

## Scheduling (`src/lesson.js`)

| ID | Invariant | Defined / enforced in | How checked |
|---|---|---|---|
| INV-SCHED-1 | A failed card is always due the next day; interval is floored at 1 (lapse, not reset). | `onFail` | `test/lesson.test.js` "records the fail and schedules for tomorrow", "lapses to ~20%… floored at 1" |
| INV-SCHED-2 | Yesterday's fails are always in today's deck, even past `reviewLimit`. | `generateDaily` | `test/lesson.test.js` "always includes yesterday's fails, even beyond the review limit" |
| INV-SCHED-3 | Interval never exceeds `MAX_INTERVAL` (365). | `onSuccess` | `test/lesson.test.js` "caps the interval at a year" |
| INV-SCHED-4 | All dates are local `YYYY-MM-DD`; never parse a day key with `new Date("YYYY-MM-DD")`. | `todayStr`/`addDays`/`fmt`; `localDate()` in `server/app.js` | Review + `test/lesson.test.js` "crosses month and year boundaries"; grep check in `check_repo.mjs` |
| INV-SCHED-5 | `failScore` excludes today's fails and decays 0.6×/day for ordering only. | `failScore` | `test/lesson.test.js` "weights yesterday fully…", "excludes today's fails" |
| INV-SCHED-6 | A removed card (`{removed: date}` tombstone) is never selected as a review and is eligible as a new pick again. | `isRemoved`, `generateDaily` | `test/lesson.test.js` "never reviews a removed card…", "lets a removed card be picked as a new card again" |

## State & sync (`src/api.js`, `src/Study.jsx`, `server/app.js`)

| ID | Invariant | Defined / enforced in | How checked |
|---|---|---|---|
| INV-STATE-1 | `PUT /api/state` replaces+dedupes `known`; shallow-merges `prefs`/`stats`/`days` per top-level key; rejects wrong shapes with 400. | `server/app.js` `PUT /api/state` | `test/server.test.js` "replaces and dedupes known", "merges … shallowly", "merges days per date…", "merges stats per kanji", "validates payload shapes" |
| INV-STATE-2 | Users are isolated: one user's state is never returned to another. | `server/app.js` `auth` + per-username rows | `test/server.test.js` "isolates users from each other" |
| INV-SYNC-1 | Every progress mutation writes `localStorage` synchronously and unconditionally; the server push is best-effort. | `saveKnown`/`saveStats`/`saveDay`, `pushState` | Review; `test/ui.test.jsx` day-loop tests (persist across reload) |
| INV-SYNC-2 | The load-time merge never loses local progress: `known` unions, `stats` takes max fails / earliest seen / later-due. | `mergeStats` + load effect in `Study.jsx` | `test/ui.test.jsx` "mergeStats" block; session tests |
| INV-SYNC-3 | `pushState` is debounced, coalesces partials, and resets pending state on token change (no cross-user writes). | `src/api.js` `pushState` | Review of `pushState`; token-swap branch |
| INV-SYNC-4 | A removal tombstone survives merges against stale live state: it wins unless the live side's `seen`/fail activity is strictly after the removal date (re-learned); two tombstones keep the later date. | `mergeStats` in `Study.jsx` | `test/ui.test.jsx` "lets a removal tombstone beat stale live state…", "revives a card re-learned after its removal", "keeps the later of two tombstones" |

## Auth & admin (`server/app.js`)

| ID | Invariant | Defined / enforced in | How checked |
|---|---|---|---|
| INV-AUTH-1 | Passwords are scrypt-hashed with a per-user salt and compared with `timingSafeEqual`. | `hash`, `POST /api/login` | `test/server.test.js` "rejects a wrong password"; review of `hash`/compare |
| INV-AUTH-2 | Usernames must match `/^[a-z0-9_-]{1,32}$/`; passwords ≥ 4 chars. | `checkCredentials` | `test/server.test.js` "rejects invalid usernames", "rejects short and missing passwords" |
| INV-ADMIN-1 | Admin routes require `adminUsers.includes(username)`; else 403 (401 unauth). | `requireAdmin` | `test/server.test.js` "rejects non-admin and unauthenticated access" |
| INV-ADMIN-2 | Deleting a user refuses self (400) and unknown (404); otherwise cascades across sessions/visits/state/users and invalidates the session. | `DELETE /api/admin/users/:name` | `test/server.test.js` "refuses to delete yourself", "404s deleting an unknown user", "deletes a user and invalidates their session" |

## Data (`src/data.js`, `src/examples.js`)

| ID | Invariant | Defined / enforced in | How checked |
|---|---|---|---|
| INV-DATA-1 | `KANJI[].id` values are unique; `BY_ID` is total over them. | `src/data.js`; `BY_ID` in `Study.jsx` | `scripts/check_repo.mjs` (dup-id scan) |
| INV-DATA-2 | Every `KANJI[].grade` is a member of `GRADE_ORDER`. | `src/data.js` / `lesson.js` | `scripts/check_repo.mjs` (grade-domain scan) |

## Build (`scripts/`, `Makefile`, `Dockerfile`)

| ID | Invariant | Defined / enforced in | How checked |
|---|---|---|---|
| INV-BUILD-1 | The single-file `build/kanji-server.mjs` runs with only Node ≥ 24 (no npm deps at runtime). | `scripts/bundle.mjs`, `Dockerfile` runtime stage | `make build`; Docker runtime stage installs nothing; smoke `node -e "import('./build/kanji-server.mjs')"` |
| INV-BUILD-2 | `dist/` and `build/` are generated, gitignored, and removed on move/`make clean`. | `.gitignore`, `Makefile clean` | `scripts/check_repo.mjs` (gitignore contains both) |

## Repository & agents (docs, `.agents/`, adapters)

| ID | Invariant | Defined / enforced in | How checked |
|---|---|---|---|
| INV-DOC-1 | `CLAUDE.md` is a relative symlink to `AGENTS.md`. | repo root | `scripts/check_repo.mjs` (symlink target) |
| INV-DOC-2 | Local Markdown links in tracked docs resolve to existing files. | `docs/**`, `AGENTS.md`, `README.md` | `scripts/check_repo.mjs` (link resolver) |
| INV-DOC-3 | Every real part in `code_docs/README.md`'s part table has a doc that exists. | `docs/code_docs/README.md` | `scripts/check_repo.mjs` (part-table doc existence) |
| INV-AGENT-1 | Every `.claude/agents/*.md` and `.codex/agents/*.toml` adapter references an existing `.agents/roles/*.md`. | adapters | `scripts/check_repo.mjs` (adapter → role resolver) |
| INV-SKILL-1 | `.claude/skills` resolves to `.agents/skills` and each skill has a `SKILL.md`. | `.claude/skills` symlink | `scripts/check_repo.mjs` (symlink + `SKILL.md` presence) |

## Known Open Violations

_None known as of 2026-07-20._ Gaps below are explicitly **not** covered by an
automated check (so their absence is not mistaken for coverage):

- `INV-SYNC-1`/`INV-SYNC-3` and `INV-AUTH-1` (hashing scheme) are
  **review-enforced**, not asserted by a dedicated unit test. (`INV-SYNC-2` and
  `INV-SYNC-4` are now unit-tested via the exported `mergeStats`.)
- `INV-SCHED-4`'s "never `new Date("YYYY-MM-DD")`" is a grep heuristic; a novel
  UTC-parsing pattern could slip past it.
- `EXAMPLES` keys are not required to exist in `KANJI` (external data) — checked
  only as a soft warning, no `INV`.
