# Part: Scheduling & Daily Deck (`src/lesson.js`)

The algorithmic core of the app: an SM-2/Anki-style spaced-repetition engine
and the daily-deck generator. Pure functions, no I/O, no React — which is why
it is the most heavily unit-tested part (`test/lesson.test.js`).

- **Purpose:** decide *when* each kanji is due and *which* cards make up today's
  deck, blending new kanji with due reviews.
- **Scope / boundary:** pure date and set math over a `stats` map and the
  static kanji list. It does **not** touch storage, network, or the DOM;
  callers (`src/Study.jsx`) own persistence and sync.
- **Dependency position:** a leaf. `Study.jsx`, `DeckView.jsx`, and
  `PracticeView.jsx` import from it; it imports nothing from the app.

## Entry points

| Export | Signature | Purpose |
|---|---|---|
| `GRADE_ORDER` | `["1","2","3","4","5","6","S"]` | canonical grade ordering (school grade, then "S" = secondary/jōyō-only) |
| `todayStr()` | → `"YYYY-MM-DD"` | today in **local** time |
| `addDays(dateStr, n)` | → `"YYYY-MM-DD"` | date arithmetic in local time |
| `onSuccess(stat, today)` | → `stat` | apply a ✓: grow interval / hold relearn step |
| `onFail(stat, today)` | → `stat` | apply a ✗: log fail, shrink interval, due tomorrow |
| `failScore(stat, today)` | → number | recency-weighted fail severity for ordering |
| `totalFails(stat)` | → number | lifetime fail count for a card |
| `isRemoved(stat)` | → boolean | true if the stat is a removal tombstone |
| `generateDaily({...})` | → `{ date, queue, done }` | build today's deck |

## Data model

A per-kanji SRS record (`stat`), keyed by kanji `id` inside `stats`:

| Field | Type | Meaning |
|---|---|---|
| `seen` | `"YYYY-MM-DD"` | first date the card was studied |
| `fails` | `{ [date]: count }` | per-day miss counts (never pruned — drives `failScore`/history) |
| `interval` | number (days) | current SRS interval; absent until first graded answer |
| `due` | `"YYYY-MM-DD"` | next scheduled review date; absent for pre-SRS entries |
| `removed` | `"YYYY-MM-DD"` | **tombstone variant:** the user un-enrolled the card on this date. A tombstone stat is `{ removed }` only; `isRemoved` wins over any other fields present. Removed cards are never reviews and are eligible as new picks again (`INV-SCHED-6`). |

`generateDaily` input:

| Field | Type | Meaning |
|---|---|---|
| `all` | `KANJI[]` | the full static list (`{id,kanji,grade,...}`) |
| `newPerDay` | number | new-card intake cap |
| `reviewLimit` | number \| `Infinity` | max non-yesterday reviews (`Infinity` in infinite mode) |
| `startGrade` | `"1".."6"\|"S"` | lowest grade to introduce |
| `stats` | `{ [id]: stat }` | current SRS state |
| `known` | `Set<id>` | ids the user has marked known (excluded from new) |

Output `{ date, queue: [id...], done: [] }` — `queue` is shuffled reviews +
new picks; `done` starts empty and is appended by the UI as cards are answered.

## Algorithm & state transitions

### Constants (tuning knobs — change here, update this table and `INV-SCHED-*`)

| Const | Value | Role |
|---|---|---|
| `GROWTH` | `2.5` | interval multiplier on success |
| `LAPSE` | `0.2` | interval multiplier on failure (not a full reset) |
| `GRADUATE_DAYS` | `4` | first interval for a card answered ✓ on first sight |
| `MAX_INTERVAL` | `365` | interval ceiling |

### `onSuccess(stat, today)`

- If the card was **failed earlier today** (`stat.fails[today]`): it is in a
  relearning step — keep `interval` as-is (or 1) and set `due = today + 1`. The
  interval does **not** grow the same day it was missed.
