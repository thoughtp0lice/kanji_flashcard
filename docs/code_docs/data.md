# Part: Card Datasets (`src/data.js`, `src/examples.js`, `src/kana.js`)

Static data modules bundled into the frontend: the 2,136 jōyō kanji with their
example words, plus the 92 kana of level 0.

- **Purpose:** the reference content the app teaches.
- **Status:** `data.js`/`examples.js` are **vendored generated data** — no
  generator script is committed; treat them as build inputs, not hand-editable
  source (see "Provenance" and the open item below). `kana.js` is **authored
  source** and normal to edit.
- **Boundary:** pure data. `data.js`/`kana.js` are consumed by
  `lesson.js`/`Study.jsx` (via `ALL_CARDS` and the derived `BY_ID` map);
  `examples.js` is read by `Flashcard.jsx`/`DeckView.jsx`.

`Study.jsx` concatenates the two card sources once:

```js
export const ALL_CARDS = [...KANA, ...KANJI]; // level 0 first, then the jōyō
```

## Shape

### `src/data.js` — `export const KANJI`

An array of ~2,136 objects, each one kanji:

| Field | Type | Example | Notes |
|---|---|---|---|
| `id` | number | `4` | 1-based, **unique**, stable; the SRS/`stats` key (`INV-DATA-1`) |
| `kanji` | string | `"愛"` | the character; also the `EXAMPLES` lookup key |
| `old` | string \| null | `"惡"` | pre-reform form, or `null` |
| `radical` | string | `"心"` | classifying radical |
| `strokes` | number | `13` | stroke count |
| `grade` | `"1".."6"\|"S"` | `"4"` | school grade; `"S"` = secondary (jōyō-only), see `GRADE_ORDER` |
| `meaning` | string | `"love"` | short English gloss |
| `kana` | string | `"アイ"` | on/kun readings (`、`-separated, `-` marks okurigana) |
| `romaji` | string | `"ai"` | romanized readings |

### `src/examples.js` — `export const EXAMPLES`

An object keyed by the **kanji character** (matching `KANJI[].kanji`), each
value an array of up to 3 example words as `[word, reading, gloss]` tuples:

```js
EXAMPLES["愛"] // → [["愛情","あいじょう","love, affection"], ...]
```

Not every kanji has examples; `Flashcard`/`DeckView` default to `[]`.

### `src/kana.js` — `export const KANA` (level 0)

92 cards: the 46-sign gojūon chart in hiragana, then the same 46 in katakana.
Built at module load from a compact `ROWS` table (row glyphs + Hepburn
readings), so the source is auditable rather than a generated blob.

| Field | Type | Example | Notes |
|---|---|---|---|
| `id` | number | `10001` | `KANA_ID_BASE + n`; starts at 10001, above the last kanji id (2136), so ids never collide (`INV-DATA-3`) |
| `kanji` | string | `"あ"` | the glyph — same field name as a kanji card, so components need no special case |
| `kind` | `"kana"` | `"kana"` | the discriminator; kanji records have no `kind` |
| `script` | `"hiragana"\|"katakana"` | `"hiragana"` | which syllabary |
| `pair` | string | `"ア"` | the same sound in the other script |
| `grade` | `"0"` | `"0"` | `KANA_GRADE` — level 0 (`GRADE_ORDER[0]`) |
| `meaning` | string | `"hiragana a"` | front text in "meaning" mode; script-qualified so あ and ア are distinguishable |
| `kana` | string | `"あ"` | the glyph again (a kana's reading *is* itself); the card back suppresses this line for `kind: "kana"` |
| `romaji` | string | `"a"` | Hepburn; also the answer for the typing test |

Kana records deliberately **omit** `strokes`, `radical`, and `old` — the back
face branches on `kind` and renders `KanaBack` instead.

They also carry no example words of their own. Hand-authoring 92 vocabulary
items was tried and rejected as unverifiable content (see the git history for
`WORDS` in this file). Instead
[`src/kanaExamples.js`](../../src/kanaExamples.js) **derives** them from data
that already has a source: the example words of the **grade 1–2 kanji**. A word
qualifies when its *reading* contains the sign, which is the pedagogical point
("here is this sound in a word you will meet") and means a katakana card
borrows its hiragana twin's words — same sound, and readings in the dataset are
hiragana. Signs with no match simply show none: を and ヲ, since を is a
particle and never part of a reading.

**Scope:** the base chart only. Dakuten (が/ぱ) and yōon (きゃ) are mechanical
derivations of these 46 signs and are out of scope — level 0 exists to unlock
kanji, not to be a complete kana course. Widening it means adding rows to
`ROWS`; nothing else changes, and the gate in
[`lesson.md`](lesson.md) picks the new cards up automatically.

## Size & handling

- `data.js`/`examples.js` are ~350 KB each, effectively **one line** of
  JSON-in-JS. Do not reformat, pretty-print, or hand-edit — a diff would be
  unreadable and the churn is huge. (`kana.js` is a few KB of ordinary source.)
- Bundled into the frontend by Vite (`import { KANJI }`), so they ship inside
  `dist/` and the single-file server. They are **not** in the SQLite DB.
- `BY_ID = new Map(ALL_CARDS.map(k => [k.id, k]))` is built once in `Study.jsx`
  and re-exported for the deck/practice views.

## Provenance & licensing

- **Kana:** authored in-repo from the standard gojūon chart with Hepburn
  romanization — no external dataset, nothing to attribute.
- **Kanji list:** [Wikipedia — List of jōyō kanji](https://en.wikipedia.org/wiki/List_of_j%C5%8Dy%C5%8D_kanji).
- **Example words:** [kanjiapi.dev](https://kanjiapi.dev), from JMdict/KANJIDIC2
  via the [EDRDG](https://www.edrdg.org/) — **CC BY-SA**. Preserve attribution
  (it is in the app UI and `README.md`) if redistributing.

## Invariants & validation

- `id` values are unique across `KANJI`; `grade` is one of `GRADE_ORDER`.
  Enforced by `scripts/check_repo.mjs` (`INV-DATA-1`, `INV-DATA-2`).
- `KANA` ids are unique, disjoint from `KANJI` ids, all grade `"0"`, and every
  `pair` resolves to another kana glyph with the two scripts equal in size —
  enforced by the same script (`INV-DATA-3`).
- **No unsourced content.** Everything in `kana.js` is either the gojūon chart
  itself or Hepburn romanization — both mechanically checkable. Anything
  needing editorial judgement (vocabulary, glosses, mnemonics) belongs in a
  sourced dataset, not here.
- `EXAMPLES` keys should exist in `KANJI` by character — checked as a soft
  warning (data is external, so a stray key is not fatal).

## Open item

Regeneration is currently undocumented/unscripted. If the dataset needs
refreshing, add a `scripts/gen-data.mjs` that fetches + normalizes from the
sources above, and record it here and in [`build.md`](build.md). Until then,
changing the data means editing the generated files directly and re-running
`node scripts/check_repo.mjs`.

## Related

Consumers: [`lesson.md`](lesson.md), [`frontend.md`](frontend.md).
Invariants: `INV-DATA-1`, `INV-DATA-2`.
