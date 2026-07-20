(() => {
  const STORAGE_KEY = "joyo-kanji-known";
  const $ = (id) => document.getElementById(id);

  const card = $("card");
  const frontContent = $("frontContent");
  const backKanji = $("backKanji");
  const backMeaning = $("backMeaning");
  const backKana = $("backKana");
  const backRomaji = $("backRomaji");
  const backMeta = $("backMeta");
  const cardPos = $("cardPos");
  const knownCount = $("knownCount");
  const progressFill = $("progressFill");
  const emptyMsg = $("emptyMsg");

  let known = new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"));
  let deck = [];
  let index = 0;
  let mode = "kanji";

  function saveKnown() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...known]));
  }

  function gradeLabel(g) {
    return g === "S" ? "Secondary school" : `Grade ${g}`;
  }

  function buildDeck() {
    const grade = $("gradeSelect").value;
    const unknownOnly = $("unknownOnly").checked;
    deck = KANJI.filter(
      (k) =>
        (grade === "all" || k.grade === grade) &&
        (!unknownOnly || !known.has(k.id))
    );
    index = Math.min(index, Math.max(0, deck.length - 1));
    render();
  }

  function shuffle() {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    index = 0;
    render();
  }

  function render() {
    const hasCards = deck.length > 0;
    document.querySelector(".card-container").hidden = !hasCards;
    document.querySelector(".controls").hidden = !hasCards;
    emptyMsg.hidden = hasCards;

    const gradeDeck =
      $("gradeSelect").value === "all"
        ? KANJI
        : KANJI.filter((k) => k.grade === $("gradeSelect").value);
    const knownInGrade = gradeDeck.filter((k) => known.has(k.id)).length;
    knownCount.textContent = `known: ${knownInGrade} / ${gradeDeck.length}`;
    progressFill.style.width = `${(knownInGrade / gradeDeck.length) * 100}%`;

    if (!hasCards) {
      cardPos.textContent = "0 / 0";
      return;
    }

    const k = deck[index];
    cardPos.textContent = `${index + 1} / ${deck.length}`;

    card.classList.remove("flipped");
    // let the flip-back finish before swapping content so the answer doesn't flash
    setTimeout(() => {
      if (mode === "kanji") {
        frontContent.textContent = k.kanji;
        frontContent.classList.remove("text-front");
      } else {
        frontContent.textContent = k.meaning;
        frontContent.classList.add("text-front");
      }
      backKanji.textContent = k.kanji + (k.old ? `（${k.old}）` : "");
      backMeaning.textContent = k.meaning;
      backKana.textContent = k.kana;
      backRomaji.textContent = k.romaji;
      backMeta.textContent = `${gradeLabel(k.grade)} · ${k.strokes} strokes · radical ${k.radical}${known.has(k.id) ? " · ✓ known" : ""}`;
    }, card.classList.contains("flipped") ? 220 : 0);
  }

  function next() {
    if (!deck.length) return;
    index = (index + 1) % deck.length;
    render();
  }

  function prev() {
    if (!deck.length) return;
    index = (index - 1 + deck.length) % deck.length;
    render();
  }

  function markKnown() {
    if (!deck.length) return;
    known.add(deck[index].id);
    saveKnown();
    if ($("unknownOnly").checked) {
      deck.splice(index, 1);
      if (index >= deck.length) index = 0;
      render();
    } else {
      next();
    }
  }

  function markAgain() {
    if (!deck.length) return;
    known.delete(deck[index].id);
    saveKnown();
    next();
  }

  card.addEventListener("click", () => card.classList.toggle("flipped"));
  $("nextBtn").addEventListener("click", next);
  $("prevBtn").addEventListener("click", prev);
  $("knownBtn").addEventListener("click", markKnown);
  $("againBtn").addEventListener("click", markAgain);
  $("shuffleBtn").addEventListener("click", shuffle);
  $("resetBtn").addEventListener("click", () => {
    if (confirm("Clear all your known-kanji progress?")) {
      known.clear();
      saveKnown();
      buildDeck();
    }
  });
  $("gradeSelect").addEventListener("change", () => {
    index = 0;
    buildDeck();
  });
  $("modeSelect").addEventListener("change", (e) => {
    mode = e.target.value;
    render();
  });
  $("unknownOnly").addEventListener("change", () => {
    index = 0;
    buildDeck();
  });

  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "SELECT" || e.target.tagName === "INPUT") return;
    switch (e.key) {
      case " ":
        e.preventDefault();
        card.classList.toggle("flipped");
        break;
      case "ArrowRight":
        next();
        break;
      case "ArrowLeft":
        prev();
        break;
      case "1":
        markAgain();
        break;
      case "2":
        markKnown();
        break;
    }
  });

  buildDeck();
})();
