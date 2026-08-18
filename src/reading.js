// Answer checking for the typing test: does what the user typed count as a
// reading of this card? Pure string math — no React, no storage.
//
// The guiding bias is *tolerant*: this is self-study, and rejecting a right
// answer over a romanization system or a long-vowel spelling is worse than
// occasionally accepting a near-miss. Everything on both sides is folded to
// one canonical form, then compared.

const KATA_START = 0x30a1;
const KATA_END = 0x30f6;

// katakana → hiragana, so a reading stored as "アイ" matches typed "あい"
export function toHiragana(s) {
  return [...s]
    .map((ch) => {
      const c = ch.codePointAt(0);
      return c >= KATA_START && c <= KATA_END
        ? String.fromCodePoint(c - 0x60)
        : ch;
    })
    .join("");
}

// One canonical spelling per sound:
// - macrons stripped (kōhī → kohi) via NFD + combining-mark removal
// - the Hepburn/kunrei pairs folded together (shi/si, chi/ti, tsu/tu, fu/hu,
//   ji/zi and their palatal forms)
// - long vowels collapsed (kou/koo/kō → ko, nn → n)
// so "shou", "shō", "syou" and "sho" all land on the same string.
export function normalizeRomaji(s) {
  let out = (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // combining macrons/accents
    .toLowerCase()
    .replace(/[^a-z]/g, ""); // spaces, hyphens, apostrophes, punctuation
  out = out
    .replace(/shi/g, "si")
    .replace(/sh/g, "sy")
    .replace(/chi/g, "ti")
    .replace(/ch/g, "ty")
    .replace(/tsu/g, "tu")
    .replace(/fu/g, "hu")
    .replace(/ji/g, "zi")
    .replace(/j/g, "zy");
  out = out
    .replace(/ou/g, "o")
    .replace(/([aiueo])\1+/g, "$1") // aa/ii/uu/ee/oo → a/i/u/e/o
    .replace(/nn+/g, "n");
  return out;
}

// kana typed by the user: fold to hiragana and drop the okurigana marker and
// the long-vowel bar, which readings spell inconsistently
export function normalizeKana(s) {
  return toHiragana((s ?? "").trim())
    .replace(/[\s\u30fb\u30fc-]/g, "")
    .replace(/([あいうえお])\1+/g, "$1");
}

// ── kana → rōmaji ───────────────────────────────────────────────────────────
// Used to gloss example readings on the card back. Modified Hepburn: long
// vowels are written out (おう → ou) rather than macronned, which matches how
// the kanji dataset already romanizes its readings.

const DIGRAPHS = {
  きゃ: "kya", きゅ: "kyu", きょ: "kyo", しゃ: "sha", しゅ: "shu", しょ: "sho",
  ちゃ: "cha", ちゅ: "chu", ちょ: "cho", にゃ: "nya", にゅ: "nyu", にょ: "nyo",
  ひゃ: "hya", ひゅ: "hyu", ひょ: "hyo", みゃ: "mya", みゅ: "myu", みょ: "myo",
  りゃ: "rya", りゅ: "ryu", りょ: "ryo", ぎゃ: "gya", ぎゅ: "gyu", ぎょ: "gyo",
  じゃ: "ja", じゅ: "ju", じょ: "jo", ぢゃ: "ja", ぢゅ: "ju", ぢょ: "jo",
  びゃ: "bya", びゅ: "byu", びょ: "byo", ぴゃ: "pya", ぴゅ: "pyu", ぴょ: "pyo",
};

const MONOGRAPHS = {
  あ: "a", い: "i", う: "u", え: "e", お: "o",
  か: "ka", き: "ki", く: "ku", け: "ke", こ: "ko",
  さ: "sa", し: "shi", す: "su", せ: "se", そ: "so",
  た: "ta", ち: "chi", つ: "tsu", て: "te", と: "to",
  な: "na", に: "ni", ぬ: "nu", ね: "ne", の: "no",
  は: "ha", ひ: "hi", ふ: "fu", へ: "he", ほ: "ho",
  ま: "ma", み: "mi", む: "mu", め: "me", も: "mo",
  や: "ya", ゆ: "yu", よ: "yo",
  ら: "ra", り: "ri", る: "ru", れ: "re", ろ: "ro",
  わ: "wa", ゐ: "i", ゑ: "e", を: "o", ん: "n",
  が: "ga", ぎ: "gi", ぐ: "gu", げ: "ge", ご: "go",
  ざ: "za", じ: "ji", ず: "zu", ぜ: "ze", ぞ: "zo",
  だ: "da", ぢ: "ji", づ: "zu", で: "de", ど: "do",
  ば: "ba", び: "bi", ぶ: "bu", べ: "be", ぼ: "bo",
  ぱ: "pa", ぴ: "pi", ぷ: "pu", ぺ: "pe", ぽ: "po",
  ぁ: "a", ぃ: "i", ぅ: "u", ぇ: "e", ぉ: "o",
  ゃ: "ya", ゅ: "yu", ょ: "yo", ゎ: "wa",
};

const VOWELS = { a: "a", i: "i", u: "u", e: "e", o: "o" };

export function toRomaji(text) {
  const src = toHiragana(text ?? "");
  let out = "";
  for (let i = 0; i < src.length; i++) {
    const pair = src.slice(i, i + 2);
    if (DIGRAPHS[pair]) {
      out += DIGRAPHS[pair];
      i++;
      continue;
    }
    const ch = src[i];
    if (ch === "っ") {
      // sokuon: double the next consonant (っち → tchi, per Hepburn)
      const next = DIGRAPHS[src.slice(i + 1, i + 3)] ?? MONOGRAPHS[src[i + 1]];
      const c = next?.[0];
      if (c && !VOWELS[c]) out += c === "c" ? "t" : c;
      continue;
    }
    if (ch === "ー") {
      // long-vowel bar: repeat whatever vowel we just wrote
      const last = out.at(-1);
      if (VOWELS[last]) out += last;
      continue;
    }
    if (ch === "ん") {
      // n before a vowel or y needs a separator, or "kani" would read かに
      const next = MONOGRAPHS[src[i + 1]] ?? DIGRAPHS[src.slice(i + 1, i + 3)];
      out += next && (VOWELS[next[0]] || next[0] === "y") ? "n'" : "n";
      continue;
    }
    out += MONOGRAPHS[ch] ?? ch;
  }
  return out;
}

// A reading field holds several readings ("アイ、あわ-れ、あわ-れむ" /
// "ai, awa-re, awa-remu"). Split them, and for an okurigana reading accept
// both the whole thing and the part the kanji itself covers ("awa-re" →
// "aware" and "awa").
function expand(field) {
  if (!field) return [];
  return field
    .split(/[、,・]/)
    .map((r) => r.trim())
    .filter(Boolean)
    .flatMap((r) => (r.includes("-") ? [r.replace(/-/g, ""), r.split("-")[0]] : [r]));
}

// を is written "wo" but pronounced "o" — accept what the learner hears
const EXTRA = { を: ["o"], ヲ: ["o"] };

// Every accepted answer for a card, already normalized.
// `script` is "romaji" or "kana"; kana cards are always romaji (the glyph is
// on screen, so typing it back would test nothing).
export function acceptedReadings(card, script) {
  if (!card) return [];
  const useKana = script === "kana" && card.kind !== "kana";
  if (useKana) return expand(card.kana).map(normalizeKana).filter(Boolean);
  const romaji = expand(card.romaji).concat(EXTRA[card.kanji] ?? []);
  return romaji.map(normalizeRomaji).filter(Boolean);
}

// Does `input` count as a reading of `card`?
export function checkReading(card, input, script) {
  const typed =
    script === "kana" && card?.kind !== "kana"
      ? normalizeKana(input)
      : normalizeRomaji(input);
  if (!typed) return false;
  return acceptedReadings(card, script).includes(typed);
}

// What the user should be typing, for the input's placeholder/label.
export function inputScriptFor(card, kanjiInput) {
  return card?.kind === "kana" ? "romaji" : kanjiInput;
}

// Is the typing test active for this card under the current setting?
// "off" — never; "kana" — level-0 cards only; "all" — every card.
export function typingApplies(card, typing) {
  if (typing === "all") return true;
  if (typing === "kana") return card?.kind === "kana";
  return false;
}
