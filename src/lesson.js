// Daily-deck generation, modeled on SM-2/Anki-style spaced repetition:
// - success grows a card's interval ~×2.5 (1 → 3 → 8 → 19 → 47 ... days)
// - failure cuts the interval to ~20% (not a full reset) and the card comes
//   back tomorrow as a relearning step, so yesterday's fails are always due
// - due reviews take priority over new cards; the new-card count is capped
//   (each new card generates ~5-7 future reviews, so intake is what you limit)

// "0" is level 0 — the kana syllabaries (src/kana.js), taught before any kanji
export const GRADE_ORDER = ["0", "1", "2", "3", "4", "5", "6", "S"];

export const KANA_GRADE = "0";

const GROWTH = 2.5; // interval multiplier on success
const LAPSE = 0.2; // interval multiplier on failure
const GRADUATE_DAYS = 4; // first interval for a card answered ✓ on first sight
const MAX_INTERVAL = 365;

const pad = (n) => String(n).padStart(2, "0");

function fmt(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayStr() {
  return fmt(new Date());
}

export function addDays(dateStr, n) {
  // parse as local time — new Date("YYYY-MM-DD") would be UTC midnight,
  // which shifts the day in timezones behind UTC
  const [y, m, d] = dateStr.split("-").map(Number);
  return fmt(new Date(y, m - 1, d + n));
}

function daysAgo(dateStr, today) {
  return Math.round((new Date(today) - new Date(dateStr)) / 86400000);
}

// success: relearn step stays at 1 day if the card was failed earlier today,
// otherwise the interval grows
export function onSuccess(stat, today) {
  if (stat.fails?.[today]) {
    return { ...stat, interval: stat.interval ?? 1, due: addDays(today, 1) };
  }
  const interval = stat.interval
    ? Math.min(Math.round(stat.interval * GROWTH), MAX_INTERVAL)
    : GRADUATE_DAYS;
  return { ...stat, interval, due: addDays(today, interval) };
}

// failure: log it, shrink the interval, due again tomorrow
export function onFail(stat, today) {
  const fails = { ...stat.fails, [today]: (stat.fails?.[today] || 0) + 1 };
  const interval = Math.max(1, Math.round((stat.interval ?? 1) * LAPSE));
  return { ...stat, fails, interval, due: addDays(today, 1) };
}

// a removed card carries a dated tombstone instead of SRS state:
// { removed: "YYYY-MM-DD" }. It never comes up as a review and is
// eligible to be picked as a new card again.
export function isRemoved(stat) {
  return Boolean(stat?.removed);
}

// pre-SRS entries have no `due`; derive one from their last fail
function dueOf(stat) {
  if (stat.due) return stat.due;
  const failDates = Object.keys(stat.fails || {});
  if (failDates.length) return addDays(failDates.sort().at(-1), 1);
  return null; // seen and never failed under the old model: treat as learned
}

export function failScore(stat, today) {
  let s = 0;
  for (const [date, count] of Object.entries(stat?.fails || {})) {
    const ago = daysAgo(date, today);
    if (ago >= 1) s += count * Math.pow(0.6, ago - 1);
  }
  return s;
}

export function totalFails(stat) {
  return Object.values(stat?.fails || {}).reduce((a, b) => a + b, 0);
}

function shuffled(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// split n across pools (ordered easiest grade first): weight decays by
// `decay` per step, overflow beyond a pool's size spills into the others
function distribute(n, poolSizes, decay) {
  const weights = poolSizes.map((_, j) => Math.pow(decay, j));
  const wsum = weights.reduce((a, b) => a + b, 0);
  const exact = weights.map((w) => (n * w) / wsum);
  const counts = exact.map(Math.floor);
  let rem = n - counts.reduce((a, b) => a + b, 0);
  [...exact.keys()]
    .sort((a, b) => exact[b] - counts[b] - (exact[a] - counts[a]))
    .slice(0, rem)
    .forEach((i) => counts[i]++);
  let overflow = 0;
  for (let i = 0; i < counts.length; i++) {
    const take = Math.min(counts[i], poolSizes[i]);
    overflow += counts[i] - take;
    counts[i] = take;
  }
  for (let i = 0; i < counts.length && overflow > 0; i++) {
    const spare = poolSizes[i] - counts[i];
    const add = Math.min(spare, overflow);
    counts[i] += add;
    overflow -= add;
  }
  return counts;
}

// a card the user has never been offered (or has un-enrolled) is new again
const isNew = (k, stats, known) =>
  (!stats[k.id] || isRemoved(stats[k.id])) && !known.has(k.id);

// Level 0 gate: while the user started at kana and any kana card is still
// neither known nor deliberately removed, the deck is kana-only — no kanji is
// introduced or reviewed. Picking a grade above 0 skips level 0 entirely.
//
// Note this is *not* `isNew`: removing a card un-learns it for scheduling
// (`INV-SCHED-6`) but settles it for the gate — the user opted out, and one
// removed kana must not lock the deck forever.
export function kanaLocked({ all, startGrade, stats, known }) {
  if (startGrade !== KANA_GRADE) return false;
  return all.some(
    (k) =>
      k.grade === KANA_GRADE && !known.has(k.id) && !isRemoved(stats[k.id])
  );
}

// the cards eligible to be introduced today, in the order they'd be taken.
// While the kana gate holds this is the remaining kana in chart order
// (hiragana, then katakana); otherwise it is everything unseen in the grade
// span, and the caller weights it per grade.
export function newCandidates({ all, startGrade, stats, known }) {
  if (kanaLocked({ all, startGrade, stats, known }))
    return all.filter((k) => k.grade === KANA_GRADE && isNew(k, stats, known));
  const span = new Set(GRADE_ORDER.slice(GRADE_ORDER.indexOf(startGrade)));
  return all.filter((k) => span.has(k.grade) && isNew(k, stats, known));
}

export function generateDaily({
  all,
  newPerDay,
  reviewLimit,
  startGrade,
  stats,
  known,
}) {
  const today = todayStr();
  const yesterday = addDays(today, -1);

  // while the kana gate holds, kanji are out of scope for reviews too — a
  // level-0 user sees nothing but kana (`INV-SCHED-7`)
  const locked = kanaLocked({ all, startGrade, stats, known });
  const pool = locked ? all.filter((k) => k.grade === KANA_GRADE) : all;

  // reviews: everything due today or earlier; yesterday's fails are always
  // included, the rest fill up to reviewLimit ordered by how badly they're
  // failing (recency-weighted) and how overdue they are
  const due = pool
    .filter((k) => stats[k.id] && !isRemoved(stats[k.id]))
    .map((k) => ({ id: k.id, st: stats[k.id], due: dueOf(stats[k.id]) }))
    .filter((x) => x.due && x.due <= today);
  const yFails = due.filter((x) => x.st.fails?.[yesterday]);
  const rest = due
    .filter((x) => !x.st.fails?.[yesterday])
    .sort(
      (a, b) =>
        failScore(b.st, today) - failScore(a.st, today) ||
        a.due.localeCompare(b.due)
    );
  const reviews = [
    ...yFails.map((x) => x.id),
    ...rest.slice(0, Math.max(0, reviewLimit - yFails.length)).map((x) => x.id),
  ];

  // new cards
  const candidates = newCandidates({ all, startGrade, stats, known });
  let picks;
  if (locked) {
    // level 0 is a single ordered course, not a weighted blend: take the next
    // kana in chart order so あいうえお comes before かきくけこ
    picks = candidates.slice(0, newPerDay).map((k) => k.id);
  } else {
    // pools per grade, weighted toward the lowest grades; the weight curve
    // flattens as overall progress grows, blending upper grades in
    const span = GRADE_ORDER.slice(GRADE_ORDER.indexOf(startGrade));
    const pools = span
      .map((g) => candidates.filter((k) => k.grade === g))
      .filter((p) => p.length > 0);
    const totalInSpan = all.filter((k) => span.includes(k.grade)).length;
    const remaining = pools.reduce((n, p) => n + p.length, 0);
    const progress = totalInSpan ? (totalInSpan - remaining) / totalInSpan : 0;
    const decay = 0.25 + 0.75 * progress;
    const counts = distribute(newPerDay, pools.map((p) => p.length), decay);
    picks = pools.flatMap((p, i) =>
      shuffled(p).slice(0, counts[i]).map((k) => k.id)
    );
  }

  return { date: today, queue: shuffled([...reviews, ...picks]), done: [] };
}
