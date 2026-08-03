import { useMemo, useState } from "react";
import { BY_ID } from "../Study.jsx";
import { EXAMPLES } from "../examples.js";
import { isRemoved, totalFails } from "../lesson.js";

function gradeLabel(g) {
  return g === "S" ? "secondary" : `grade ${g}`;
}

export default function DeckView({ stats, known, onPractice, onRemove }) {
  const hasFailed = useMemo(
    () => Object.values(stats).some((st) => totalFails(st) > 0),
    [stats]
  );
  const [failedOnly, setFailedOnly] = useState(false);
  const [sort, setSort] = useState("failed"); // 'failed' | 'recent'
  const [openId, setOpenId] = useState(null);

  const entries = useMemo(() => {
    const list = Object.entries(stats)
      .filter(([, st]) => !isRemoved(st))
      .map(([id, st]) => ({
        id: Number(id),
        k: BY_ID.get(Number(id)),
        fails: totalFails(st),
        seen: st.seen || "",
      }))
      .filter((e) => e.k);
    list.sort((a, b) =>
      sort === "failed"
        ? b.fails - a.fails || b.seen.localeCompare(a.seen)
        : b.seen.localeCompare(a.seen) || b.fails - a.fails
    );
    return failedOnly ? list.filter((e) => e.fails > 0) : list;
  }, [stats, failedOnly, sort]);

  const open = openId != null ? BY_ID.get(openId) : null;
  const openExamples = open ? EXAMPLES[open.kanji] || [] : [];

  return (
    <main className="deck">
      <div className="deck-controls">
        <div className="segmented" role="group" aria-label="Sort">
          <button
            className={sort === "failed" ? "active" : ""}
            onClick={() => setSort("failed")}
          >
            most failed
          </button>
          <button
            className={sort === "recent" ? "active" : ""}
            onClick={() => setSort("recent")}
          >
            recent
          </button>
        </div>
        <label className="toggle">
          <input
            type="checkbox"
            checked={failedOnly}
            onChange={(e) => setFailedOnly(e.target.checked)}
          />
          <span>failed only</span>
        </label>
        {hasFailed && (
          <button className="ghost-btn" onClick={onPractice}>
            practice ▶
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="empty-msg">
          {failedOnly ? "no failed kanji — nice" : "nothing seen yet"}
        </p>
      ) : (
        <div className="deck-grid">
          {entries.map((e) => (
            <button
              key={e.id}
              className={`tile${known.has(e.id) ? " tile-known" : ""}`}
              onClick={() => setOpenId(e.id)}
            >
              <span className="tile-kanji" lang="ja">
                {e.k.kanji}
              </span>
              {e.fails > 0 && <span className="tile-fails">×{e.fails}</span>}
            </button>
          ))}
        </div>
      )}

      {open && (
        <div className="modal-backdrop" onClick={() => setOpenId(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="back-head">
              <span className="back-kanji" lang="ja">
                {open.kanji}
              </span>
              <div className="back-id">
                <div className="back-meaning">{open.meaning}</div>
                <div className="kana" lang="ja">
                  {open.kana}
                </div>
                <div className="romaji">{open.romaji}</div>
              </div>
            </div>
            <div className="back-meta">
              {gradeLabel(open.grade)} · {open.strokes} strokes · radical{" "}
              <span lang="ja">{open.radical}</span>
              {" · "}
              {totalFails(stats[open.id])
                ? `failed ×${totalFails(stats[open.id])}`
                : known.has(open.id)
                  ? "known ✓"
                  : "seen"}
            </div>
            {onRemove && (
              <button
                className="ghost-btn remove-btn"
                onClick={() => {
                  if (
                    confirm(
                      `Remove ${open.kanji} from your deck? It won't come up for review again unless you re-learn it.`
                    )
                  ) {
                    onRemove(open.id);
                    setOpenId(null);
                  }
                }}
              >
                remove from deck
              </button>
            )}
            {openExamples.length > 0 && (
              <ul className="examples">
                {openExamples.map(([w, r, g]) => (
                  <li key={w}>
                    <span className="ex-word" lang="ja">
                      {w}
                    </span>
                    <span className="ex-reading" lang="ja">
                      {r}
                    </span>
                    <span className="ex-gloss">{g}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
