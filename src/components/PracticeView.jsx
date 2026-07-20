import { useEffect, useMemo, useState } from "react";
import { BY_ID } from "../Study.jsx";
import { totalFails } from "../lesson.js";
import Flashcard from "./Flashcard.jsx";

function shuffled(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// free flipping through failed kanji — nothing here touches the schedule
export default function PracticeView({ stats, mode }) {
  const [list] = useState(() =>
    shuffled(
      Object.entries(stats)
        .filter(([, st]) => totalFails(st) > 0)
        .map(([id]) => Number(id))
    )
  );
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const next = () => {
    setFlipped(false);
    setIndex((i) => (i + 1) % list.length);
  };
  const prev = () => {
    setFlipped(false);
    setIndex((i) => (i - 1 + list.length) % list.length);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (["SELECT", "INPUT", "BUTTON"].includes(e.target.tagName)) return;
      if (e.key === " ") {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (list.length === 0) {
    return (
      <main className="stage">
        <p className="empty-msg">no failed kanji to practice — nice</p>
      </main>
    );
  }

  const card = BY_ID.get(list[index]);

  return (
    <main className="stage practice-stage">
      <p className="practice-counter">
        {index + 1} / {list.length} · failed ×{totalFails(stats[card.id])}
      </p>
      <Flashcard
        practice
        card={card}
        mode={mode}
        flipped={flipped}
        onFlip={() => setFlipped((f) => !f)}
        onNext={next}
        onPrev={prev}
      />
    </main>
  );
}
