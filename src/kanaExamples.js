// Example words for a kana card, taken from data we already have a source
// for: the example words of the **grade 1–2 kanji** (kanjiapi.dev /
// JMdict-KANJIDIC2, CC BY-SA — see docs/code_docs/data.md).
//
// The point is "here is this sound in a real word a beginner will meet", so a
// word qualifies when its *reading* contains the sign. That also means a
// katakana card borrows its hiragana twin's words: the sound is the same, and
// readings in the dataset are written in hiragana.
//
// Nothing here is authored — if a sign has no match in that corpus it simply
// shows none (を, for instance: it is a particle and never part of a reading).

import { KANJI } from "./data.js";
import { EXAMPLES } from "./examples.js";
import { toHiragana } from "./reading.js";

const EASY_GRADES = new Set(["1", "2"]);
const PER_CARD = 2;

// built once, lazily — most sessions never open a kana card's back
let index = null;

function build() {
  const byChar = new Map();
  for (const k of KANJI) {
    if (!EASY_GRADES.has(k.grade)) continue;
    for (const [word, reading, gloss] of EXAMPLES[k.kanji] ?? []) {
      for (const ch of new Set(reading)) {
        if (!byChar.has(ch)) byChar.set(ch, []);
        byChar.get(ch).push({ word, reading, gloss, grade: k.grade });
      }
    }
  }
  for (const [ch, list] of byChar) {
    // grade 1 before grade 2, then the shortest word — the least to chew on
    list.sort(
      (a, b) =>
        a.grade.localeCompare(b.grade) ||
        a.word.length - b.word.length ||
        a.reading.length - b.reading.length
    );
    const seen = new Set();
    byChar.set(
      ch,
      list.filter((e) => !seen.has(e.word) && seen.add(e.word)).slice(0, PER_CARD)
    );
  }
  return byChar;
}

// `[{ word, reading, gloss, grade }]` for a kana card — at most PER_CARD,
// possibly empty.
export function examplesForKana(card) {
  if (card?.kind !== "kana") return [];
  index ??= build();
  return index.get(toHiragana(card.kanji)) ?? [];
}

// Split a reading around the first occurrence of the sign, so the card can
// pick it out of the word: `["おお", "あ", "め"]` for あ in "おおあめ".
export function highlight(reading, glyph) {
  const target = toHiragana(glyph);
  const at = reading.indexOf(target);
  if (at < 0) return [reading, "", ""];
  return [reading.slice(0, at), target, reading.slice(at + target.length)];
}
