# Part: Kanji Dataset (`src/data.js`, `src/examples.js`)

Static, generated data modules bundled into the frontend. Together they hold the
2,136 jōyō kanji and their example words.

- **Purpose:** the reference content the app teaches.
- **Status:** **vendored generated data.** No generator script is committed;
  treat these files as build inputs, not hand-editable source. (See "Provenance"
  and the open item below.)
- **Boundary:** pure data. `data.js` is consumed by `lesson.js`/`Study.jsx`
  (via `KANJI` and the derived `BY_ID` map); `examples.js` is read by
  `Flashcard.jsx`/`DeckView.jsx`.

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

## Size & handling

- ~350 KB each, effectively **one line** of JSON-in-JS. Do not reformat,
  pretty-print, or hand-edit — a diff would be unreadable and the churn is huge.
- Bundled into the frontend by Vite (`import { KANJI }`), so they ship inside
  `dist/` and the single-file server. They are **not** in the SQLite DB.
- `BY_ID = new Map(KANJI.map(k => [k.id, k]))` is built once in `Study.jsx` and
  re-exported for the deck/practice views.

## Provenance & licensing

- **Kanji list:** [Wikipedia — List of jōyō kanji](https://en.wikipedia.org/wiki/List_of_j%C5%8Dy%C5%8D_kanji).
- **Example words:** [kanjiapi.dev](https://kanjiapi.dev), from JMdict/KANJIDIC2
  via the [EDRDG](https://www.edrdg.org/) — **CC BY-SA**. Preserve attribution
  (it is in the app UI and `README.md`) if redistributing.

## Invariants & validation

- `id` values are unique across `KANJI`; `grade` is one of `GRADE_ORDER`.
  Enforced by `scripts/check_repo.mjs` (`INV-DATA-1`, `INV-DATA-2`).
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
