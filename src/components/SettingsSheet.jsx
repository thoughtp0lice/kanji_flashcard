import { gradeLabel } from "./Flashcard.jsx";

export default function SettingsSheet({
  user,
  mode,
  newPerDay,
  reviewLimit,
  startGrade,
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
