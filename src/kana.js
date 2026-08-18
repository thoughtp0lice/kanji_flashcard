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

// One very elementary word per sign, showing where it actually turns up:
// native words for hiragana, loanwords for katakana. `[word, romaji, gloss]`
// mirrors the EXAMPLES tuple shape in examples.js, except the middle element
// is rōmaji — a kana word needs no kana reading.
//
// Authored by hand (there is no generator for these); keep them common enough
// that a first-week learner recognizes the meaning.
const WORDS = {
  あ: ["あめ", "ame", "rain"],
  い: ["いぬ", "inu", "dog"],
  う: ["うみ", "umi", "sea"],
  え: ["えき", "eki", "train station"],
  お: ["おと", "oto", "sound"],
  か: ["かさ", "kasa", "umbrella"],
  き: ["きのこ", "kinoko", "mushroom"],
  く: ["くつ", "kutsu", "shoes"],
  け: ["けむり", "kemuri", "smoke"],
  こ: ["こども", "kodomo", "child"],
  さ: ["さかな", "sakana", "fish"],
  し: ["しま", "shima", "island"],
  す: ["すし", "sushi", "sushi"],
  せ: ["せかい", "sekai", "world"],
  そ: ["そら", "sora", "sky"],
  た: ["たまご", "tamago", "egg"],
  ち: ["ちず", "chizu", "map"],
  つ: ["つき", "tsuki", "moon"],
  て: ["てがみ", "tegami", "letter"],
  と: ["とり", "tori", "bird"],
  な: ["なつ", "natsu", "summer"],
  に: ["にく", "niku", "meat"],
  ぬ: ["ぬの", "nuno", "cloth"],
  ね: ["ねこ", "neko", "cat"],
  の: ["のり", "nori", "seaweed"],
  は: ["はな", "hana", "flower"],
  ひ: ["ひと", "hito", "person"],
  ふ: ["ふね", "fune", "boat"],
  へ: ["へや", "heya", "room"],
  ほ: ["ほし", "hoshi", "star"],
  ま: ["まど", "mado", "window"],
  み: ["みず", "mizu", "water"],
  む: ["むし", "mushi", "insect"],
  め: ["めがね", "megane", "glasses"],
  も: ["もり", "mori", "forest"],
  や: ["やま", "yama", "mountain"],
  ゆ: ["ゆき", "yuki", "snow"],
  よ: ["よる", "yoru", "night"],
  ら: ["さくら", "sakura", "cherry blossom"],
  り: ["りんご", "ringo", "apple"],
  る: ["くるま", "kuruma", "car"],
  れ: ["これ", "kore", "this one"],
  ろ: ["しろ", "shiro", "white"],
  わ: ["わたし", "watashi", "I, me"],
  を: ["ほんをよむ", "hon o yomu", "to read a book — を marks the object"],
  ん: ["みかん", "mikan", "mandarin orange"],
  ア: ["アメリカ", "amerika", "America"],
  イ: ["イタリア", "itaria", "Italy"],
  ウ: ["ウール", "ūru", "wool"],
  エ: ["エアコン", "eakon", "air conditioner"],
  オ: ["オレンジ", "orenji", "orange"],
  カ: ["カメラ", "kamera", "camera"],
  キ: ["キロ", "kiro", "kilo"],
  ク: ["クラス", "kurasu", "class"],
  ケ: ["ケーキ", "kēki", "cake"],
  コ: ["コーヒー", "kōhī", "coffee"],
  サ: ["サラダ", "sarada", "salad"],
  シ: ["シャツ", "shatsu", "shirt"],
  ス: ["スープ", "sūpu", "soup"],
  セ: ["セーター", "sētā", "sweater"],
  ソ: ["ソース", "sōsu", "sauce"],
  タ: ["タクシー", "takushī", "taxi"],
  チ: ["チーズ", "chīzu", "cheese"],
  ツ: ["ツアー", "tsuā", "tour"],
  テ: ["テレビ", "terebi", "television"],
  ト: ["トマト", "tomato", "tomato"],
  ナ: ["ナイフ", "naifu", "knife"],
  ニ: ["テニス", "tenisu", "tennis"],
  ヌ: ["カヌー", "kanū", "canoe"],
  ネ: ["ネクタイ", "nekutai", "necktie"],
  ノ: ["ノート", "nōto", "notebook"],
  ハ: ["ハム", "hamu", "ham"],
  ヒ: ["ヒント", "hinto", "hint"],
  フ: ["フランス", "furansu", "France"],
  ヘ: ["ヘルメット", "herumetto", "helmet"],
  ホ: ["ホテル", "hoteru", "hotel"],
  マ: ["マスク", "masuku", "mask"],
  ミ: ["ミルク", "miruku", "milk"],
  ム: ["ゴム", "gomu", "rubber"],
  メ: ["メモ", "memo", "memo"],
  モ: ["モデル", "moderu", "model"],
  ヤ: ["タイヤ", "taiya", "tire"],
  ユ: ["ユーロ", "yūro", "euro"],
  ヨ: ["ヨーグルト", "yōguruto", "yogurt"],
  ラ: ["ラジオ", "rajio", "radio"],
  リ: ["リボン", "ribon", "ribbon"],
  ル: ["ルール", "rūru", "rule"],
  レ: ["レモン", "remon", "lemon"],
  ロ: ["ロボット", "robotto", "robot"],
  ワ: ["ワイン", "wain", "wine"],
  ヲ: ["ヲ", "wo", "rarely written today — the particle is hiragana を"],
  ン: ["パン", "pan", "bread"],
};

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
          examples: WORDS[glyphs[i]] ? [WORDS[glyphs[i]]] : [],
        });
      });
    }
  }
  return out;
}

export const KANA = build();
