# Tricky Issues

Durable log of non-obvious engineering friction. **Newest first.** Update the
matching root cause rather than adding a duplicate; when an issue is resolved,
move it to "Resolved" with the fix — do not delete its history. Record only
verified facts (commands, versions, observed output).

---

## Node 26 native `localStorage` global breaks the jsdom UI suite

- **Status:** Open (environment issue; code is correct).
- **First observed:** 2026-07-20, Node v26.3.0, vitest 4.1.10, jsdom 29.1.1.
- **Symptom:** all 15 tests in `test/ui.test.jsx` fail at
  `localStorage.clear()` in `beforeEach` with
  `TypeError: Cannot read properties of undefined (reading 'clear')`, alongside
  the warning: `ExperimentalWarning: localStorage is not available because
  --localstorage-file was not provided`. The scheduler and server suites
  (`test/lesson.test.js`, `test/server.test.js`, Node environment) pass — 47/47.

- **Root cause:** Node 26 ships a **native experimental `localStorage`**
  global. It exists on `globalThis` but evaluates to `undefined` unless the
  process is started with `--localstorage-file`. Verified:
  ```
  $ node -e "console.log('localStorage' in globalThis, typeof localStorage)"
  true undefined
  ```
  In the jsdom test environment this native global shadows the `window.localStorage`
  jsdom would otherwise provide, so the app's `localStorage.getItem/setItem`
  calls hit `undefined`. On **Node 24** (CI's pinned version) there is no native
  `localStorage`, jsdom's wins, and the suite passes — which is why CI is green.

- **Impact:** local `npm test` on Node ≥ 26 shows 15 red UI tests that are not
  real regressions. Do not "fix" the app in response to them.

- **Workarounds:**
  - Run only the unaffected suites on Node 26:
    `npm test -- test/lesson.test.js test/server.test.js`.
  - Run the full suite on Node 24 (matches CI): e.g.
    `nvm use 24 && npm test` where Node 24 is available.

- **Candidate fixes (not applied — decide deliberately):**
  1. In a Vitest setup file, explicitly install jsdom's storage onto the global
     before each test (e.g. re-assign `globalThis.localStorage =
     window.localStorage`), so it wins over the native shim.
  2. Pass `--localstorage-file` via `NODE_OPTIONS` for the test run so the
     native global becomes a working `Storage` (changes semantics — jsdom reset
     between tests would need re-checking).
  3. Pin the test toolchain / document Node 24 as the supported test runtime
     (already the CI reality; `README.md` says "Node 24+").

- **Why not auto-fixed here:** the task was repository setup, not a code change;
  the correct fix is a product decision (which of the above), and the suite is
  green on the supported runtime. Logged so the next contributor is not misled
  by the red locally.

- **See also:** [`code_docs/build.md`](code_docs/build.md) § Node 26 test
  caveat; `AGENTS.md` § Footguns.

---

# Resolved

## Auto cross-axis margin collapsed the flashcard to 0px on desktop viewports

- **Status:** Resolved 2026-07-20 (fix in `src/index.css`, desktop media query).
- **First observed:** 2026-07-20; present since the original app rewrite
  (`e874d6c`, which introduced the media query). Went unnoticed because the app
  was used on phones, where the query never matches.
- **Symptom:** on viewports ≥ 520px wide **and** ≥ 800px tall (any normal
  desktop window), the flashcard did not render at all and the topbar/action
  buttons bunched up mid-screen. Phones (query doesn't match) were unaffected,
  so mobile looked fine while desktop looked broken.
- **Root cause:** the large-screen media query set `margin: auto 0` on
  `.card-scene` to center it vertically inside `.stage` (a flex row). Per the
  flexbox spec, an **auto cross-axis margin disables `align-items: stretch`**,
  so the item's height falls back to its content height — and `.card`'s two
  faces are `position: absolute` (for the 3-D flip), contributing **zero**
  content height. Net height: 0px, card invisible. The old `max-height: 680px`
  only ever capped a height that no longer existed.
- **Fix:** give `.card-scene` a definite height in the media query instead of
  relying on stretch: `height: min(680px, 100%)` (100% resolves because
  `.stage` gets a definite height from the `.app` flex column at `100dvh`).
  Verified in the rebuilt Docker image: the served minified CSS contains
  `card-scene{height:min(680px,100%);margin:auto 0}`.
- **Lesson:** jsdom tests cannot catch this class of bug — there is no layout
  engine, so a 0-height element still "renders" in tests. Layout changes need
  an eyeball on both a phone-sized and a desktop-sized viewport.
