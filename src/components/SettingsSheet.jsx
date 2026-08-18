import { gradeLabel } from "./Flashcard.jsx";

export default function SettingsSheet({
  user,
  mode,
  newPerDay,
  reviewLimit,
  startGrade,
  typing,
  kanjiInput,
  altFonts,
  onTyping,
  onKanjiInput,
  onAltFonts,
  onMode,
  onChangePlan,
  onReset,
  onSignOut,
  isAdmin,
  onAdmin,
}) {
  return (
    <div className="sheet">
      <div className="sheet-row spread">
        <div className="segmented" role="group" aria-label="Card front">
          <button
            className={mode === "kanji" ? "active" : ""}
            onClick={() => onMode("kanji")}
          >
            漢 first
          </button>
          <button
            className={mode === "meaning" ? "active" : ""}
            onClick={() => onMode("meaning")}
          >
            EN first
          </button>
        </div>
        <button className="ghost-btn" onClick={onChangePlan}>
          {newPerDay} new · {reviewLimit} rev · from {gradeLabel(startGrade)} ›
        </button>
      </div>

      <div className="sheet-row spread">
        <span className="sheet-label">type the reading</span>
        <div className="segmented" role="group" aria-label="Typing test">
          {[
            ["off", "off"],
            ["kana", "kana"],
            ["all", "all"],
          ].map(([value, label]) => (
            <button
              key={value}
              className={typing === value ? "active" : ""}
              onClick={() => onTyping(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {typing === "all" && (
        <div className="sheet-row spread">
          <span className="sheet-label">kanji answers in</span>
          <div className="segmented" role="group" aria-label="Kanji input script">
            <button
              className={kanjiInput === "romaji" ? "active" : ""}
              onClick={() => onKanjiInput("romaji")}
            >
              rōmaji
            </button>
            <button
              className={kanjiInput === "kana" ? "active" : ""}
              onClick={() => onKanjiInput("kana")}
            >
              かな
            </button>
          </div>
        </div>
      )}

      <div className="sheet-row spread">
        <span className="sheet-label">alt fonts on the back</span>
        <div className="segmented" role="group" aria-label="Alternative fonts">
          <button
            className={altFonts ? "" : "active"}
            onClick={() => onAltFonts(false)}
          >
            off
          </button>
          <button
            className={altFonts ? "active" : ""}
            onClick={() => onAltFonts(true)}
          >
            on
          </button>
        </div>
      </div>

      <div className="sheet-row spread">
        <span className="stat">{user}</span>
        <span className="sheet-actions">
          {isAdmin && (
            <button className="ghost-btn" onClick={onAdmin}>
              admin
            </button>
          )}
          <button className="ghost-btn" onClick={onReset}>
            reset
          </button>
          <button className="ghost-btn" onClick={onSignOut}>
            sign out
          </button>
        </span>
      </div>
    </div>
  );
}