- Otherwise: `interval = min(round(interval * 2.5), 365)`, or `GRADUATE_DAYS`
  (4) if the card had no interval yet. `due = today + interval`.

Example: `4 → 10 → 25 → 63 → 158 → 365`.

### `onFail(stat, today)`

- Increment `fails[today]`.
- `interval = max(1, round(interval * 0.2))` — a lapse, not a reset, so a
  mature card stays somewhat mature.
- `due = today + 1` — **always due again tomorrow.** (`INV-SCHED-1`)

### `dueOf(stat)` (internal)

Back-compat shim for pre-SRS records that have `fails` but no `due`: derives
`due` from the day after the last fail. A card seen and never failed under the
old model has no derivable due date and is treated as learned (returns `null`).

### `failScore(stat, today)`

Recency-weighted severity used only for **ordering** reviews: sums
`count * 0.6^(daysAgo-1)` over fail dates ≥ 1 day old. **Today's fails are
excluded** (they are relearning steps, not review-priority signal).
(`INV-SCHED-5`)

### `generateDaily(...)`

1. **Reviews.** Collect every card with `dueOf(stat) <= today`, skipping
   removal tombstones (`isRemoved`). Split into:
   - *Yesterday's fails* — **always included, even past `reviewLimit`.**
     (`INV-SCHED-2`)
   - *The rest* — sorted by `failScore` desc, then earliest `due`; sliced to
     fill the remaining `reviewLimit - (#yesterday fails)` slots.
2. **New cards.** Over the grade span `GRADE_ORDER[indexOf(startGrade):]`,
   build one pool per grade of cards that are neither in `stats` (tombstones
   count as absent) nor `known`.
   `distribute(newPerDay, poolSizes, decay)` weights the lowest grades most; the
   `decay` flattens (`0.25 → 1.0`) as overall progress grows so upper grades
   blend in. Overflow beyond a pool's size spills into the others.
3. Return `{ date, queue: shuffle(reviews + picks), done: [] }`.

`distribute` is a weighted largest-remainder apportionment with overflow
redistribution — see the inline comment; it guarantees the counts sum to
`min(newPerDay, totalAvailable)` and never exceed any pool.

## Invariants, edge cases, limits

- Local-time date formatting throughout; parsing `"YYYY-MM-DD"` splits the
  string rather than using the `Date` string constructor. (`INV-SCHED-4`)
- `interval` floored at 1; `due` never in the past after an answer.
- `reviewLimit = Infinity` yields all due reviews (infinite mode).
- Empty inputs → empty queue (no crash). Known-but-not-seen ids are excluded
  from new picks but are not reviews.
- `shuffled` / `distribute` overflow use `Math.random()` — deck order is
  non-deterministic; tests assert set membership and counts, not order.
- **Known limit:** `fails` grows unbounded over a card's lifetime (one key per
  miss-day). Acceptable at this scale; noted for future pruning.

## Tests & verification

`test/lesson.test.js` (28 cases) is the enforcement point:

- graduation to 4d, ~2.5× growth, 365 cap, same-day-fail relearn hold;
- fail records + tomorrow due, repeated-same-day counts, ~20% lapse floor,
  history preservation;
- `failScore` weighting and today-exclusion;
- `generateDaily`: grade-span selection, upper-grade blend-in, known exclusion,
  yesterday-fails-always-in, review cap, due/overdue handling, pre-SRS due
  derivation, empty queue, infinite limit, date stamping, removal tombstones
  (never reviewed, new-eligible again).

Run: `npm test -- test/lesson.test.js` (Node-environment suite; unaffected by
the Node 26 `localStorage` caveat).

## Related

- Persistence & the check/confirm/demote flow that calls these:
  [`frontend.md`](frontend.md).
- Server-side `stats` merge semantics: [`server.md`](server.md).
- Binding invariants: `INV-SCHED-1..6`, `INV-DATA-1` (see
  [`invariants.md`](invariants.md)).
