# Part: Frontend — State Orchestration, Views & Sync Client

The React 18 + Vite frontend. Covers the auth gate (`App.jsx`), the main study
screen and all state orchestration (`Study.jsx`), the presentational components
(`src/components/`), and the offline-first sync client (`src/api.js`).

- **Purpose:** render the study loop and views; own all client state,
  persistence, and server synchronization.
- **Boundary:** the frontend owns *when* to persist and *how* to merge; it
  delegates *scheduling* to [`lesson.js`](lesson.md) and *storage/auth* to the
  [server](server.md). Components below `Study.jsx` are presentational — they
  receive data and callbacks, they do not fetch or schedule.
- **Dependency position:** `App → Study → {components, lesson, api}`.
  `DeckView`/`PracticeView` import `BY_ID` from `Study.jsx`.

## Entry points & call flow

| File | Role |
|---|---|
| `src/main.jsx` | mounts `<App/>` in `<React.StrictMode>` |
| `src/App.jsx` | auth gate: no user/token → `<Login/>`, else `<Study key={user}/>` |
| `src/Study.jsx` | state owner + router across `lesson`/`deck`/`practice`/`admin` views |
| `src/components/Login.jsx` | username/password form, calls `login`/`register` |
| `src/components/Setup.jsx` | first-run + change-plan: start grade, new/day, review cap |
| `src/components/Flashcard.jsx` | the card (front/back flip, action buttons; on ≥900px screens the buttons move out to side rails) |
| `src/components/DeckView.jsx` | seen-kanji grid, sort/filter, detail modal |
| `src/components/PracticeView.jsx` | free flip through failed kanji (no scheduling) |
| `src/components/SettingsSheet.jsx` | mode toggle, plan summary, reset, admin, sign-out |
| `src/components/AdminView.jsx` | admin dashboard (calls admin API) |
| `src/api.js` | sync client: auth requests, state fetch, debounced push |

`App` stores `user`/`token`/`isAdmin` in `localStorage` and React state.
Switching user remounts `Study` via `key={user}`, guaranteeing fresh state.
`migrateLegacy` adopts pre-accounts `localStorage` progress into the first
username that logs in on the device.

## State ownership (`Study.jsx`)

Per-user `localStorage` keys are namespaced by username:
`joyo-kanji-{known,prefs,stats,day}:${user}`.

| State | Persisted to | Notes |
|---|---|---|
| `known` | `known` key + `PUT /api/state {known}` | `Set<id>` of confirmed cards |
| `mode`/`startGrade`/`newPerDay`/`reviewLimit` | `prefs` key + `{prefs}` | `dailyGoal` is a legacy alias carried into `newPerDay` |
| `stats` | `stats` key + `{stats}` | per-kanji SRS map (see [lesson.md](lesson.md)) |
| `day` | `day` key + `{days:{[date]:day}}` | today's deck; discarded if `date !== todayStr()` |

`saveKnown`/`saveStats`/`saveDay` each do the same three things: set React
state, write `localStorage`, and `pushState(token, partial)`. **localStorage is
written synchronously and unconditionally** so the app is correct offline;
the server push is best-effort. (`INV-SYNC-1`)

### Load & merge (offline-first)

On mount (`useEffect` on `token`), `fetchState` pulls the server state and
merges it into local, never overwriting:

- `known`: **union** of local and server ids; re-pushed if local had extras.
- `stats`: `mergeStats(local, server)` — per date, the **max** fail count;
  earliest `seen`; and the side with the **later `due`** wins scheduling (it
  reflects the most recent answer). (`INV-SYNC-2`)
- `prefs`: server values adopted if present.
- `day`: server's entry for `todayStr()` adopted if present.

`ready` gates deck generation and prefs-push until this initial sync settles, so
a first render never pushes empty prefs over good server data.

### The study loop (check / confirm / demote / cross)

The ✓ button does **not** immediately mark the card known. Flow:

1. `check()` → `pending = "check"`, flips to the answer. Nothing recorded yet.
2. On the answer: **✓ next** (`confirmCheck`) applies `onSuccess`, adds to
   `known`, advances the queue; **✕ actually no** (`demote`) records a fail via
   `onFail` and keeps studying — the card retries later today.
3. ✗ (`cross`) records the fail immediately and flips to the answer.
4. `skip()` rotates the current card to the end of today's queue.

Keyboard: `space` flip, `2` = ✓/confirm, `1` = ✗/demote, `→` skip, `esc`
back-to-lesson / close menu. (Mirrors the README shortcut table — keep both in
sync.) A `setInterval` rolls the deck over at local midnight.

Infinite mode: when the queue empties, regenerate with `reviewLimit: Infinity`
to pull capped-out reviews + extra new cards until nothing remains.

## Sync client (`src/api.js`)

| Export | Behavior |
|---|---|
| `login`/`register` | `POST` credentials → `{token, username, admin}`; throws on non-2xx |
| `logout(token)` | fire-and-forget `POST /api/logout` |
| `fetchState(token, onExpired)` | `GET /api/state`; `401` → `onExpired()` + `null`; network error → `null` |
| `pushState(token, partial)` | **debounced 400 ms**, coalesces partials; drops silently offline |
| `adminOverview`/`adminDeleteUser` | admin API wrappers |

`pushState` accumulates partial fields in a module-level `pending` object and
flushes once after 400 ms of quiet — many rapid answers become one PUT. If the
token changes, `pending` is reset so one user's writes never post under
another's token. Offline failures are swallowed; `localStorage` retains the
data and it re-syncs on the next change or load. (`INV-SYNC-3`)

## Edge cases & failure behavior

- **Offline:** every action still updates `localStorage` and the UI; pushes
  fail silently and reconcile on reconnect.
- **Expired session:** `fetchState` returns `401` → `onSignOut` clears
  credentials and returns to `<Login/>`.
- **StrictMode double-invoke:** the load effect uses a `cancelled` flag so the
  dev double-mount does not double-apply server state.
- **`Flashcard` flip lag:** the shown card lags `card` by 230 ms when navigating
  away from a flipped card so the flip-back animation finishes before the answer
  swaps out.
- **Desktop side rails:** `Flashcard` watches `matchMedia("(min-width: 900px)")`.
  On wide screens the action buttons render once into `.side-rail` elements
  flanking the card (larger targets, card keeps its phone shape) instead of
  inside the card faces; below 900px the mobile DOM is unchanged. jsdom has no
  real `matchMedia`, so tests default to the mobile DOM unless they stub it
  (see the "desktop layout" block in `test/ui.test.jsx`).

## Tests

`test/ui.test.jsx` (jsdom) drives the full app against an in-memory mock
backend: login/register/session-expiry, setup, the check/confirm/demote/cross
loop, infinite refill, admin visibility + delete, and the seen-deck/practice
views.

> **Node 26 caveat:** this suite fails locally on Node 26 (native `localStorage`
> global shadows jsdom's). It passes on Node 24 / CI. See
> [`../TRICKY_ISSUES.md`](../TRICKY_ISSUES.md).

## Related

Scheduling math: [`lesson.md`](lesson.md). API & state shape:
[`server.md`](server.md). Invariants: `INV-SYNC-1..3`, `INV-STATE-*`.
