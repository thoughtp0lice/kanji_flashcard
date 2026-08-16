import { describe, expect, it } from "vitest";
import {
  addDays,
  failScore,
  generateDaily,
  kanaLocked,
  newCandidates,
  onFail,
  onSuccess,
  todayStr,
  totalFails,
} from "../src/lesson.js";
import { KANJI } from "../src/data.js";
import { KANA } from "../src/kana.js";

const T = "2026-07-20";
const ALL = [...KANA, ...KANJI];
const gradeOf = new Map(ALL.map((k) => [k.id, k.grade]));
const countByGrade = (ids) =>
  ids.reduce((m, id) => {
    const g = gradeOf.get(id);
    m[g] = (m[g] || 0) + 1;
    return m;
  }, {});

describe("addDays", () => {
  it("adds and subtracts days", () => {
    expect(addDays(T, 1)).toBe("2026-07-21");
    expect(addDays(T, -1)).toBe("2026-07-19");
  });

  it("crosses month and year boundaries", () => {
    expect(addDays("2026-07-31", 1)).toBe("2026-08-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01"); // not a leap year
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29"); // leap year
  });

  it("todayStr matches the date format", () => {
    expect(todayStr()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(addDays(todayStr(), 0)).toBe(todayStr());
  });
});

describe("onSuccess", () => {
  it("graduates a fresh card to 4 days", () => {
    const st = onSuccess({ seen: T, fails: {} }, T);
    expect(st.interval).toBe(4);
    expect(st.due).toBe(addDays(T, 4));
  });

  it("grows the interval ~2.5x", () => {
    const st = onSuccess({ seen: T, fails: {}, interval: 4, due: T }, T);
    expect(st.interval).toBe(10);
    expect(st.due).toBe(addDays(T, 10));
  });

  it("caps the interval at a year", () => {
    const st = onSuccess({ seen: T, fails: {}, interval: 300, due: T }, T);
    expect(st.interval).toBe(365);
  });

  it("keeps a same-day-failed card at a 1-day relearning step", () => {
    const failed = onFail({ seen: T, fails: {} }, T);
    const st = onSuccess(failed, T);
    expect(st.interval).toBe(1);
    expect(st.due).toBe(addDays(T, 1));
  });
});

describe("onFail", () => {
  it("records the fail and schedules for tomorrow", () => {
    const st = onFail({ seen: T, fails: {} }, T);
    expect(st.fails[T]).toBe(1);
    expect(st.due).toBe(addDays(T, 1));
  });

  it("counts repeated fails on the same day", () => {
    const st = onFail(onFail({ seen: T, fails: {} }, T), T);
    expect(st.fails[T]).toBe(2);
  });

  it("lapses to ~20% of the old interval, floored at 1", () => {
    expect(onFail({ fails: {}, interval: 47, due: T }, T).interval).toBe(9);
    expect(onFail({ fails: {}, interval: 2, due: T }, T).interval).toBe(1);
  });

  it("preserves earlier fail history", () => {
    const st = onFail({ fails: { "2026-07-01": 3 } }, T);
    expect(st.fails["2026-07-01"]).toBe(3);
    expect(totalFails(st)).toBe(4);
  });
});

describe("failScore", () => {
  it("weights yesterday fully and decays 0.6x per day", () => {
    expect(failScore({ fails: { [addDays(T, -1)]: 1 } }, T)).toBeCloseTo(1);
    expect(failScore({ fails: { [addDays(T, -2)]: 1 } }, T)).toBeCloseTo(0.6);
    expect(failScore({ fails: { [addDays(T, -3)]: 2 } }, T)).toBeCloseTo(0.72);
  });

  it("excludes today's fails", () => {
    expect(failScore({ fails: { [T]: 5 } }, T)).toBe(0);
  });

  it("handles missing stats", () => {
    expect(failScore(undefined, T)).toBe(0);
    expect(failScore({}, T)).toBe(0);
  });
});

describe("generateDaily", () => {
  const base = { all: KANJI, startGrade: "1", stats: {}, known: new Set() };

  it("fills the new-card count for a fresh user, favoring the start grade", () => {
    const d = generateDaily({ ...base, newPerDay: 20, reviewLimit: 100 });
    expect(d.queue).toHaveLength(20);
    expect(new Set(d.queue).size).toBe(20);
    const byGrade = countByGrade(d.queue);
    expect(byGrade["1"]).toBeGreaterThan(10);
  });

  it("only picks from the selected grade span", () => {
    const d = generateDaily({ ...base, startGrade: "S", newPerDay: 10, reviewLimit: 100 });
    expect(d.queue.every((id) => gradeOf.get(id) === "S")).toBe(true);
  });

  it("moves to upper grades when lower ones are exhausted", () => {
    const stats = {};
    for (const k of KANJI.filter((k) => ["1", "2"].includes(k.grade))) {
      stats[k.id] = { seen: "2026-07-01", fails: {}, interval: 100, due: "2027-01-01" };
    }
    const d = generateDaily({ ...base, stats, newPerDay: 10, reviewLimit: 0 });
    const byGrade = countByGrade(d.queue);
    expect(byGrade["1"] ?? 0).toBe(0);
    expect(byGrade["2"] ?? 0).toBe(0);
    expect(byGrade["3"]).toBeGreaterThan(0);
  });

  it("excludes known kanji from new cards", () => {
    const known = new Set(KANJI.filter((k) => k.grade === "1").map((k) => k.id));
    const d = generateDaily({ ...base, known, newPerDay: 10, reviewLimit: 0 });
    expect(d.queue.some((id) => known.has(id))).toBe(false);
  });

  it("always includes yesterday's fails, even beyond the review limit", () => {
    const today = todayStr();
    const yest = addDays(today, -1);
    const stats = {};
    for (let i = 1; i <= 8; i++)
      stats[i] = { seen: "2026-07-01", fails: { [yest]: 1 }, interval: 1, due: today };
    for (let i = 9; i <= 20; i++)
      stats[i] = { seen: "2026-07-01", fails: { "2026-07-01": 2 }, interval: 3, due: today };
    const d = generateDaily({ ...base, stats, newPerDay: 0, reviewLimit: 3 });
    for (let i = 1; i <= 8; i++) expect(d.queue).toContain(i);
    const others = d.queue.filter((id) => id >= 9 && id <= 20);
    expect(others).toHaveLength(0); // yesterday's 8 already exceed the limit of 3
  });

  it("caps non-yesterday reviews at the review limit", () => {
    const today = todayStr();
    const stats = {};
    for (let i = 1; i <= 10; i++)
      stats[i] = { seen: "2026-07-01", fails: { "2026-07-01": 1 }, interval: 3, due: today };
    const d = generateDaily({ ...base, stats, newPerDay: 0, reviewLimit: 4 });
    expect(d.queue).toHaveLength(4);
  });

  it("excludes cards not yet due", () => {
    const today = todayStr();
    const stats = {
      5: { seen: "2026-07-01", fails: {}, interval: 8, due: addDays(today, 3) },
    };
    const d = generateDaily({ ...base, stats, newPerDay: 0, reviewLimit: 100 });
    expect(d.queue).toHaveLength(0);
  });

  it("treats overdue cards as due", () => {
    const today = todayStr();
    const stats = {
      5: { seen: "2026-07-01", fails: {}, interval: 8, due: addDays(today, -10) },
    };
    const d = generateDaily({ ...base, stats, newPerDay: 0, reviewLimit: 100 });
    expect(d.queue).toEqual([5]);
  });

  it("derives due dates for pre-SRS entries from their last fail", () => {
    const stats = {
      // legacy shape: no interval/due; failed long ago -> overdue -> included
      5: { seen: "2026-07-01", fails: { "2026-07-05": 1 } },
      // legacy, never failed -> treated as learned -> excluded
      6: { seen: "2026-07-01", fails: {} },
    };
    const d = generateDaily({ ...base, stats, newPerDay: 0, reviewLimit: 100 });
    expect(d.queue).toEqual([5]);
  });

  it("returns an empty queue when nothing is available", () => {
    const stats = {};
    for (const k of KANJI)
      stats[k.id] = { seen: "2026-07-01", fails: {}, interval: 100, due: "2027-01-01" };
    const d = generateDaily({ ...base, stats, newPerDay: 10, reviewLimit: 10 });
    expect(d.queue).toHaveLength(0);
  });

  it("supports an infinite review limit", () => {
    const today = todayStr();
    const stats = {};
    for (let i = 1; i <= 50; i++)
      stats[i] = { seen: "2026-07-01", fails: { "2026-07-01": 1 }, interval: 3, due: today };
    const d = generateDaily({ ...base, stats, newPerDay: 0, reviewLimit: Infinity });
    expect(d.queue).toHaveLength(50);
  });

  it("stamps today's date and an empty done list", () => {
    const d = generateDaily({ ...base, newPerDay: 1, reviewLimit: 0 });
    expect(d.date).toBe(todayStr());
    expect(d.done).toEqual([]);
  });

  it("never reviews a removed card, even with overdue SRS state", () => {
    const today = todayStr();
    const stats = {
      // a tombstone wins over any scheduling fields sitting next to it
      5: { seen: "2026-07-01", fails: { "2026-07-05": 3 }, due: addDays(today, -2), removed: "2026-07-10" },
    };
    const d = generateDaily({ ...base, startGrade: "S", stats, newPerDay: 0, reviewLimit: 100 });
    expect(d.queue).toHaveLength(0);
  });

  it("ignores level 0 entirely when starting at a kanji grade", () => {
    const d = generateDaily({
      ...base,
      all: ALL,
      startGrade: "1",
      newPerDay: 20,
      reviewLimit: 100,
    });
    expect(d.queue.some((id) => gradeOf.get(id) === "0")).toBe(false);
  });

  it("lets a removed card be picked as a new card again", () => {
    const stats = {};
    for (const k of KANJI.filter((k) => k.grade === "S"))
      stats[k.id] = { seen: "2026-07-01", fails: {}, interval: 100, due: "2027-01-01" };
    const removedId = KANJI.find((k) => k.grade === "S").id;
    stats[removedId] = { removed: "2026-07-10" };
    const d = generateDaily({ ...base, startGrade: "S", stats, newPerDay: 10, reviewLimit: 0 });
    expect(d.queue).toEqual([removedId]);
  });
});

describe("level 0 — the kana gate", () => {
  const base = { all: ALL, startGrade: "0", stats: {}, known: new Set() };
  const kanaIds = KANA.map((k) => k.id);
  const allKanaKnown = () => new Set(kanaIds);

  it("locks only for a user who started at level 0", () => {
    expect(kanaLocked({ ...base })).toBe(true);
    expect(kanaLocked({ ...base, startGrade: "1" })).toBe(false);
  });

  it("unlocks once every kana is known", () => {
    expect(kanaLocked({ ...base, known: allKanaKnown() })).toBe(false);
  });

  it("stays locked while a single kana is outstanding", () => {
    const known = allKanaKnown();
    known.delete(kanaIds.at(-1));
    expect(kanaLocked({ ...base, known })).toBe(true);
  });

  it("counts a removed kana as settled", () => {
    const known = allKanaKnown();
    known.delete(kanaIds[0]);
    const stats = { [kanaIds[0]]: { removed: "2026-07-10" } };
    expect(kanaLocked({ ...base, known, stats })).toBe(false);
  });

  it("introduces kana only, in chart order, hiragana first", () => {
    const d = generateDaily({ ...base, newPerDay: 5, reviewLimit: 100 });
    expect(d.queue).toHaveLength(5);
    expect(d.queue.every((id) => gradeOf.get(id) === "0")).toBe(true);
    // order within the queue is shuffled — assert the *set* is the chart head
    expect(new Set(d.queue)).toEqual(new Set(kanaIds.slice(0, 5)));
    expect(newCandidates(base).slice(0, 5).map((k) => k.kanji)).toEqual([
      "あ",
      "い",
      "う",
      "え",
      "お",
    ]);
  });

  it("moves on to katakana after hiragana is done", () => {
    const known = new Set(KANA.filter((k) => k.script === "hiragana").map((k) => k.id));
    const next = newCandidates({ ...base, known });
    expect(next.every((k) => k.script === "katakana")).toBe(true);
    expect(next[0].kanji).toBe("ア");
  });

  it("shows no kanji at all while locked — not even a due review", () => {
    const today = todayStr();
    const stats = {
      // a kanji scheduled from a previous plan, overdue
      5: { seen: "2026-07-01", fails: { [addDays(today, -1)]: 2 }, interval: 3, due: today },
    };
    const d = generateDaily({ ...base, stats, newPerDay: 0, reviewLimit: 100 });
    expect(d.queue).toHaveLength(0);
  });

  it("still reviews due kana while locked", () => {
    const today = todayStr();
    const stats = {
      [kanaIds[0]]: { seen: "2026-07-01", fails: {}, interval: 1, due: today },
    };
    const d = generateDaily({ ...base, stats, newPerDay: 0, reviewLimit: 100 });
    expect(d.queue).toEqual([kanaIds[0]]);
  });

  it("releases kanji once the whole chart is known", () => {
    const d = generateDaily({
      ...base,
      known: allKanaKnown(),
      newPerDay: 10,
      reviewLimit: 0,
    });
    expect(d.queue).toHaveLength(10);
    expect(d.queue.every((id) => gradeOf.get(id) !== "0")).toBe(true);
    expect(d.queue.filter((id) => gradeOf.get(id) === "1").length).toBeGreaterThan(0);
  });

  it("resumes kanji reviews once unlocked", () => {
    const today = todayStr();
    const stats = { 5: { seen: "2026-07-01", fails: {}, interval: 3, due: today } };
    const d = generateDaily({
      ...base,
      known: allKanaKnown(),
      stats,
      newPerDay: 0,
      reviewLimit: 100,
    });
    expect(d.queue).toEqual([5]);
  });
});
