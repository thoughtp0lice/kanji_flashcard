// Level 0 dataset: the two kana syllabaries, taught before any kanji.
//
// Scope is the gojūon chart — the 46 base signs of each script. Dakuten
// (が/ぱ) and yōon (きゃ) are mechanical derivations of these signs and are
// deliberately out of scope: level 0 exists to unlock kanji, not to be a
// complete kana course.
//
// Records are shape-compatible with `KANJI` (src/data.js) so the deck, the
// flashcard, and the SRS treat them as ordinary cards. `kind: "kana"` is the
// discriminator: kana records carry `script`/`pair` and have no
// `strokes`/`radical`/`old`.

// Ids start above the last jōyō kanji id (2136) so the two datasets can share
// one `stats` map and one `BY_ID` index without colliding. (`INV-DATA-3`)
export const KANA_ID_BASE = 10000;

// gojūon chart order: hiragana row / katakana row / Hepburn romaji
const ROWS = [
  ["あいうえお", "アイウエオ", "a i u e o"],
  ["かきくけこ", "カキクケコ", "ka ki ku ke ko"],
  ["さしすせそ", "サシスセソ", "sa shi su se so"],
  ["たちつてと", "タチツテト", "ta chi tsu te to"],
  ["なにぬねの", "ナニヌネノ", "na ni nu ne no"],
  ["はひふへほ", "ハヒフヘホ", "ha hi fu he ho"],
  ["まみむめも", "マミムメモ", "ma mi mu me mo"],
  ["やゆよ", "ヤユヨ", "ya yu yo"],
  ["らりるれろ", "ラリルレロ", "ra ri ru re ro"],
  ["わを", "ワヲ", "wa wo"],
  ["ん", "ン", "n"],
];

function build() {
  const out = [];
  let id = KANA_ID_BASE;
  // hiragana first, then katakana — new cards are introduced in this order
  for (const script of ["hiragana", "katakana"]) {
    for (const [hira, kata, readings] of ROWS) {
      const glyphs = [...(script === "hiragana" ? hira : kata)];
      const pairs = [...(script === "hiragana" ? kata : hira)];
      readings.split(" ").forEach((romaji, i) => {
        out.push({
          id: ++id,
          kanji: glyphs[i], // the card's glyph — same field name as a kanji card
          kind: "kana",
          script,
          pair: pairs[i], // the same sound written in the other script
          grade: "0",
          meaning: `${script} ${romaji}`,
          kana: glyphs[i],
          romaji,
        });
      });
    }
  }
  return out;
}

export const KANA = build();
