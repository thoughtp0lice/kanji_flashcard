import { useEffect, useMemo, useRef, useState } from "react";
import { KANJI } from "./data.js";
import { KANA } from "./kana.js";
import { fetchState, pushState } from "./api.js";
import Flashcard from "./components/Flashcard.jsx";
import SettingsSheet from "./components/SettingsSheet.jsx";
import Setup from "./components/Setup.jsx";
import DeckView from "./components/DeckView.jsx";
import PracticeView from "./components/PracticeView.jsx";
import AdminView from "./components/AdminView.jsx";
import {
  KANA_GRADE,
  generateDaily,
  isRemoved,
  kanaLocked,
  newCandidates,
  onFail,
  onSuccess,
  todayStr,
  totalFails,
} from "./lesson.js";
import { checkReading, inputScriptFor, typingApplies } from "./reading.js";

// every studiable card: level 0 (kana) first, then the jōyō kanji. Ids are
// disjoint across the two datasets, so one `stats` map covers both.
export const ALL_CARDS = [...KANA, ...KANJI];

// how long a correct answer's green stays up before the next card
const VERDICT_MS = 650;

export const BY_ID = new Map(ALL_CARDS.map((k) => [k.id, k]));

// client-side routing: each view owns a URL so back/forward and deep links
// work; both server entries fall back to index.html for these paths
const VIEW_PATHS = {
  lesson: "/",
  deck: "/deck",
  practice: "/practice",
  admin: "/admin",
};

function viewFromPath(path) {
  const match = Object.entries(VIEW_PATHS).find(([, p]) => p === path);
  return match ? match[0] : "lesson";
}

// latest date the user demonstrably touched a card: its seen date or any
// fail date (successes only move `due`, which is not an activity date)
function lastActivity(st) {
  return (
    [st.seen, ...Object.keys(st.fails || {})].filter(Boolean).sort().at(-1) ||
    ""
  );
}

// union server + local stats: max fail count per date, earliest seen date,
// and whichever side has SRS scheduling info (prefer the later due date —
// it reflects the most recent answer). A removal tombstone beats live state
// unless the card shows activity *after* the removal date (it was
// re-learned later); on a same-day tie the removal wins — it's the
// deliberate act. Exported for test/ui.test.jsx.
export function mergeStats(local, server) {
  const out = { ...server };
  for (const [id, ls] of Object.entries(local)) {
    const sv = out[id];
    if (!sv) {
      out[id] = ls;
      continue;
    }
    if (isRemoved(ls) || isRemoved(sv)) {
      if (isRemoved(ls) && isRemoved(sv)) {
        out[id] = { removed: [ls.removed, sv.removed].sort().at(-1) };
      } else {
        const tomb = isRemoved(ls) ? ls : sv;
        const live = isRemoved(ls) ? sv : ls;
        out[id] = lastActivity(live) > tomb.removed ? live : tomb;
      }
      continue;
    }
    const fails = { ...sv.fails };
    for (const [d, n] of Object.entries(ls.fails || {})) {
      fails[d] = Math.max(fails[d] || 0, n);
    }
    const seen = [ls.seen, sv.seen].filter(Boolean).sort()[0];
    const later = (ls.due || "") >= (sv.due || "") ? ls : sv;
    out[id] = { seen, fails, interval: later.interval, due: later.due };
  }
  return out;
}

