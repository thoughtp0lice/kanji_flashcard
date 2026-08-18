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
| `src/components/Setup.jsx` | first-run + change-plan: start level (level 0 = kana, or a kanji grade), new/day, review cap |
| `src/components/Flashcard.jsx` | the card (front/back flip, action buttons; on ≥900px screens the buttons move out to a control bar below the card). Also exports `CardMeta`, the kind-aware identity line reused by `DeckView` |
| `src/components/DeckView.jsx` | seen-kanji grid, sort/filter, detail modal |
| `src/components/PracticeView.jsx` | free flip through failed kanji (no scheduling) |
| `src/components/SettingsSheet.jsx` | mode toggle, plan summary, reset, admin, sign-out |
| `src/components/AdminView.jsx` | admin dashboard (calls admin API) |
| `src/api.js` | sync client: auth requests, state fetch, debounced push |

`Study.jsx` owns the card index for the whole app:
`ALL_CARDS = [...KANA, ...KANJI]` (level 0 then the jōyō) and
`BY_ID = new Map(ALL_CARDS.map(k => [k.id, k]))`, both exported — `DeckView`,
`PracticeView`, and `Setup` (via the `cards` prop) work off them, so kana and
kanji flow through identical code paths. Cards carry `kind: "kana"` when they
are kana; only `CardMeta` and the back-of-card reading line branch on it.

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
| `mode`/`startGrade`/`newPerDay`/`reviewLimit`/`typing`/`kanjiInput`/`altFonts` | `prefs` key + `{prefs}` | `dailyGoal` is a legacy alias carried into `newPerDay`; unset `typing`/`kanjiInput`/`altFonts` default to `"kana"`/`"romaji"`/`false` |
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
  A removal tombstone (`{ removed: date }`, see below) beats live state unless
  the live side shows activity (its `seen` or a fail date) **strictly after**
  the removal date — a same-day tie goes to the removal, the deliberate act.
  Two tombstones keep the later date. (`INV-SYNC-4`)
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
4. A manual flip (`space`; tap only in practice) → `pending = "peek"`: the answer offers
   **✓ knew it** (`confirmCheck`) / **✕ didn't know** (`cross`) — nothing is
   recorded until one is chosen, and flipping back to the front cancels the
   peek. After cross/demote (`pending = null`) the answer shows only
   **next →**.
5. `skip()` rotates the current card to the end of today's queue.

### The typing test (`pending = "type"`)

When it applies to the current card, ✓ does not flip — it demands the reading.
The card **animates** down to the top ~half (`.card-zone.typing`) and an input
the full width of the card rises into the space below, under the same round
✕ / ✓ pair the front uses. The answer face never turns, and `flip()` is
disabled so nothing can leak it. Grading is **strict and automatic** — the
typed reading replaces the user's self-assessment:

| Result | Effect |
|---|---|
| correct | card turns over, goes light green, and **waits**; `confirmCheck()` on `✓ next` applies `onSuccess` and advances |
| wrong | `recordFail()` immediately, card turns over light red and waits; `next →` rotates it to the back of today's queue |

The red is not exclusive to the typing test: `recordFail` is the one place a
miss is recorded, whatever caused it, so ✕ "don't know" and "✕ actually no"
turn the card red as well. Colouring only the typed path left the most common
way of admitting a miss with no feedback at all.

**Neither outcome advances on its own.** A right answer is worth seeing the
back of too, and a timer would flash the answer past before it could be read.
The verdict shows a single button, so there is exactly one way forward and no
self-grading left to do.

Note the asymmetry: a **miss is banked at submit** so it cannot be dodged by
navigating away, while a **pass is applied on confirm** — matching the existing
check/confirm flow, where nothing good is recorded until the user says so.

The shrink animates `max-height`, not `flex-basis`: the flex main size is what
changes, and transitioning `flex` means animating `flex-grow`, which the layout
algorithm applies in discrete jumps. All of it is disabled under
`prefers-reduced-motion`.

### The card does not flip on click

In the lesson the card has no click handler, no `role="button"` and no tab
stop: a stray tap used to hand over the answer being tested. Peeking is
deliberate — the space bar (`pending = "peek"`). **Practice mode is the
exception**: it is pure review with nothing at stake, so `practice` restores
the click handler and the "Flashcard — tap to flip" label. Tests distinguish
the two by that label.

