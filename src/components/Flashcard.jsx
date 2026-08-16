import { useEffect, useRef, useState } from "react";
import { EXAMPLES } from "../examples.js";

// short label for a level, used on the card back and in the plan summary
export function gradeLabel(g) {
  if (g === "0") return "kana";
  return g === "S" ? "secondary" : `grade ${g}`;
}

// the head block beside a card's glyph: what the card *is*. A kana's reading
// is its own glyph and its script is already in the meta line below, so it
// shows the rōmaji alone; a kanji shows gloss + readings + rōmaji.
export function CardIdentity({ card }) {
  if (card.kind === "kana")
    return <div className="back-meaning">{card.romaji}</div>;
  return (
    <>
      <div className="back-meaning">{card.meaning}</div>
      <div className="kana" lang="ja">
        {card.kana}
      </div>
      <div className="romaji">{card.romaji}</div>
    </>
  );
}

// the identity line under a card's head. A kana card has no strokes/radical —
// what matters is which syllabary it belongs to and how the same sound is
// written in the other one.
export function CardMeta({ card }) {
  if (card.kind === "kana") {
    return (
      <>
        {card.script} · {card.script === "hiragana" ? "katakana" : "hiragana"}{" "}
        <span lang="ja">{card.pair}</span>
      </>
    );
  }
  return (
    <>
      {gradeLabel(card.grade)} · {card.strokes} strokes · radical{" "}
      <span lang="ja">{card.radical}</span>
      {card.old && (
        <>
          {" "}
          · old form <span lang="ja">{card.old}</span>
        </>
      )}
    </>
  );
}

const DESKTOP_QUERY = "(min-width: 900px)";

// On wide screens the action buttons leave the card for a larger control bar
// beneath it. jsdom has no layout, so in tests this is always false and the
// UI suite exercises the mobile DOM.
function useIsDesktop() {
  const matches = () =>
    typeof window.matchMedia === "function" &&
    window.matchMedia(DESKTOP_QUERY).matches;
  const [isDesktop, setIsDesktop] = useState(matches);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => setIsDesktop(mql.matches);
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, []);
  return isDesktop;
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
  pendingPeek = false,
}) {
  // The displayed card lags behind `card` when navigating away from a flipped
  // card, so the flip-back animation finishes before the answer swaps out.
  const [shown, setShown] = useState(card);
  const wasFlipped = useRef(flipped);
  const isDesktop = useIsDesktop();

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
  const showChoice = pendingCheck && card === shown;
  const showPeek = pendingPeek && card === shown;

  const stop = (fn) => (e) => {
    e.stopPropagation();
    fn();
  };

  // Each button exists once; mobile renders them inside the card faces,
  // desktop moves them out to the control bar below the card.
  const prevBtn = (
    <button
      className="round-btn"
      onClick={stop(onPrev)}
      title="Previous (←)"
      aria-label="Previous"
    >
      ←
    </button>
  );
  const nextArrowBtn = (
    <button
      className="round-btn"
      onClick={stop(onNext)}
      title="Next (→)"
      aria-label="Next"
    >
      →
    </button>
  );
  const crossBtn = (
    <button
      className="round-btn cross"
      onClick={stop(onCross)}
      title="Don't know — show me (1)"
      aria-label="Don't know"
    >
      ✕
    </button>
  );
  const checkBtn = (
    <button
      className="round-btn check"
      onClick={stop(onCheck)}
      title="I know this (2)"
      aria-label="I know this"
    >
      ✓
    </button>
  );
  const demoteBtn = (
    <button
      className="next-btn demote-btn"
      onClick={stop(onDemote)}
      title="I was wrong (1)"
    >
      ✕ actually no
    </button>
  );
  const confirmBtn = (
    <button
      className="next-btn confirm-btn"
      onClick={stop(onConfirm)}
      title="Knew it — next (2)"
    >
      ✓ next
    </button>
  );
  const nextPillBtn = (
    <button className="next-btn" onClick={stop(onNext)} title="Next card (→)">
      next →
    </button>
  );
  // peek (manual flip): grading is still open — nothing recorded yet, so
  // "didn't know" is a plain cross and "knew it" a plain confirm
  const peekNoBtn = (
    <button
      className="next-btn demote-btn"
      onClick={stop(onCross)}
      title="Didn't know (1)"
    >
      ✕ didn't know
    </button>
  );
  const peekYesBtn = (
    <button
      className="next-btn confirm-btn"
      onClick={stop(onConfirm)}
      title="Knew it — next (2)"
    >
      ✓ knew it
    </button>
  );

  const desktopControls = practice ? (
    <>
      {prevBtn}
      {nextArrowBtn}
    </>
  ) : !flipped ? (
    <>
      {crossBtn}
      {checkBtn}
    </>
  ) : showChoice ? (
    <>
      {demoteBtn}
      {confirmBtn}
    </>
  ) : showPeek ? (
    <>
      {peekNoBtn}
      {peekYesBtn}
    </>
  ) : (
    nextPillBtn
  );

  return (
    <div className="card-zone">
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
            {!isDesktop && (
              <div className="front-actions">
                {practice ? (
                  <>
                    {prevBtn}
                    {nextArrowBtn}
                  </>
                ) : (
                  <>
                    {crossBtn}
                    {checkBtn}
                  </>
                )}
              </div>
            )}
          </div>

          <div className="card-face card-back">
            <div className="back-scroll">
              <div className="back-head">
                <span className="back-kanji" lang="ja">
                  {shown.kanji}
                </span>
                <div className="back-id">
                  <CardIdentity card={shown} />
                </div>
              </div>

              <div className="back-meta">
                <CardMeta card={shown} />
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

            {!isDesktop && (
              <div className="back-actions">
                {showChoice ? (
                  <>
                    {demoteBtn}
                    {confirmBtn}
                  </>
                ) : showPeek ? (
                  <>
                    {peekNoBtn}
                    {peekYesBtn}
                  </>
                ) : (
                  nextPillBtn
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      {isDesktop && <div className="control-bar">{desktopControls}</div>}
    </div>
  );
}
