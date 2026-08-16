import { useMemo, useState } from "react";
import { GRADE_ORDER, KANA_GRADE } from "../lesson.js";

const GRADE_LABELS = {
  0: "Level 0 — kana",
  1: "Grade 1",
  2: "Grade 2",
  3: "Grade 3",
  4: "Grade 4",
  5: "Grade 5",
  6: "Grade 6",
  S: "Secondary",
};

const NEW_CHOICES = [5, 10, 15, 20];
const REVIEW_CHOICES = [30, 50, 100, 200];

function NumberRow({ choices, value, onChange, label }) {
  return (
    <div className="goal-row" role="group" aria-label={label}>
      {choices.map((n) => (
        <button
          key={n}
          className={`pill${value === n ? " active" : ""}`}
          onClick={() => onChange(n)}
        >
          {n}
        </button>
      ))}
      <input
        className="goal-input"
        type="number"
        min="1"
        max="500"
        value={value ?? ""}
        onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)}
        aria-label={`Custom ${label}`}
      />
    </div>
  );
}

export default function Setup({
  cards,
  startGrade,
  newPerDay,
  reviewLimit,
  firstTime,
  onSave,
  onCancel,
}) {
  const [grade, setGrade] = useState(startGrade ?? "1");
  const [newN, setNewN] = useState(newPerDay ?? 10);
  const [reviewN, setReviewN] = useState(reviewLimit ?? 100);

  const grades = useMemo(
    () =>
      GRADE_ORDER.map((g) => {
        const inGrade = cards.filter((k) => k.grade === g);
        return {
          value: g,
          label: GRADE_LABELS[g],
          count: inGrade.length,
          samples: inGrade.slice(0, 5).map((k) => k.kanji),
        };
      }),
    [cards]
  );
  const kanaCount = grades.find((g) => g.value === KANA_GRADE)?.count ?? 0;
  // level 0 deals in kana, so the plan copy can't say "kanji"
  const noun = grade === KANA_GRADE ? "cards" : "kanji";

  const okNum = (n) => Number.isInteger(n) && n >= 1 && n <= 500;
  const ok = okNum(newN) && okNum(reviewN);

  return (
    <div className="setup">
      <p className="setup-title">
        {firstTime ? "where do you want to start?" : "your plan"}
      </p>

      <div className="grade-list">
        {grades.map((g) => (
          <button
            key={g.value}
            className={`grade-option${grade === g.value ? " active" : ""}`}
            onClick={() => setGrade(g.value)}
          >
            <span className="grade-option-head">
              <span className="grade-option-label">{g.label}</span>
              <span className="grade-option-count">{g.count}</span>
            </span>
            <span className="grade-option-samples" lang="ja">
              {g.samples.join(" ")}
            </span>
          </button>
        ))}
      </div>

      {grade === KANA_GRADE && (
        <p className="setup-note">
          start from zero: all {kanaCount} hiragana and katakana, hiragana
          first. No kanji appears until you know every one of them.
        </p>
      )}

      <p className="setup-title">new {noun} per day</p>
      <NumberRow choices={NEW_CHOICES} value={newN} onChange={setNewN} label={`new ${noun} per day`} />
      <p className="setup-note">
        each new {noun.replace(/s$/, "")} comes back as ~5–7 reviews over the
        following weeks — keep this modest
      </p>

      <p className="setup-title">max reviews per day</p>
      <NumberRow choices={REVIEW_CHOICES} value={reviewN} onChange={setReviewN} label="max reviews per day" />
      <p className="setup-note">
        yesterday's misses are always reviewed, even past this limit
      </p>

      {!firstTime && (
        <p className="setup-note">today's deck is rebuilt with the new plan</p>
      )}

      <div className="setup-actions">
        {onCancel && (
          <button className="ghost-btn" onClick={onCancel}>
            cancel
          </button>
        )}
        <button
          className="primary-btn"
          disabled={!ok}
          onClick={() => onSave(grade, newN, reviewN)}
        >
          {firstTime ? "start learning" : "save"}
        </button>
      </div>
    </div>
  );
}