export default function Study({ user, token, isAdmin, onSignOut }) {
  const knownKey = `joyo-kanji-known:${user}`;
  const prefsKey = `joyo-kanji-prefs:${user}`;
  const statsKey = `joyo-kanji-stats:${user}`;
  const dayKey = `joyo-kanji-day:${user}`;

  const loadJSON = (key, fallback) => {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  };

  const initialPrefs = loadJSON(prefsKey, {});
  const [mode, setMode] = useState(initialPrefs.mode ?? "kanji");
  const [startGrade, setStartGrade] = useState(initialPrefs.startGrade ?? null);
  // dailyGoal predates the new/review split — carry it over as the new-card count
  const [newPerDay, setNewPerDay] = useState(
    initialPrefs.newPerDay ?? initialPrefs.dailyGoal ?? null
  );
  const [reviewLimit, setReviewLimit] = useState(initialPrefs.reviewLimit ?? null);
  // typing test: "off" | "kana" (level-0 cards only) | "all"
  const [typing, setTyping] = useState(initialPrefs.typing ?? "kana");
  // what you type for a *kanji*: "romaji" | "kana" (kana cards are always romaji)
  const [kanjiInput, setKanjiInput] = useState(initialPrefs.kanjiInput ?? "romaji");
  const [known, setKnown] = useState(() => new Set(loadJSON(knownKey, [])));
  const [stats, setStats] = useState(() => loadJSON(statsKey, {}));
  const [day, setDay] = useState(() => {
    const d = loadJSON(dayKey, null);
    return d?.date === todayStr() ? d : null;
  });
  const [ready, setReady] = useState(false);
  // 'lesson' | 'deck' | 'practice' | 'admin' — seeded from the URL
  const [view, setView] = useState(() => viewFromPath(window.location.pathname));
  const [infinite, setInfinite] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [flipped, setFlipped] = useState(false);
  // what the answer side is offering:
  // 'check' after ✓ — confirm ("✓ next") or demote ("✕ actually no")
  // 'peek' after a manual flip — "✓ knew it" or "✕ didn't know"
  // null — fail already recorded (cross/demote), just "next →"
  const [pending, setPending] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  // what the user has typed into the reading test (pending === "type")
  const [typed, setTyped] = useState("");
  // "right" | "wrong" — colors the card straight after an answer is graded
  const [verdict, setVerdict] = useState(null);
  // the pending "hold the green, then advance" timer, cleared on unmount so a
  // sign-out mid-hold cannot write the next card's state
  const verdictTimer = useRef(null);
  useEffect(() => () => clearTimeout(verdictTimer.current), []);

  // switch views, keeping the URL in sync
  const navigate = (next) => {
    const path = VIEW_PATHS[next] ?? "/";
    if (window.location.pathname !== path) {
      window.history.pushState(null, "", path);
    }
    setView(next);
  };

  // browser back/forward
  useEffect(() => {
    const onPop = () => setView(viewFromPath(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // a non-admin deep-linking to /admin lands on the lesson instead
  useEffect(() => {
    if (view === "admin" && !isAdmin) {
      window.history.replaceState(null, "", "/");
      setView("lesson");
    }
  }, [view, isAdmin]);

  const saveKnown = (next) => {
    setKnown(next);
    localStorage.setItem(knownKey, JSON.stringify([...next]));
    pushState(token, { known: [...next] });
  };

  const saveStats = (next) => {
    setStats(next);
    localStorage.setItem(statsKey, JSON.stringify(next));
    pushState(token, { stats: next });
  };

  const saveDay = (d) => {
    setDay(d);
    localStorage.setItem(dayKey, JSON.stringify(d));
    pushState(token, { days: { [d.date]: d } });
  };

  // adopt the server's state on load, merging so offline progress on any
  // device is never lost
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const server = await fetchState(token, onSignOut);
      if (cancelled) return;
      if (server) {
        setKnown((local) => {
          const union = new Set([...local, ...(server.known || [])]);
          localStorage.setItem(knownKey, JSON.stringify([...union]));
          if (union.size !== (server.known || []).length)
            pushState(token, { known: [...union] });
          return union;
        });
        setStats((local) => {
          const merged = mergeStats(local, server.stats || {});
          localStorage.setItem(statsKey, JSON.stringify(merged));
          return merged;
        });
        const p = server.prefs || {};
        if (p.mode) setMode(p.mode);
        if (p.startGrade) setStartGrade(p.startGrade);
        if (p.newPerDay ?? p.dailyGoal) setNewPerDay(p.newPerDay ?? p.dailyGoal);
        if (p.reviewLimit) setReviewLimit(p.reviewLimit);
        if (p.typing) setTyping(p.typing);
        if (p.kanjiInput) setKanjiInput(p.kanjiInput);
        const serverToday = server.days?.[todayStr()];
        if (serverToday) {
          setDay(serverToday);
          localStorage.setItem(dayKey, JSON.stringify(serverToday));
        }
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // persist prefs locally + to the server (skip until initial sync settles)
  useEffect(() => {
    const prefs = { mode, startGrade, newPerDay, reviewLimit, typing, kanjiInput };
    localStorage.setItem(prefsKey, JSON.stringify(prefs));
    if (ready) pushState(token, { prefs });
  }, [mode, startGrade, newPerDay, reviewLimit, typing, kanjiInput, ready]);

  const needsSetup = ready && (!startGrade || !newPerDay || !reviewLimit);

  // build today's deck once setup is done and sync has settled
  useEffect(() => {
    if (!ready || needsSetup || day) return;
    saveDay(
      generateDaily({
        all: ALL_CARDS,
        newPerDay,
        reviewLimit,
        startGrade,
        stats,
        known,
      })
    );
  }, [ready, needsSetup, day, newPerDay, reviewLimit, startGrade]);

  // infinite mode: when the queue empties, refill with any reviews that were
  // capped out earlier, then another round of new cards — until nothing's left
  useEffect(() => {
    if (!infinite || !ready || !day || day.queue.length > 0) return;
    const extra = generateDaily({
      all: ALL_CARDS,
      newPerDay,
      reviewLimit: Infinity,
      startGrade,
      stats,
      known,
    });
    if (extra.queue.length === 0) {
      setInfinite(false);
      return;
    }
    saveDay({ ...day, queue: extra.queue });
  }, [infinite, ready, day, newPerDay, startGrade, stats, known]);

  // roll over at midnight (checked once a minute)
  useEffect(() => {
    const t = setInterval(() => {
      setDay((d) => (d && d.date !== todayStr() ? null : d));
    }, 60_000);
    return () => clearInterval(t);
  }, []);

  const card = day?.queue.length ? BY_ID.get(day.queue[0]) : null;
  const doneCount = day?.done.length ?? 0;
  const totalToday = doneCount + (day?.queue.length ?? 0);

  const failedCount = useMemo(
    () => Object.values(stats).filter((st) => totalFails(st) > 0).length,
    [stats]
  );
  const seenCount = useMemo(
    () => Object.values(stats).filter((st) => !isRemoved(st)).length,
    [stats]
  );
  // is there anything left for infinite mode to pull in? Mirrors what
  // generateDaily would offer, including the level-0 kana gate.
  const hasMore = useMemo(() => {
    const today = todayStr();
    if (newCandidates({ all: ALL_CARDS, startGrade, stats, known }).length)
      return true;
    const locked = kanaLocked({ all: ALL_CARDS, startGrade, stats, known });
    return Object.entries(stats).some(
      ([id, st]) =>
        !isRemoved(st) &&
        st.due &&
        st.due <= today &&
        (!locked || BY_ID.get(Number(id))?.grade === KANA_GRADE)
    );
  }, [stats, known, startGrade]);

  // answering a card whose stat is a removal tombstone starts over from a
  // blank slate — the tombstone must not leak into the new SRS state
  const freshOrExisting = (id, t) =>
    !stats[id] || isRemoved(stats[id]) ? { seen: t, fails: {} } : stats[id];

  // un-enroll a card: replace its stats with a dated tombstone (a plain
  // delete would be resurrected from another device's copy on the next
  // merge), forget it as known, and drop it from today's queue
  const removeCard = (id) => {
    saveStats({ ...stats, [id]: { removed: todayStr() } });
    if (known.has(id)) {
      const next = new Set(known);
      next.delete(id);
      saveKnown(next);
    }
    if (day?.queue.includes(id)) {
      saveDay({ ...day, queue: day.queue.filter((q) => q !== id) });
    }
  };

  // ✓ — "I think I know it". With the typing test on for this card that
  // claim has to be backed up: the card shrinks and an input appears, and
  // the typed reading grades itself (no self-assessment). Otherwise the
  // answer is shown and the user confirms or demotes.
  const check = () => {
    if (!card) return;
    if (typingApplies(card, typing)) {
      setTyped("");
      setVerdict(null);
      setPending("type");
      return; // stay on the front — the glyph is the prompt
    }
    setPending("check");
    setFlipped(true);
  };

  // strict auto-grading: a correct reading counts as ✓ and moves straight on;
  // a wrong one records the miss and flips to the answer to study
  const submitTyped = () => {
    if (!card || pending !== "type") return;
    const correct = checkReading(card, typed, inputScriptFor(card, kanjiInput));
    setTyped("");
    // color the card before acting on it — jumping straight to the next card
    // gives no signal that the answer was even read
    setVerdict(correct ? "right" : "wrong");
    setPending(null);
    if (correct) {
      // hold the green, then move on
      verdictTimer.current = setTimeout(confirmCheck, VERDICT_MS);
      return;
    }
    recordFail();
    setFlipped(true); // red stays up with the answer, to study
  };

  // confirmed after seeing the answer: SRS interval grows, done for today
  const confirmCheck = () => {
    if (!card) return;
    const t = todayStr();
    const st = freshOrExisting(card.id, t);
    saveStats({ ...stats, [card.id]: onSuccess(st, t) });
    saveKnown(new Set(known).add(card.id));
    saveDay({
      ...day,
      queue: day.queue.slice(1),
      done: [...day.done, card.id],
    });
    setPending(null);
    setVerdict(null);
    setFlipped(false);
  };

  const recordFail = () => {
    const t = todayStr();
    const st = freshOrExisting(card.id, t);
    saveStats({ ...stats, [card.id]: onFail(st, t) });
    if (known.has(card.id)) {
      const next = new Set(known);
      next.delete(card.id);
      saveKnown(next);
    }
  };

  // "actually I don't know" after ✓: record the fail, keep studying the
  // answer; the card retries later today
  const demote = () => {
    if (!card) return;
    recordFail();
    setPending(null);
    setTyped("");
  };

  // ✗ — failed: interval shrinks, due again tomorrow; flip to study and the
  // card retries later today
  const cross = () => {
    if (!card) return;
    recordFail();
    setPending(null);
    setTyped("");
    setVerdict(null);
    setFlipped(true);
  };

  // tap/space flip: peeking at the answer still offers know / don't know
  const flip = () => {
    if (!card) return;
    // during the typing test the answer stays hidden — peeking would hand
    // the user the very thing they are being asked to produce
    if (pending === "type") return;
    if (flipped) {
      setFlipped(false);
      if (pending === "peek") setPending(null);
    } else {
      setFlipped(true);
      if (!pending) setPending("peek");
    }
  };

  // move the current card to the end of today's queue
  const skip = () => {
    setPending(null);
    setTyped("");
    setVerdict(null);
    if (!card || day.queue.length < 2) {
      setFlipped(false);
      return;
    }
    saveDay({ ...day, queue: [...day.queue.slice(1), day.queue[0]] });
    setFlipped(false);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (["SELECT", "INPUT", "BUTTON"].includes(e.target.tagName)) return;
      if (view !== "lesson") {
        // deck/practice views handle their own keys; Escape returns to the lesson
        if (e.key === "Escape") {
          setMenuOpen(false);
          navigate("lesson");
        }
        return;
      }
      // while the typing test is up the input owns the keyboard (the guard
      // above already lets INPUT through); only escape still applies
      if (pending === "type" && e.key !== "Escape") return;
      switch (e.key) {
        case " ":
          e.preventDefault();
          flip();
          break;
        case "ArrowRight":
          skip();
          break;
        case "1":
          if (pending === "check") demote();
          else cross();
          break;
        case "2":
          if (pending === "check" || pending === "peek") confirmCheck();
          else check();
          break;
        case "Escape":
          setMenuOpen(false);
          navigate("lesson");
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!ready) {
    return (
      <div className="splash">
        <span className="login-glyph" lang="ja">
          漢
        </span>
      </div>
    );
  }

  if (needsSetup || showSetup) {
    return (
      <Setup
        cards={ALL_CARDS}
        startGrade={startGrade}
        newPerDay={newPerDay}
        reviewLimit={reviewLimit}
        firstTime={needsSetup}
        onSave={(g, n, r) => {
          setStartGrade(g);
          setNewPerDay(n);
          setReviewLimit(r);
          setShowSetup(false);
          // today's deck was built under the old plan — rebuild it now,
          // keeping what's already done and any fails still owed a
          // same-day retry
          const today = todayStr();
          const fresh = generateDaily({
            all: ALL_CARDS,
            newPerDay: n,
            reviewLimit: r,
            startGrade: g,
            stats,
            known,
          });
          // ...but only cards the new plan still allows: switching *to* level
          // 0 must not drag a kanji you missed earlier today into the
          // kana-only deck (`INV-SCHED-7`)
          const locked = kanaLocked({
            all: ALL_CARDS,
            startGrade: g,
            stats,
            known,
          });
          const retries = (day?.queue ?? []).filter(
            (id) =>
              stats[id]?.fails?.[today] &&
              (!locked || BY_ID.get(id)?.grade === KANA_GRADE)
          );
          saveDay({
            ...fresh,
            queue: [...new Set([...retries, ...fresh.queue])],
            done: day?.done ?? [],
          });
        }}
        onCancel={needsSetup ? null : () => setShowSetup(false)}
      />
    );
  }

  const progress = totalToday ? (doneCount / totalToday) * 100 : 0;

  return (
    <div className="app">
      <div className="progress-hairline">
        <div style={{ width: `${progress}%` }} />
      </div>

      <div className="topbar">
        <span className="counter">
          {view === "admin"
            ? "admin"
            : view === "deck"
              ? `${seenCount} seen`
              : view === "practice"
                ? `${failedCount} failed`
                : card
                ? `${doneCount + 1} / ${totalToday} today`
                : `${doneCount} / ${totalToday} today`}
          {infinite && view === "lesson" && (
            <button className="ghost-btn stop-btn" onClick={() => setInfinite(false)}>
              stop ∞
            </button>
          )}
        </span>
        <span className="topbar-actions">
          <button
            className={`menu-btn${view === "deck" ? " open" : ""}`}
            onClick={() => navigate(view === "deck" ? "lesson" : "deck")}
            aria-label="Seen kanji"
            title="Seen kanji"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <rect x="4" y="4" width="7" height="7" rx="1.5" />
              <rect x="13" y="4" width="7" height="7" rx="1.5" />
              <rect x="4" y="13" width="7" height="7" rx="1.5" />
              <rect x="13" y="13" width="7" height="7" rx="1.5" />
            </svg>
          </button>
          <button
            className={`menu-btn${menuOpen ? " open" : ""}`}
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Settings"
            aria-expanded={menuOpen}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="4" y1="7" x2="20" y2="7" />
              <circle cx="9" cy="7" r="2.2" fill="var(--bg)" />
              <line x1="4" y1="17" x2="20" y2="17" />
              <circle cx="15" cy="17" r="2.2" fill="var(--bg)" />
            </svg>
          </button>
        </span>
      </div>

      {menuOpen && (
        <SettingsSheet
          user={user}
          mode={mode}
          newPerDay={newPerDay}
          reviewLimit={reviewLimit}
          startGrade={startGrade}
          typing={typing}
          kanjiInput={kanjiInput}
          onTyping={setTyping}
          onKanjiInput={setKanjiInput}
          onMode={setMode}
          onChangePlan={() => {
            setMenuOpen(false);
            setShowSetup(true);
          }}
          onReset={() => {
            if (confirm("Clear all progress (known kanji, fail history, today's deck)?")) {
              saveKnown(new Set());
              saveStats({});
              localStorage.removeItem(dayKey);
              setDay(null);
            }
          }}
          isAdmin={isAdmin}
          onAdmin={() => {
            setMenuOpen(false);
            navigate("admin");
          }}
          onSignOut={onSignOut}
        />
      )}

      {view === "admin" ? (
        <AdminView token={token} onHome={() => navigate("lesson")} />
      ) : view === "deck" ? (
        <DeckView
          stats={stats}
          known={known}
          onPractice={() => navigate("practice")}
          onRemove={removeCard}
        />
      ) : view === "practice" ? (
        <PracticeView stats={stats} mode={mode} />
      ) : (
        <main className="stage">
          {card ? (
            <Flashcard
              card={card}
              mode={mode}
              flipped={flipped}
              pendingCheck={pending === "check"}
              pendingPeek={pending === "peek"}
              typing={pending === "type"}
              verdict={verdict}
              typed={typed}
              inputScript={inputScriptFor(card, kanjiInput)}
              onTyped={setTyped}
              onSubmitTyped={submitTyped}
              onFlip={flip}
              onCheck={check}
              onCross={cross}
              onConfirm={confirmCheck}
              onDemote={demote}
              onNext={skip}
            />
          ) : (
            <div className="empty-msg">
              <p className="done-big">done for today 🎉</p>
              <p>{doneCount} kanji today</p>
              {hasMore ? (
                <button className="primary-btn" onClick={() => setInfinite(true)}>
                  keep going ∞
                </button>
              ) : (
                <p>nothing left to learn or review</p>
              )}
            </div>
          )}
        </main>
      )}
    </div>
  );
}
