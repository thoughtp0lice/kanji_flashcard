# 漢字 kanji flashcards

A mobile-first spaced-repetition flashcard app for the 2,136 jōyō kanji —
plus an optional level 0 that gets you through hiragana and katakana first.
React + Vite frontend, small Express + SQLite backend for accounts and
cross-device sync.

![CI](https://github.com/thoughtp0lice/kanji_flashcard/actions/workflows/ci.yml/badge.svg)

## Features

- **Level 0 — kana first** — starting from zero? Pick **Level 0** instead of a
  school grade and you study the 92 hiragana and katakana (あ い う… then ア
  イ ウ…, in chart order) and **nothing else**: no kanji is introduced or
  reviewed until you know every kana. Then the deck opens up to Grade 1 by
  itself. Already read kana? Pick a grade and you'll never see a kana card.
- **Daily decks** — pick a starting level and a pace (new cards/day,
  max reviews/day); each day blends new cards with due reviews. New kanji
  favor the lowest unfinished grade and blend higher grades in as you
  progress. Changing the plan rebuilds today's deck on the spot (finished
  cards stay finished).
- **Spaced repetition** — SM-2-style scheduling: a ✓ grows a card's interval
  ~×2.5 (4 → 10 → 25 → 63 days…), a ✗ cuts it to ~20% and brings the card
  back tomorrow. Yesterday's misses are always in today's deck, even past
  the review limit.
- **Typing test** — instead of grading yourself, prove it: pressing ✓ shrinks
  the card to the top half and asks you to type the reading. Get it right and
  the card passes and moves on; get it wrong and it counts as a miss and shows
  you the answer. On for kana by default (`off` / `kana` / `all` in settings),
  and kanji can be answered in **rōmaji or kana**. Spelling is judged
  leniently — `shi`/`si`, `kou`/`kō`/`ko` and either syllabary all count.
- **Card details** — meaning, on/kun readings, rōmaji, stroke count,
  radical, old forms, and up to 3 common example words per kanji
  (from [kanjiapi.dev](https://kanjiapi.dev), JMdict/KANJIDIC2, CC BY-SA).
  A kana card gets its own back: the sign in **both** syllabaries with its
  rōmaji, and the same glyph in three typefaces (明朝 / ゴシック / 丸ゴシック —
  they really do differ, which is the point).
- **Seen-kanji browser** — grid of everything you've studied, sortable by
  most-failed, filterable to failed-only, with detail popups. From a popup
  you can remove a card from your deck entirely — it stops coming up for
  review (on every device) until you learn it fresh again.
- **Practice mode** — freely flip through your failed kanji between days
  without touching the schedule.
- **Infinite mode** — keep drawing capped-out reviews and extra new cards
  after the daily deck is done.
- **Accounts & sync** — username/password accounts (scrypt-hashed, session
  tokens, SQLite); progress and preferences sync across devices, with
  localStorage keeping everything usable offline.
- **Admin dashboard** — user counts, daily visits, active users, and user
  removal, for usernames listed in `KANJI_ADMINS`.

## Running

Requires Node 24+ (the backend uses the built-in `node:sqlite`).

```sh
npm install

# development: vite (port 5173) + API server (port 8034, proxied under /api)
npm run server &
npm run dev

# production: build once, serve app + API from one port
npm run start          # http://localhost:52654
```

### Single-file production build

```sh
make build             # -> build/kanji-server.mjs (frontend embedded)
make run               # build + run          [PORT=52654] [KANJI_ADMINS=name]
```

`build/kanji-server.mjs` is fully self-contained — copy it anywhere and run
`node kanji-server.mjs`; it creates its SQLite database in `./data` next to
itself (override with `KANJI_DATA=/path`).

### Docker

```sh
docker compose up -d                    # http://localhost:52654
KANJI_ADMINS=alice docker compose up -d # with an admin account
```

Or without compose: `make docker && docker run -p 52654:52654 -v kanji-data:/data kanji-flashcard`.
User data persists in the `kanji-data` volume.

### Admin dashboard

Set `KANJI_ADMINS` to a comma-separated list of usernames before starting
the server (e.g. `KANJI_ADMINS=alice make run`). Those users get an *admin*
entry in the settings sheet showing total users, daily visits, active users
for the last 14 days, and per-user stats with a delete action.

To use it from other devices on your LAN, expose the dev server with
`npm run dev -- --host` (or just use `npm run start`, which binds normally).
Note that traffic is plain HTTP — fine for a home network, but put it behind
HTTPS before exposing it further.

User data lives in `server/data/kanji.db` (gitignored).

## Keyboard shortcuts

| key | action |
| --- | --- |
| `space` | flip card |
| `2` | ✓ know it |
| `1` | ✗ don't know |
| `→` | skip / next |
| `esc` | back to lesson / close menu |

During the typing test the input takes the keyboard: `enter` submits your
answer, and the shortcuts above are suspended so a stray key cannot grade the
card (`esc` still works).

## Development

```sh
npm test               # vitest: scheduler, API, and UI suites
npm run test:watch
```

CI (GitHub Actions) builds and runs the full suite on every push and PR.

- `src/lesson.js` — scheduling: intervals, lapses, daily deck generation
- `src/Study.jsx` — main screen state: sync, day queue, views
- `server/app.js` — Express API (`createApp(dbPath)`, tested in-memory)
- `test/` — scheduler, server, and UI tests

### Contributor & agent docs

Architecture, invariants, and the commands live under `docs/`:

- [`AGENTS.md`](AGENTS.md) — root instructions for coding agents (Claude Code,
  Codex); `CLAUDE.md` symlinks to it.
- [`docs/code_docs/README.md`](docs/code_docs/README.md) — system map and the
  per-part architecture docs.
- [`docs/code_docs/build.md`](docs/code_docs/build.md) — authoritative commands
  and verified status; [`invariants.md`](docs/code_docs/invariants.md) — the
  `INV-*` contract catalog (`npm run check` enforces the structural ones).
- [`docs/TRICKY_ISSUES.md`](docs/TRICKY_ISSUES.md) — durable friction log
  (incl. the Node 26 `localStorage` test caveat — the full UI suite needs
  Node 24, which CI uses).

> **Running tests locally on Node ≥ 26?** The jsdom UI suite fails on a Node 26
> quirk, not a real bug. Use `npm test -- test/lesson.test.js test/server.test.js`
> or run the full suite on Node 24. See `docs/TRICKY_ISSUES.md`.

## Data sources

- Kanji list: [Wikipedia — List of jōyō kanji](https://en.wikipedia.org/wiki/List_of_j%C5%8Dy%C5%8D_kanji)
- Example words: [kanjiapi.dev](https://kanjiapi.dev) (JMdict/KANJIDIC2 via
  the [EDRDG](https://www.edrdg.org/), CC BY-SA)
