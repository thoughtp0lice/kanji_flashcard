# Part: Scheduling & Daily Deck (`src/lesson.js`)

The algorithmic core of the app: an SM-2/Anki-style spaced-repetition engine
and the daily-deck generator. Pure functions, no I/O, no React — which is why
it is the most heavily unit-tested part (`test/lesson.test.js`).

- **Purpose:** decide *when* each card is due and *which* cards make up today's
  deck, blending new cards with due reviews.
- **Scope / boundary:** pure date and set math over a `stats` map and the
  static card list (kana + kanji). It does **not** touch storage, network, or
  the DOM; callers (`src/Study.jsx`) own persistence and sync.
- **Dependency position:** a leaf. `Study.jsx`, `DeckView.jsx`, and
  `PracticeView.jsx` import from it; it imports nothing from the app.

## Entry points

| Export | Signature | Purpose |
|---|---|---|
| `GRADE_ORDER` | `["0","1",…,"6","S"]` | canonical level ordering: `"0"` = kana (level 0), school grades 1–6, then `"S"` = secondary/jōyō-only |
| `KANA_GRADE` | `"0"` | the level-0 grade key (see [data.md](data.md)) |
| `kanaLocked({...})` | → boolean | is the level-0 gate holding? |
| `gradeSpan(startGrade)` | → `grade[]` | the levels a start grade opens, with a safe fallback for unknown values |
| `newCandidates({...})` | → `card[]` | cards eligible to be introduced today, in pick order |
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
| `all` | `card[]` | the full static list — `ALL_CARDS` = `KANA` + `KANJI` (`{id,kanji,grade,...}`) |
| `newPerDay` | number | new-card intake cap |
| `reviewLimit` | number \| `Infinity` | max non-yesterday reviews (`Infinity` in infinite mode) |
| `startGrade` | `"0".."6"\|"S"` | lowest level to introduce (`"0"` = kana) |
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

### Level 0 — the kana gate (`kanaLocked`)

Level 0 teaches the two syllabaries before any kanji. It is a **gate**, not
just another grade: while it holds, the deck is kana-only.

`kanaLocked` is true when **both**:

- `startGrade === "0"` — the user chose level 0. Starting at grade 1+ skips
  level 0 entirely and never shows a kana card; and
- some grade-`"0"` card is neither in `known` nor a removal tombstone.

Note the second clause is deliberately **not** `isNew`. A removed card is
new-eligible again (`INV-SCHED-6`) but *settles* the gate — the user opted out,
and one removed kana must not lock the deck forever.

While locked, `generateDaily` restricts its whole working set to grade `"0"`:
no kanji is introduced **and no kanji review is scheduled**, even one that is
due or was failed yesterday (`INV-SCHED-7` — the one documented exception to
`INV-SCHED-2`). Suppressed kanji reviews are not lost, only deferred: they stay
overdue and return the day the gate lifts.

The gate can re-close if the user un-learns a kana (a ✗ drops it from `known`)
after having cleared it. The cost is bounded — that day's kanji reviews slip by
a day and resume once the kana is re-confirmed.

### `gradeSpan(startGrade)`

The levels a start grade opens: `GRADE_ORDER` from `startGrade` onward.

`startGrade` is a **synced pref**, so it can arrive holding a value this build
does not know — written by a newer client, or corrupted. `indexOf` returns
`-1` for those and `slice(-1)` would silently yield `["S"]`, quietly narrowing
the whole deck to the hardest grade. `gradeSpan` falls back to the full kanji
ladder (grade 1 up) instead. (`INV-SCHED-8`)

This is not hypothetical: shipping level 0 added `"0"` to `GRADE_ORDER`, and
every client still running the previous bundle read a synced
`startGrade: "0"` as exactly that `slice(-1)` → Secondary-only deck. See
[`../TRICKY_ISSUES.md`](../TRICKY_ISSUES.md).

### `generateDaily(...)`

0. **Gate.** `locked = kanaLocked(...)`; if locked, the working pool is the
   grade-`"0"` cards only, for both steps below.
1. **Reviews.** Collect every card in the pool with `dueOf(stat) <= today`,
   skipping removal tombstones (`isRemoved`). Split into:
   - *Yesterday's fails* — **always included, even past `reviewLimit`.**
     (`INV-SCHED-2`)
   - *The rest* — sorted by `failScore` desc, then earliest `due`; sliced to
     fill the remaining `reviewLimit - (#yesterday fails)` slots.
2. **New cards** — `newCandidates` supplies the eligible pool (not in `stats`,
   tombstones counting as absent, and not `known`):
   - *Locked:* take the first `newPerDay` kana in **chart order** — level 0 is
     one ordered course (あいうえお before かきくけこ, all hiragana before
     katakana), not a weighted blend.
   - *Unlocked:* over the grade span `GRADE_ORDER[indexOf(startGrade):]`, build
     one pool per grade. `distribute(newPerDay, poolSizes, decay)` weights the
     lowest grades most; the `decay` flattens (`0.25 → 1.0`) as overall
     progress grows so upper grades blend in. Overflow beyond a pool's size
     spills into the others.
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

`test/lesson.test.js` (39 cases) is the enforcement point:

- graduation to 4d, ~2.5× growth, 365 cap, same-day-fail relearn hold;
- fail records + tomorrow due, repeated-same-day counts, ~20% lapse floor,
  history preservation;
- `failScore` weighting and today-exclusion;
- `generateDaily`: grade-span selection, upper-grade blend-in, known exclusion,
  yesterday-fails-always-in, review cap, due/overdue handling, pre-SRS due
  derivation, empty queue, infinite limit, date stamping, removal tombstones
  (never reviewed, new-eligible again), and level-0 exclusion for kanji-grade
  starts;
- the kana gate (`describe("level 0 — the kana gate")`): locks only for a
  level-0 start, unlocks when the chart is known, a removed kana settles it,
  chart-order intake, hiragana before katakana, kanji fully hidden while locked
  (including a due review), kana still reviewed, kanji released on unlock.

Run: `npm test -- test/lesson.test.js` (Node-environment suite; unaffected by
the Node 26 `localStorage` caveat).

## Related

- Persistence & the check/confirm/demote flow that calls these:
  [`frontend.md`](frontend.md).
- Server-side `stats` merge semantics: [`server.md`](server.md).
- Level-0 dataset: [`data.md`](data.md) § "Kana (`src/kana.js`)".
- Binding invariants: `INV-SCHED-1..7`, `INV-DATA-1`, `INV-DATA-3` (see
  [`invariants.md`](invariants.md)).
