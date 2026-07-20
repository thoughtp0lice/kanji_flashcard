import { useEffect, useMemo, useState } from "react";
import { KANJI } from "./data.js";
import { fetchState, pushState } from "./api.js";
import Flashcard from "./components/Flashcard.jsx";
import SettingsSheet from "./components/SettingsSheet.jsx";
import Setup from "./components/Setup.jsx";
import DeckView from "./components/DeckView.jsx";
import PracticeView from "./components/PracticeView.jsx";
import {
  GRADE_ORDER,
  generateDaily,
  onFail,
  onSuccess,
  todayStr,
  totalFails,
} from "./lesson.js";

export const BY_ID = new Map(KANJI.map((k) => [k.id, k]));

// union server + local stats: max fail count per date, earliest seen date,
// and whichever side has SRS scheduling info (prefer the later due date —
// it reflects the most recent answer)
function mergeStats(local, server) {
  const out = { ...server };
  for (const [id, ls] of Object.entries(local)) {
    const sv = out[id];
    if (!sv) {
      out[id] = ls;
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

export default function Study({ user, token, onSignOut }) {
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
  const [known, setKnown] = useState(() => new Set(loadJSON(knownKey, [])));
  const [stats, setStats] = useState(() => loadJSON(statsKey, {}));
  const [day, setDay] = useState(() => {
    const d = loadJSON(dayKey, null);
    return d?.date === todayStr() ? d : null;
  });
  const [ready, setReady] = useState(false);
  const [view, setView] = useState("lesson"); // 'lesson' | 'deck' | 'practice'
  const [infinite, setInfinite] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

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
    const prefs = { mode, startGrade, newPerDay, reviewLimit };
    localStorage.setItem(prefsKey, JSON.stringify(prefs));
    if (ready) pushState(token, { prefs });
  }, [mode, startGrade, newPerDay, reviewLimit, ready]);

  const needsSetup = ready && (!startGrade || !newPerDay || !reviewLimit);

  // build today's deck once setup is done and sync has settled
  useEffect(() => {
    if (!ready || needsSetup || day) return;
    saveDay(
      generateDaily({ all: KANJI, newPerDay, reviewLimit, startGrade, stats, known })
    );
  }, [ready, needsSetup, day, newPerDay, reviewLimit, startGrade]);

  // infinite mode: when the queue empties, refill with any reviews that were
  // capped out earlier, then another round of new cards — until nothing's left
  useEffect(() => {
    if (!infinite || !ready || !day || day.queue.length > 0) return;
    const extra = generateDaily({
      all: KANJI,
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
  const hasMore = useMemo(() => {
    const today = todayStr();
    const span = new Set(GRADE_ORDER.slice(GRADE_ORDER.indexOf(startGrade)));
    return (
      KANJI.some((k) => span.has(k.grade) && !stats[k.id] && !known.has(k.id)) ||
      Object.values(stats).some((st) => st.due && st.due <= today)
    );
  }, [stats, known, startGrade]);

  // ✓ — knew it: SRS interval grows (or the card graduates), done for today
  const check = () => {
    if (!card) return;
    const t = todayStr();
    const st = stats[card.id] ?? { seen: t, fails: {} };
    saveStats({ ...stats, [card.id]: onSuccess(st, t) });
    saveKnown(new Set(known).add(card.id));
    saveDay({
      ...day,
      queue: day.queue.slice(1),
      done: [...day.done, card.id],
    });
    setFlipped(false);
  };

  // ✗ — failed: interval shrinks, due again tomorrow; flip to study and the
  // card retries later today
  const cross = () => {
    if (!card) return;
    const t = todayStr();
    const st = stats[card.id] ?? { seen: t, fails: {} };
    saveStats({ ...stats, [card.id]: onFail(st, t) });
    if (known.has(card.id)) {
      const next = new Set(known);
      next.delete(card.id);
      saveKnown(next);
    }
    setFlipped(true);
  };

  // move the current card to the end of today's queue
  const skip = () => {
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
          setView("lesson");
        }
        return;
      }
      switch (e.key) {
        case " ":
          e.preventDefault();
          setFlipped((f) => !f);
          break;
        case "ArrowRight":
          skip();
          break;
        case "1":
          cross();
          break;
        case "2":
          check();
          break;
        case "Escape":
          setMenuOpen(false);
          setView("lesson");
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
        kanji={KANJI}
        startGrade={startGrade}
        newPerDay={newPerDay}
        reviewLimit={reviewLimit}
        firstTime={needsSetup}
        onSave={(g, n, r) => {
          setStartGrade(g);
          setNewPerDay(n);
          setReviewLimit(r);
          setShowSetup(false);
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
          {view === "deck"
            ? `${Object.keys(stats).length} seen`
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
            onClick={() => setView((v) => (v === "deck" ? "lesson" : "deck"))}
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
          onSignOut={onSignOut}
        />
      )}

      {view === "deck" ? (
        <DeckView stats={stats} known={known} onPractice={() => setView("practice")} />
      ) : view === "practice" ? (
        <PracticeView stats={stats} mode={mode} />
      ) : (
        <main className="stage">
          {card ? (
            <Flashcard
              card={card}
              mode={mode}
              flipped={flipped}
              onFlip={() => setFlipped((f) => !f)}
              onCheck={check}
              onCross={cross}
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
