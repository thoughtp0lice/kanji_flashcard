# Bundled calligraphic webfonts

The three faces shown on a card's "alt fonts" row. Everything here is
**generated** — run [`scripts/fetch-fonts.mjs`](../../scripts/fetch-fonts.mjs)
to rebuild `fonts.css` and the `.woff2` files; do not hand-edit them.

| Face | Family | Style | Kanji? | Source |
|---|---|---|---|---|
| brush | `Yuji Syuku` | 佑字 肅 — brush calligraphy, close to 楷書 | yes | [Google Fonts](https://fonts.google.com/specimen/Yuji+Syuku) · [Kinutafontfactory/Yuji](https://github.com/Kinutafontfactory/Yuji) |
| hand | `Slackside One` | casual handwriting | **no** | [Google Fonts](https://fonts.google.com/specimen/Slackside+One) · [ManiackersDesign/slackside](https://github.com/ManiackersDesign/slackside) |
| pop | `Hachi Maru Pop` | rounded pop handwriting | yes | [Google Fonts](https://fonts.google.com/specimen/Hachi+Maru+Pop) · [noriokanisawa/HachiMaruPop](https://github.com/noriokanisawa/HachiMaruPop) |

**Slackside One has no kanji outlines.** This is measured, not assumed: asking
Google for 223 kanji returns a 1.6 KB file (~7 bytes per glyph — a declared
`unicode-range` with nothing behind it), where Yuji Syuku returns 99 KB for the
same request. `src/fonts.js` therefore marks that face `kanji: false` and the
card drops it on a kanji back rather than showing a silent system fallback.

## Size

Subset to exactly the glyphs this app can display (92 kana + 2,136 jōyō), the
three faces total **~1.8 MB** of woff2 instead of ~10 MB unsubset. They are
split per `unicode-range`, so a browser downloads only the chunk holding a
glyph it is actually painting:

| Chunk | Size |
|---|---|
| `*-kana.woff2` (×3) | ~54 KB total — all a level-0 user ever fetches |
| `yuji-syuku-kanji-*.woff2` (×4) | ~1.1 MB |
| `hachi-maru-pop-kanji-*.woff2` (×4) | ~644 KB |

With the alt-fonts setting off (the default) none of them are fetched at all.

## Licence

All three are **SIL Open Font License 1.1** — see [`OFL.txt`](OFL.txt), which
permits bundling and redistribution provided the notice travels with the fonts.
Copyright holders:

- Copyright 2021 The Yuji Project Authors
- Copyright 2020 The Slackside One Project Authors
- Copyright 2020 The Hachi Maru Pop Project Authors

Subsetting is explicitly allowed by the OFL (the fonts are not sold, the
notice is retained, and no Reserved Font Name is used — none of the three
declares one).
