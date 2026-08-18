// The calligraphic faces shown on a card's "alt fonts" row.
//
// These are **bundled**, not system fonts: `src/fonts/fonts.css` carries them
// as subset woff2 (see that directory's README for sizes and licence), so what
// a learner sees no longer depends on what their OS happens to ship. The
// earlier version probed for 楷書/草書/手書き with canvas measureText and had to
// tell most people the font was missing.
//
// Each file is declared with a `unicode-range`, so the browser fetches only
// the chunk holding a glyph it actually paints — a kana card never pulls the
// ~1.7 MB of kanji outlines.

export const FACES = [
  {
    key: "brush",
    family: "Yuji Syuku",
    label: "筆",
    hint: "Yuji Syuku — brush calligraphy",
    kanji: true,
  },
  {
    key: "hand",
    family: "Slackside One",
    label: "手書き",
    hint: "Slackside One — casual handwriting (kana only)",
    kanji: false,
  },
  {
    key: "pop",
    family: "Hachi Maru Pop",
    label: "丸ポップ",
    hint: "Hachi Maru Pop — rounded handwriting",
    kanji: true,
  },
];

// The faces that can actually render this card. Slackside One has no kanji
// outlines, so a kanji card drops it rather than showing a system fallback
// under a label that claims otherwise.
export function facesFor(card) {
  const isKana = card?.kind === "kana";
  return FACES.filter((f) => isKana || f.kanji).map((f) => ({
    ...f,
    stack: `"${f.family}", ${isKana ? "sans-serif" : "serif"}`,
  }));
}
