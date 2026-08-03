// Daily-deck generation, modeled on SM-2/Anki-style spaced repetition:
// - success grows a card's interval ~×2.5 (1 → 3 → 8 → 19 → 47 ... days)
// - failure cuts the interval to ~20% (not a full reset) and the card comes
//   back tomorrow as a relearning step, so yesterday's fails are always due
// - due reviews take priority over new cards; the new-card count is capped
//   (each new card generates ~5-7 future reviews, so intake is what you limit)

export const GRADE_ORDER = ["1", "2", "3", "4", "5", "6", "S"];

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

  // reviews: everything due today or earlier; yesterday's fails are always
  // included, the rest fill up to reviewLimit ordered by how badly they're
  // failing (recency-weighted) and how overdue they are
  const due = all
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

  // new cards: pools per grade, weighted toward the lowest grades; the
  // weight curve flattens as overall progress grows, blending upper grades in
  const span = GRADE_ORDER.slice(GRADE_ORDER.indexOf(startGrade));
  const isNew = (k) =>
    (!stats[k.id] || isRemoved(stats[k.id])) && !known.has(k.id);
  const pools = span
    .map((g) => all.filter((k) => k.grade === g && isNew(k)))
    .filter((p) => p.length > 0);
  const totalInSpan = all.filter((k) => span.includes(k.grade)).length;
  const remaining = pools.reduce((n, p) => n + p.length, 0);
  const progress = totalInSpan ? (totalInSpan - remaining) / totalInSpan : 0;
  const decay = 0.25 + 0.75 * progress;
  const counts = distribute(newPerDay, pools.map((p) => p.length), decay);
  const picks = pools.flatMap((p, i) =>
    shuffled(p).slice(0, counts[i]).map((k) => k.id)
  );

  return { date: today, queue: shuffled([...reviews, ...picks]), done: [] };
}
