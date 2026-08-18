import { useEffect, useRef, useState } from "react";
import { EXAMPLES } from "../examples.js";

// short label for a level, used on the card back and in the plan summary
export function gradeLabel(g) {
  if (g === "0") return "kana";
  return g === "S" ? "secondary" : `grade ${g}`;
}

// The three typefaces a learner actually meets: 明朝 (serif, print), ゴシック
// (sans, screens/signage) and 丸ゴシック (rounded, packaging). Worth showing
// because the shapes genuinely differ — さ and き break their strokes in some
// faces and join them in others. These are system stacks, not bundled fonts
// (the app ships as one self-contained file), so a device that lacks a face
// falls back to another — still no worse than the single face it had before.
const FACES = [
  ["serif", "var(--serif)", "明朝"],
  ["sans", "var(--sans)", "ゴシック"],
  ["rounded", "var(--round)", "丸ゴシック"],
];

// A kana card earns a layout of its own: the pair side by side with the
// rōmaji, the glyph across typefaces, then a word it shows up in.
export function KanaBack({ card }) {
  const hira = card.script === "hiragana" ? card.kanji : card.pair;
  const kata = card.script === "katakana" ? card.kanji : card.pair;
  return (
    <>
      <div className="kana-pair">
        <div className="kana-cell">
          <span className="kana-glyph" lang="ja">
            {hira}
          </span>
          <span className="kana-script">hiragana</span>
        </div>
        <div className="kana-cell">
          <span className="kana-glyph" lang="ja">
            {kata}
          </span>
          <span className="kana-script">katakana</span>
        </div>
        <div className="kana-romaji">{card.romaji}</div>
      </div>

      <div className="kana-faces">
        {FACES.map(([name, stack, label]) => (
          <div className="face-cell" key={name}>
            <span className="face-glyph" style={{ fontFamily: stack }} lang="ja">
              {card.kanji}
            </span>
            <span className="face-label" lang="ja">
              {label}
            </span>
          </div>
        ))}
      </div>

      {card.examples?.length > 0 && (
        <ul className="examples">
          {card.examples.map(([w, r, g]) => (
            <li key={w}>
              <span className="ex-word" lang="ja">
                {w}
              </span>
              <span className="ex-reading">{r}</span>
              <span className="ex-gloss">{g}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
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
  typing = false,
  typed = "",
  inputScript = "romaji",
  onTyped,
  onSubmitTyped,
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

  // the typing test: the card gives up its lower half to a text field, and
  // the answer stays hidden — the glyph above is the whole prompt
  const typePad = (
    <form
      className="type-pad"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmitTyped();
      }}
    >
      <input
        className="type-input"
        value={typed}
        onChange={(e) => onTyped(e.target.value)}
        placeholder={inputScript === "kana" ? "かな" : "rōmaji"}
        aria-label={
          inputScript === "kana"
            ? "Type the reading in kana"
            : "Type the reading in rōmaji"
        }
        autoFocus
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        lang={inputScript === "kana" ? "ja" : undefined}
      />
      <div className="type-actions">
        <button type="button" className="ghost-btn" onClick={onCross}>
          ✕ don't know
        </button>
        <button type="submit" className="primary-btn" disabled={!typed.trim()}>
          check
        </button>
      </div>
    </form>
  );

  return (
    <div className={`card-zone${typing ? " typing" : ""}`}>
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
            {!isDesktop && !typing && (
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
              {shown.kind === "kana" ? (
                <KanaBack card={shown} />
              ) : (
                <>
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
                </>
              )}

              {shown.kind !== "kana" && examples.length > 0 && (
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
      {typing && typePad}
      {isDesktop && !typing && (
        <div className="control-bar">{desktopControls}</div>
      )}
    </div>
  );
}
