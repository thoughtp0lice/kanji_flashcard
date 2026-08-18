import { describe, expect, it } from "vitest";
import {
  acceptedReadings,
  checkReading,
  inputScriptFor,
  normalizeKana,
  normalizeRomaji,
  toHiragana,
  typingApplies,
} from "../src/reading.js";
import { KANA } from "../src/kana.js";
import { KANJI } from "../src/data.js";

const kana = (glyph) => KANA.find((k) => k.kanji === glyph);
const kanji = (char) => KANJI.find((k) => k.kanji === char);

describe("toHiragana", () => {
  it("folds katakana onto hiragana and leaves everything else", () => {
    expect(toHiragana("アイ")).toBe("あい");
    expect(toHiragana("あい")).toBe("あい");
    expect(toHiragana("ラーメンabc")).toBe("らーめんabc");
  });
});

describe("normalizeRomaji", () => {
  it("strips case, spaces, hyphens and macrons", () => {
    expect(normalizeRomaji("  A-Wa Re ")).toBe(normalizeRomaji("aware"));
    expect(normalizeRomaji("kōhī")).toBe(normalizeRomaji("kohi"));
  });

  it("folds Hepburn and kunrei spellings together", () => {
    for (const [a, b] of [
      ["shi", "si"],
      ["chi", "ti"],
      ["tsu", "tu"],
      ["fu", "hu"],
      ["ji", "zi"],
      ["sha", "sya"],
      ["cho", "tyo"],
    ]) {
      expect(normalizeRomaji(a)).toBe(normalizeRomaji(b));
    }
  });

  it("collapses long vowels however they are spelled", () => {
    const forms = ["kou", "koo", "kō", "ko"];
    const canonical = normalizeRomaji(forms[0]);
    for (const f of forms) expect(normalizeRomaji(f)).toBe(canonical);
    expect(normalizeRomaji("nn")).toBe(normalizeRomaji("n"));
  });

  it("keeps genuinely different sounds apart", () => {
    expect(normalizeRomaji("ka")).not.toBe(normalizeRomaji("ki"));
    expect(normalizeRomaji("sa")).not.toBe(normalizeRomaji("sha"));
    expect(normalizeRomaji("ta")).not.toBe(normalizeRomaji("da"));
  });
});

describe("normalizeKana", () => {
  it("folds script, trims, and drops the okurigana and long-vowel marks", () => {
    expect(normalizeKana(" アイ ")).toBe("あい");
    expect(normalizeKana("あわ-れ")).toBe("あわれ");
  });
});

describe("checkReading — kana cards", () => {
  it("accepts the rōmaji, in either case", () => {
    expect(checkReading(kana("あ"), "a", "romaji")).toBe(true);
    expect(checkReading(kana("ア"), " A ", "romaji")).toBe(true);
    expect(checkReading(kana("し"), "SI", "romaji")).toBe(true);
    expect(checkReading(kana("つ"), "tu", "romaji")).toBe(true);
  });

  it("rejects a different sound", () => {
    expect(checkReading(kana("あ"), "i", "romaji")).toBe(false);
    expect(checkReading(kana("か"), "ka!", "romaji")).toBe(true); // punctuation ignored
    expect(checkReading(kana("か"), "", "romaji")).toBe(false);
    expect(checkReading(kana("か"), "   ", "romaji")).toBe(false);
  });

  it("accepts what を actually sounds like as well as how it is spelled", () => {
    expect(checkReading(kana("を"), "wo", "romaji")).toBe(true);
    expect(checkReading(kana("を"), "o", "romaji")).toBe(true);
  });

  it("stays on rōmaji even when the kanji setting says kana", () => {
    expect(inputScriptFor(kana("あ"), "kana")).toBe("romaji");
    // a kana card is never asked for in kana — the glyph is on screen
    expect(checkReading(kana("あ"), "a", "kana")).toBe(true);
  });

  it("covers every card in the chart", () => {
    for (const k of KANA) {
      expect(checkReading(k, k.romaji, "romaji")).toBe(true);
    }
  });
});

describe("checkReading — kanji cards", () => {
  const ai = kanji("哀"); // アイ、あわ-れ、あわ-れむ

  it("accepts any listed reading, in kana or katakana", () => {
    expect(checkReading(ai, "あい", "kana")).toBe(true);
    expect(checkReading(ai, "アイ", "kana")).toBe(true);
    expect(checkReading(ai, "あわれ", "kana")).toBe(true);
    expect(checkReading(ai, "あわれむ", "kana")).toBe(true);
  });

  it("accepts the stem of an okurigana reading", () => {
    expect(acceptedReadings(ai, "kana")).toContain("あわ");
    expect(checkReading(ai, "あわ", "kana")).toBe(true);
    expect(checkReading(ai, "awa", "romaji")).toBe(true);
  });

  it("accepts the rōmaji side too", () => {
    expect(checkReading(ai, "ai", "romaji")).toBe(true);
    expect(checkReading(ai, "aware", "romaji")).toBe(true);
    expect(checkReading(ai, "awaremu", "romaji")).toBe(true);
  });

  it("rejects a reading that belongs to another kanji", () => {
    expect(checkReading(ai, "みず", "kana")).toBe(false);
    expect(checkReading(ai, "mizu", "romaji")).toBe(false);
  });

  it("does not blow up on cards with no reading recorded", () => {
    expect(checkReading({ kanji: "x" }, "a", "romaji")).toBe(false);
    expect(checkReading(null, "a", "romaji")).toBe(false);
    expect(acceptedReadings(undefined, "kana")).toEqual([]);
  });

  it("accepts every first reading across the whole jōyō set", () => {
    const bad = KANJI.filter((k) => !checkReading(k, k.romaji.split(",")[0], "romaji"));
    expect(bad.map((k) => k.kanji)).toEqual([]);
  });
});

describe("typingApplies", () => {
  it("follows the setting", () => {
    const k = kana("あ");
    const j = kanji("愛");
    expect(typingApplies(k, "off")).toBe(false);
    expect(typingApplies(j, "off")).toBe(false);
    expect(typingApplies(k, "kana")).toBe(true);
    expect(typingApplies(j, "kana")).toBe(false);
    expect(typingApplies(k, "all")).toBe(true);
    expect(typingApplies(j, "all")).toBe(true);
  });
});