Governed by two synced prefs, both in the settings sheet:

| Pref | Values | Meaning |
|---|---|---|
| `typing` | `"off"` \| `"kana"` (default) \| `"all"` | which cards demand a typed reading |
| `kanjiInput` | `"romaji"` (default) \| `"kana"` | what you type for a **kanji**; kana cards are always rōmaji, since their glyph is on screen |
| `altFonts` | `false` (default) \| `true` | show the calligraphic row on the card back |

Answer matching lives in [`src/reading.js`](../../src/reading.js) — pure, and
deliberately tolerant (see its own section below). While the input is focused
the global key handler steps aside (it already ignores `INPUT`), and
`pending === "type"` suppresses the `1`/`2`/space shortcuts so a stray
keystroke cannot grade the card; `Escape` still works.

## Answer matching (`src/reading.js`)

Pure string math, no React. The bias is **tolerant**: rejecting a right answer
over a romanization system is worse than accepting a near-miss in self-study.
Both the typed text and the card's stored readings fold to one canonical form:

- macrons stripped (`kōhī` → `kohi`), case/spaces/punctuation dropped;
- Hepburn and kunrei folded together (`shi`≡`si`, `chi`≡`ti`, `tsu`≡`tu`,
  `fu`≡`hu`, `ji`≡`zi`, `sha`≡`sya`…);
- long vowels collapsed (`kou`≡`koo`≡`kō`≡`ko`, `nn`≡`n`);
- kana input folded katakana→hiragana, so `アイ` and `あい` both pass.

A card's readings field holds several (`"アイ、あわ-れ、あわ-れむ"`); **any** of
them counts, and for an okurigana reading both the whole word and the stem the
kanji itself covers are accepted (`awa-re` → `aware` *and* `awa`). を also
accepts `o`, which is how it is actually pronounced.

The trade-off: collapsing long vowels means `ko` is accepted for a card read
`kou`. That is a deliberate false-accept — you are typing the reading of a card
already on screen, not choosing between candidates.

Keyboard: `space` flip, `2` = ✓/confirm, `1` = ✗/demote, `→` skip, `esc`
back-to-lesson / close menu. (Mirrors the README shortcut table — keep both in
sync.) A `setInterval` rolls the deck over at local midnight.

Infinite mode: when the queue empties, regenerate with `reviewLimit: Infinity`
to pull capped-out reviews + extra new cards until nothing remains.

### Level 0 (kana) in the UI

`Setup` lists **Level 0 — kana** above Grade 1 (`GRADE_LABELS["0"]`), with its
92-card count and あ い う え お as samples; selecting it swaps the plan copy
from "kanji" to "cards" and shows a note that no kanji appears until the whole
chart is known. Choosing it stores `prefs.startGrade = "0"` like any other
level — the gate itself lives in `lesson.js` (see [lesson.md](lesson.md)
§ "Level 0", `INV-SCHED-7`), not in the components.

A kana card renders through the same `Flashcard`: the glyph is `card.kanji`, so
the front is unchanged. Two exported helpers own the only `kind`-dependent
markup, and `DeckView`'s detail modal reuses both:

| Helper | Kanji card | Kana card |
|---|---|---|
| `CardIdentity` | gloss + readings + rōmaji | rōmaji alone (its reading *is* the glyph) |
| `CardMeta` | `grade 4 · 13 strokes · radical 心` (+ old form) | — (kana use `KanaBack`) |
| `KanaBack` | — | the whole back face, three rows (below) |

A kana back is not a kanji back with fields blanked out — it is its own
layout, because a kana has no strokes/radical/gloss to fill the space:

| Row | Shows |
|---|---|
| 1 `.kana-pair` | the sign in **both** scripts side by side (あ / ア) — the pairing is the thing being learned |
| 2 `.kana-romaji-row` | the rōmaji, alone. **No rule between it and row 1** — the two are one statement about the same sound |
| 3 `.kana-faces` | the glyph in the bundled calligraphic faces (optional — the `altFonts` setting) |
| 4 `.kana-examples` | words the sound appears in, from [`kanaExamples.js`](../../src/kanaExamples.js), with the sign picked out of the reading in bold and the whole reading romanized |

### Alt fonts (`src/fonts.js`, `src/fonts/`)

