import { describe, expect, it } from "vitest";
import { examplesForKana, highlight } from "../src/kanaExamples.js";
import { KANA } from "../src/kana.js";
import { KANJI } from "../src/data.js";
import { EXAMPLES } from "../src/examples.js";
import { toHiragana } from "../src/reading.js";

const kana = (glyph) => KANA.find((k) => k.kanji === glyph);
const EASY = new Set(
  KANJI.filter((k) => ["1", "2"].includes(k.grade)).map((k) => k.kanji)
);

describe("examplesForKana", () => {
  it("only ever returns words from grade 1–2 kanji examples", () => {
    for (const card of KANA) {
      for (const e of examplesForKana(card)) {
        const source = Object.entries(EXAMPLES).find(([ch, list]) =>
          list.some(([w]) => w === e.word) && EASY.has(ch)
        );
        expect(source, `${e.word} has no grade 1–2 source`).toBeDefined();
      }
    }
  });

  it("only returns words whose reading contains the sign", () => {
    for (const card of KANA) {
      for (const e of examplesForKana(card)) {
        expect(e.reading).toContain(toHiragana(card.kanji));
      }
    }
  });

  it("covers the chart apart from を, which is never part of a reading", () => {
    const empty = KANA.filter((k) => examplesForKana(k).length === 0);
    expect(empty.map((k) => k.kanji)).toEqual(["を", "ヲ"]);
  });

  it("gives a katakana card its hiragana twin's words — same sound", () => {
    expect(examplesForKana(kana("ア"))).toEqual(examplesForKana(kana("あ")));
  });

  it("caps the list and never repeats a word", () => {
    for (const card of KANA) {
      const words = examplesForKana(card).map((e) => e.word);
      expect(words.length).toBeLessThanOrEqual(2);
      expect(new Set(words).size).toBe(words.length);
    }
  });

  it("returns nothing for a kanji card", () => {
    expect(examplesForKana(KANJI[0])).toEqual([]);
    expect(examplesForKana(undefined)).toEqual([]);
  });
});

describe("highlight", () => {
  it("splits a reading around the sign", () => {
    expect(highlight("おおあめ", "あ")).toEqual(["おお", "あ", "め"]);
    expect(highlight("あまぐ", "あ")).toEqual(["", "あ", "まぐ"]);
  });

  it("matches a katakana card against a hiragana reading", () => {
    expect(highlight("おおあめ", "ア")).toEqual(["おお", "あ", "め"]);
  });

  it("leaves the reading whole when the sign is absent", () => {
    expect(highlight("きおん", "ぬ")).toEqual(["きおん", "", ""]);
  });
});
