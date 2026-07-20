import { useEffect, useRef, useState } from "react";
import { EXAMPLES } from "../examples.js";

function gradeLabel(g) {
  return g === "S" ? "secondary" : `grade ${g}`;
}

export default function Flashcard({
  card,
  mode,
  flipped,
  onFlip,
  onCheck,
  onCross,
  onConfirm,
  onDemote,
  onNext,
  onPrev,
  practice = false,
  pendingCheck = false,
}) {
  // The displayed card lags behind `card` when navigating away from a flipped
  // card, so the flip-back animation finishes before the answer swaps out.
  const [shown, setShown] = useState(card);
  const wasFlipped = useRef(flipped);

  useEffect(() => {
    if (card === shown) return;
    if (wasFlipped.current) {
      const t = setTimeout(() => setShown(card), 230);
      return () => clearTimeout(t);
    }
    setShown(card);
  }, [card, shown]);

  useEffect(() => {
    wasFlipped.current = flipped;
  }, [flipped]);

  const examples = EXAMPLES[shown.kanji] || [];

  return (
    <div className="card-scene">
      <div
        className={`card${flipped ? " flipped" : ""}`}
        onClick={onFlip}
        role="button"
        tabIndex={0}
        aria-label="Flashcard — tap to flip"
      >
        <div className="card-face card-front">
          <div className="front-center">
            {mode === "kanji" ? (
              <div className="kanji-main" lang="ja">
                {shown.kanji}
              </div>
            ) : (
              <div className="meaning-main">{shown.meaning}</div>
            )}
          </div>
          <div className="front-actions">
            {practice ? (
              <>
                <button
                  className="round-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPrev();
                  }}
                  title="Previous (←)"
                  aria-label="Previous"
                >
                  ←
                </button>
                <button
                  className="round-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onNext();
                  }}
                  title="Next (→)"
                  aria-label="Next"
                >
                  →
                </button>
              </>
            ) : (
              <>
                <button
                  className="round-btn cross"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCross();
                  }}
                  title="Don't know — show me (1)"
                  aria-label="Don't know"
                >
                  ✕
                </button>
                <button
                  className="round-btn check"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCheck();
                  }}
                  title="I know this (2)"
                  aria-label="I know this"
                >
                  ✓
                </button>
              </>
            )}
          </div>
        </div>

        <div className="card-face card-back">
          <div className="back-scroll">
            <div className="back-head">
              <span className="back-kanji" lang="ja">
                {shown.kanji}
              </span>
              <div className="back-id">
                <div className="back-meaning">{shown.meaning}</div>
                <div className="kana" lang="ja">
                  {shown.kana}
                </div>
                <div className="romaji">{shown.romaji}</div>
              </div>
            </div>

            <div className="back-meta">
              {gradeLabel(shown.grade)} · {shown.strokes} strokes · radical{" "}
              <span lang="ja">{shown.radical}</span>
              {shown.old && (
                <>
                  {" "}
                  · old form <span lang="ja">{shown.old}</span>
                </>
              )}
            </div>

            {examples.length > 0 && (
              <ul className="examples">
                {examples.map(([w, r, g]) => (
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

          <div className="back-actions">
            {pendingCheck && card === shown ? (
              <>
                <button
                  className="next-btn demote-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDemote();
                  }}
                  title="I was wrong (1)"
                >
                  ✕ actually no
                </button>
                <button
                  className="next-btn confirm-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onConfirm();
                  }}
                  title="Knew it — next (2)"
                >
                  ✓ next
                </button>
              </>
            ) : (
              <button
                className="next-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onNext();
                }}
                title="Next card (→)"
              >
                next →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