The faces are **bundled webfonts**, not system fonts — an earlier version
probed the OS with canvas `measureText` and had to tell most people the font
was missing. `src/fonts/fonts.css` declares them as subset woff2 (generated by
[`scripts/fetch-fonts.mjs`](../../scripts/fetch-fonts.mjs); see
[`src/fonts/README.md`](../../src/fonts/README.md) for sizes and licence).

| Face | Family | Kanji? |
|---|---|---|
| 筆 | Yuji Syuku — brush calligraphy | yes |
| 手書き | Slackside One — casual handwriting | **no** |
| 丸ポップ | Hachi Maru Pop — rounded handwriting | yes |

`facesFor(card)` drops any face that cannot render the card: a kana back shows
all three, a **kanji** back shows two, because Slackside One has no kanji
outlines and a silent system fallback under a label claiming otherwise is the
thing this row exists to avoid.

The row is **off by default** and applies to kanji as well as kana. Each font
file carries a `unicode-range`, so the browser fetches only the chunk holding a
glyph it paints — with the setting off nothing is fetched, and a level-0 user
only ever pulls the ~54 KB of kana faces, never the ~1.7 MB of kanji outlines.

The typefaces are **system font stacks** (`--serif`/`--sans`/`--round`), not
bundled files — the app ships as one self-contained bundle and a Japanese
webfont would add megabytes. On a device missing a face the stack falls back,
which is no worse than the single face used before.

`hasMore` (the "keep going ∞" affordance) mirrors the gate so infinite mode
never offers kanji that `generateDaily` would refuse.

### Plan changes rebuild today's deck

Saving the plan from `Setup` (change-plan or first run) regenerates today's
deck immediately under the new `startGrade`/`newPerDay`/`reviewLimit` — an
accidentally-chosen grade doesn't linger until midnight. `done` is preserved,
and queued cards failed earlier today are kept for their same-day retry;
everything else is rebuilt from scratch.

### Removing a card (`removeCard` → tombstone)

The `DeckView` detail modal offers **remove from deck** (with `confirm()`).
`removeCard(id)`:

1. replaces the card's stats with `{ removed: todayStr() }` — a **tombstone**,
   not a delete, so the removal itself syncs and survives `mergeStats` against
   another device's stale copy (`INV-SYNC-4`);
2. drops the id from `known` (if present) and from today's queue.

Removed cards never come up as reviews and are eligible to be introduced as
new cards again (`isRemoved` in [lesson.md](lesson.md), `INV-SCHED-6`); if
re-learned, answering starts from a blank stat (`freshOrExisting`). `DeckView`,
the "seen" counter, and the server's admin `seen` count all skip tombstones.

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
- **Desktop control bar:** `Flashcard` watches `matchMedia("(min-width: 900px)")`.
  On wide screens the action buttons render once into a `.control-bar` beneath
  the card (larger targets, card keeps its phone shape) instead of inside the
  card faces; below 900px the mobile DOM is unchanged. jsdom has no real
  `matchMedia`, so tests default to the mobile DOM unless they stub it
  (see the "desktop layout" block in `test/ui.test.jsx`).
- **View URLs:** `Study` maps each view to a path (`/`, `/deck`, `/practice`,
  `/admin` — `VIEW_PATHS`). `navigate()` pushes history; `popstate` restores;
  the initial view is seeded from `location.pathname`, and non-admins hitting
  `/admin` are redirected to `/`. Both server entries serve `index.html` for
  unknown extension-less GET paths so these URLs deep-link (see
  [server.md](server.md)).

## Tests

`test/ui.test.jsx` (jsdom) drives the full app against an in-memory mock
backend: login/register/session-expiry, setup, the check/confirm/demote/cross
loop, infinite refill, admin visibility + delete, the seen-deck/practice views,
the plan-change deck rebuild, card removal, and the level-0 flow (kana-only
deck, chart-order first card, paired-syllabary card back). It also unit-tests
`mergeStats` (exported from `Study.jsx`) including the tombstone rules.

> **Node 26 caveat:** this suite fails locally on Node 26 (native `localStorage`
> global shadows jsdom's). It passes on Node 24 / CI. See
> [`../TRICKY_ISSUES.md`](../TRICKY_ISSUES.md).

## Related

Scheduling math: [`lesson.md`](lesson.md). API & state shape:
[`server.md`](server.md). Invariants: `INV-SYNC-1..4`, `INV-STATE-*`.
