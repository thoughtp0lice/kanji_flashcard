// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import App from "../src/App.jsx";
import { mergeStats } from "../src/Study.jsx";
import { addDays, todayStr } from "../src/lesson.js";
import { KANA } from "../src/kana.js";

// minimal fake backend: routes the app's fetches against an in-memory state
function mockServer({ state = {}, loginStatus = 200, overview = null } = {}) {
  const calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, opts = {}) => {
      calls.push({ url, opts });
      const respond = (data, status = 200) => ({
        ok: status < 400,
        status,
        json: async () => data,
      });
      const method = opts.method || "GET";
      if (url === "/api/login" || url === "/api/register") {
        if (loginStatus !== 200) {
          return respond({ error: "wrong password" }, loginStatus);
        }
        return respond({
          token: "tok123",
          username: JSON.parse(opts.body).username,
        });
      }
      if (url === "/api/logout") return respond({ ok: true });
      if (url === "/api/admin/overview") {
        return overview ? respond(overview) : respond({ error: "not an admin" }, 403);
      }
      if (url.startsWith("/api/admin/users/") && method === "DELETE") {
        return respond({ ok: true });
      }
      if (url === "/api/state" && method === "GET") return respond(state);
      if (url === "/api/state" && method === "PUT")
        return respond(JSON.parse(opts.body));
      return respond({ error: "unknown route" }, 404);
    })
  );
  return calls;
}

function loggedIn() {
  localStorage.setItem("joyo-kanji-user", "tester");
  localStorage.setItem("joyo-kanji-token", "tok123");
}

const PLAN = { mode: "kanji", startGrade: "1", newPerDay: 2, reviewLimit: 5 };

beforeEach(() => {
  localStorage.clear();
  // view navigation pushes real URLs; reset so tests don't leak paths
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("login screen", () => {
  it("disables the button until username and password are valid", async () => {
    mockServer();
    render(<App />);
    const btn = screen.getByRole("button", { name: "log in" });
    expect(btn).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText("username"), "tester");
    expect(btn).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText("password"), "sekret");
    expect(btn).toBeEnabled();
  });

  it("logs in, stores the session, and proceeds to setup", async () => {
    const calls = mockServer();
    render(<App />);
    await userEvent.type(screen.getByPlaceholderText("username"), "Tester "); // normalized
    await userEvent.type(screen.getByPlaceholderText("password"), "sekret");
    await userEvent.click(screen.getByRole("button", { name: "log in" }));
    expect(await screen.findByText(/where do you want to start/)).toBeInTheDocument();
    expect(localStorage.getItem("joyo-kanji-user")).toBe("tester");
    expect(localStorage.getItem("joyo-kanji-token")).toBe("tok123");
    const login = calls.find((c) => c.url === "/api/login");
    expect(JSON.parse(login.opts.body)).toEqual({
      username: "tester",
      password: "sekret",
    });
  });

  it("shows the server's error on failed login", async () => {
    mockServer({ loginStatus: 401 });
    render(<App />);
    await userEvent.type(screen.getByPlaceholderText("username"), "tester");
    await userEvent.type(screen.getByPlaceholderText("password"), "sekret");
    await userEvent.click(screen.getByRole("button", { name: "log in" }));
    expect(await screen.findByText("wrong password")).toBeInTheDocument();
  });

  it("toggles to account creation and calls /api/register", async () => {
    const calls = mockServer();
    render(<App />);
    await userEvent.click(screen.getByText(/create an account/));
    await userEvent.type(screen.getByPlaceholderText("username"), "newbie");
    await userEvent.type(screen.getByPlaceholderText("password"), "sekret");
    await userEvent.click(screen.getByRole("button", { name: "create account" }));
    await screen.findByText(/where do you want to start/);
    expect(calls.some((c) => c.url === "/api/register")).toBe(true);
  });

  it("returns to login when the stored session is rejected", async () => {
    loggedIn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }))
    );
    render(<App />);
    expect(await screen.findByPlaceholderText("password")).toBeInTheDocument();
  });
});

describe("setup", () => {
  it("saves a plan and starts the first lesson", async () => {
    loggedIn();
    mockServer();
    render(<App />);
    await screen.findByText(/where do you want to start/);
    await userEvent.click(screen.getByRole("button", { name: /Grade 2/ }));
    await userEvent.click(screen.getByRole("button", { name: "start learning" }));
    // a card with ✓ / ✗ appears
    expect(await screen.findByLabelText("I know this")).toBeInTheDocument();
    const prefs = JSON.parse(localStorage.getItem("joyo-kanji-prefs:tester"));
    expect(prefs.startGrade).toBe("2");
  });
});

describe("level 0 (kana)", () => {
  const KANA_PLAN = { mode: "kanji", startGrade: "0", newPerDay: 1, reviewLimit: 5 };

  it("starts a kana-only deck when level 0 is chosen", async () => {
    loggedIn();
    mockServer();
    render(<App />);
    await screen.findByText(/where do you want to start/);
    await userEvent.click(screen.getByRole("button", { name: /Level 0/ }));
    expect(screen.getByText(/No kanji appears until you know every one/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "start learning" }));
    expect(await screen.findByLabelText("I know this")).toBeInTheDocument();

    const prefs = JSON.parse(localStorage.getItem("joyo-kanji-prefs:tester"));
    expect(prefs.startGrade).toBe("0");
    const day = JSON.parse(localStorage.getItem("joyo-kanji-day:tester"));
    const kanaIds = new Set(KANA.map((k) => k.id));
    expect(day.queue.length).toBeGreaterThan(0);
    expect(day.queue.every((id) => kanaIds.has(id))).toBe(true);
  });

  it("gives the kana back its own two rows: pair + rōmaji, then typefaces", async () => {
    loggedIn();
    mockServer({ state: { prefs: KANA_PLAN } });
    render(<App />);
    await screen.findByLabelText("I know this");
    // the chart is taught in order, so the first card is あ
    expect(document.querySelector(".kanji-main").textContent).toBe("あ");
    await userEvent.click(screen.getByLabelText("Flashcard — tap to flip"));

    // row 1 — both scripts side by side, then the rōmaji
    const pair = document.querySelector(".kana-pair");
    expect([...pair.querySelectorAll(".kana-glyph")].map((e) => e.textContent))
      .toEqual(["あ", "ア"]);
    expect([...pair.querySelectorAll(".kana-script")].map((e) => e.textContent))
      .toEqual(["hiragana", "katakana"]);
    expect(pair.querySelector(".kana-romaji").textContent).toBe("a");

    // row 2 — the same glyph in three typefaces
    const faces = document.querySelectorAll(".kana-faces .face-cell");
    expect(faces).toHaveLength(3);
    for (const f of faces) {
      expect(f.querySelector(".face-glyph").textContent).toBe("あ");
    }

    // no example words on a kana card, and none of the kanji-only furniture
    expect(document.querySelector(".examples")).toBeNull();
    expect(document.querySelector(".back-meta")).toBeNull();
    expect(document.body.textContent).not.toMatch(/strokes|radical/);
  });
});

describe("daily lesson", () => {
  it("runs a full day: check shows the answer, confirming advances", async () => {
    loggedIn();
    mockServer({ state: { prefs: PLAN } });
    render(<App />);
    const check = await screen.findByLabelText("I know this");
    expect(screen.getByText("1 / 2 today")).toBeInTheDocument();
    await userEvent.click(check);
    // answer side shows first — nothing recorded yet
    expect(JSON.parse(localStorage.getItem("joyo-kanji-stats:tester") || "{}")).toEqual({});
    await userEvent.click(await screen.findByRole("button", { name: "✓ next" }));
    expect(await screen.findByText("2 / 2 today")).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("I know this"));
    // the flip-back animation delays the content swap; wait for the buttons
    await userEvent.click(await screen.findByRole("button", { name: "✓ next" }));
    expect(await screen.findByText(/done for today/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /keep going/ })).toBeInTheDocument();
    // both cards recorded as seen with SRS scheduling
    const stats = JSON.parse(localStorage.getItem("joyo-kanji-stats:tester"));
    const entries = Object.values(stats);
    expect(entries).toHaveLength(2);
    for (const st of entries) expect(st.interval).toBe(4);
  });

  it("check then 'actually no' records a fail instead", async () => {
    loggedIn();
    mockServer({ state: { prefs: PLAN } });
    render(<App />);
    await userEvent.click(await screen.findByLabelText("I know this"));
    await userEvent.click(screen.getByRole("button", { name: "✕ actually no" }));
    const stats = JSON.parse(localStorage.getItem("joyo-kanji-stats:tester"));
    const st = Object.values(stats)[0];
    expect(st.fails[todayStr()]).toBe(1);
    // still on the answer side, ready to study, with the plain next button
    expect(screen.getByRole("button", { name: "next →" })).toBeInTheDocument();
    // card was not counted as done
    expect(screen.getByText("1 / 2 today")).toBeInTheDocument();
  });

  it("flipping the card manually still lets you grade it", async () => {
    loggedIn();
    mockServer({ state: { prefs: PLAN } });
    render(<App />);
    await screen.findByLabelText("I know this");
    await userEvent.click(screen.getByLabelText("Flashcard — tap to flip"));
    // peeking records nothing until a choice is made
    expect(JSON.parse(localStorage.getItem("joyo-kanji-stats:tester") || "{}")).toEqual({});
    await userEvent.click(await screen.findByRole("button", { name: "✓ knew it" }));
    expect(await screen.findByText("2 / 2 today")).toBeInTheDocument();
    // second card: peek then "didn't know" records the fail and keeps studying
    await userEvent.click(screen.getByLabelText("Flashcard — tap to flip"));
    await userEvent.click(await screen.findByRole("button", { name: "✕ didn't know" }));
    const stats = JSON.parse(localStorage.getItem("joyo-kanji-stats:tester"));
    expect(Object.values(stats).some((st) => st.fails[todayStr()] === 1)).toBe(true);
    expect(screen.getByRole("button", { name: "next →" })).toBeInTheDocument();
    expect(screen.getByText("2 / 2 today")).toBeInTheDocument();
  });

  it("cross flips the card to details and records the fail", async () => {
    loggedIn();
    mockServer({ state: { prefs: PLAN } });
    render(<App />);
    await userEvent.click(await screen.findByLabelText("Don't know"));
    // back side: next button visible, fail recorded for today
    expect(screen.getByRole("button", { name: /next/ })).toBeInTheDocument();
    const stats = JSON.parse(localStorage.getItem("joyo-kanji-stats:tester"));
    const st = Object.values(stats)[0];
    expect(st.fails[todayStr()]).toBe(1);
    expect(st.due).toBeDefined();
  });

  it("keep going ∞ refills the queue", async () => {
    loggedIn();
    mockServer({ state: { prefs: PLAN } });
    render(<App />);
    for (let i = 0; i < 2; i++) {
      await userEvent.click(await screen.findByLabelText("I know this"));
      await userEvent.click(await screen.findByRole("button", { name: "✓ next" }));
    }
    await userEvent.click(await screen.findByRole("button", { name: /keep going/ }));
    expect(await screen.findByLabelText("I know this")).toBeInTheDocument();
    expect(screen.getByText(/stop ∞/)).toBeInTheDocument();
  });
});

describe("desktop layout", () => {
  // jsdom has no matchMedia, so Flashcard defaults to the mobile DOM in every
  // other test; stubbing it wide moves the controls into the bar below the card
  const stubDesktop = () =>
    vi.stubGlobal("matchMedia", (query) => ({
      matches: query === "(min-width: 900px)",
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));

  it("moves the controls out of the card into the control bar", async () => {
    stubDesktop();
    loggedIn();
    mockServer({ state: { prefs: PLAN } });
    const { container } = render(<App />);
    const check = await screen.findByLabelText("I know this");
    const bar = container.querySelector(".control-bar");
    expect(bar).toContainElement(check);
    expect(bar).toContainElement(screen.getByLabelText("Don't know"));
    // no in-card action bars on desktop
    expect(container.querySelector(".card .front-actions")).toBeNull();
    expect(container.querySelector(".card .back-actions")).toBeNull();
    // check → confirm still advances the day from the bar
    await userEvent.click(check);
    await userEvent.click(await screen.findByRole("button", { name: "✓ next" }));
    expect(await screen.findByText("2 / 2 today")).toBeInTheDocument();
  });
});

describe("view URLs", () => {
  it("tracks the view in the URL and follows browser navigation", async () => {
    loggedIn();
    mockServer({ state: { prefs: PLAN } });
    render(<App />);
    await screen.findByLabelText("I know this");
    expect(window.location.pathname).toBe("/");
    await userEvent.click(screen.getByLabelText("Seen kanji"));
    expect(window.location.pathname).toBe("/deck");
    expect(await screen.findByText(/seen$/)).toBeInTheDocument();
    // browser back → popstate returns to the lesson
    act(() => {
      window.history.replaceState(null, "", "/");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(await screen.findByLabelText("I know this")).toBeInTheDocument();
  });

  it("deep links straight into a view from the URL", async () => {
    window.history.replaceState(null, "", "/practice");
    loggedIn();
    mockServer({ state: { prefs: PLAN } });
    render(<App />);
    expect(await screen.findByText(/no failed kanji to practice/)).toBeInTheDocument();
    expect(window.location.pathname).toBe("/practice");
  });

  it("redirects a non-admin deep link to /admin back to the lesson", async () => {
    window.history.replaceState(null, "", "/admin");
    loggedIn();
    mockServer({ state: { prefs: PLAN } });
    render(<App />);
    expect(await screen.findByLabelText("I know this")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/");
  });
});

describe("admin dashboard", () => {
  const overview = {
    totalUsers: 2,
    activeToday: 1,
    visitsToday: 3,
    byDay: [{ date: "2026-07-20", visits: 3, active: 1 }],
    users: [
      { username: "tester", created: "2026-07-01", lastSeen: "2026-07-20", seen: 5, known: 2, admin: true },
      { username: "mortal", created: "2026-07-02", lastSeen: null, seen: 0, known: 0, admin: false },
    ],
  };

  it("hides the admin entry for regular users", async () => {
    loggedIn();
    mockServer({ state: { prefs: PLAN } });
    render(<App />);
    await screen.findByLabelText("I know this");
    await userEvent.click(screen.getByLabelText("Settings"));
    expect(screen.queryByRole("button", { name: "admin" })).not.toBeInTheDocument();
  });

  it("shows stats and users, and deletes a user", async () => {
    loggedIn();
    localStorage.setItem("joyo-kanji-admin", "1");
    const calls = mockServer({ state: { prefs: PLAN }, overview });
    vi.stubGlobal("confirm", vi.fn(() => true));
    render(<App />);
    await screen.findByLabelText("I know this");
    await userEvent.click(screen.getByLabelText("Settings"));
    await userEvent.click(screen.getByRole("button", { name: "admin" }));
    expect(await screen.findByText("visits today")).toBeInTheDocument();
    expect(screen.getByText("mortal")).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Delete mortal"));
    expect(
      calls.some(
        (c) => c.url === "/api/admin/users/mortal" && c.opts.method === "DELETE"
      )
    ).toBe(true);
  });

  it("tracks /admin in the URL and the home button returns to the lesson", async () => {
    loggedIn();
    localStorage.setItem("joyo-kanji-admin", "1");
    mockServer({ state: { prefs: PLAN }, overview });
    render(<App />);
    await screen.findByLabelText("I know this");
    await userEvent.click(screen.getByLabelText("Settings"));
    await userEvent.click(screen.getByRole("button", { name: "admin" }));
    expect(await screen.findByText("visits today")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/admin");
    await userEvent.click(screen.getByLabelText("Home"));
    expect(window.location.pathname).toBe("/");
    expect(await screen.findByLabelText("I know this")).toBeInTheDocument();
  });
});

describe("typing test", () => {
  const KANA_PLAN = { mode: "kanji", startGrade: "0", newPerDay: 2, reviewLimit: 5 };
  const typeInto = async (text) => {
    const input = await screen.findByLabelText("Type the reading in rōmaji");
    await userEvent.type(input, text);
    return input;
  };

  it("swaps ✓ for an input, and a correct reading advances the card", async () => {
    loggedIn();
    mockServer({ state: { prefs: { ...KANA_PLAN, typing: "kana" } } });
    render(<App />);
    await userEvent.click(await screen.findByLabelText("I know this"));

    // the answer is NOT shown — the glyph is the whole prompt (the deck is
    // shuffled, so read which kana came up rather than assuming one)
    const glyph = document.querySelector(".kanji-main").textContent;
    const shown = KANA.find((k) => k.kanji === glyph);
    expect(shown).toBeDefined();
    expect(document.querySelector(".card-zone").className).toContain("typing");
    // the card has not flipped, so the answer face stays turned away
    expect(document.querySelector(".card").className).not.toContain("flipped");
    expect(screen.getByText("1 / 2 today")).toBeInTheDocument();
    // nothing recorded until the answer is submitted
    expect(JSON.parse(localStorage.getItem("joyo-kanji-stats:tester") || "{}")).toEqual({});

    await typeInto(shown.romaji);
    await userEvent.click(screen.getByRole("button", { name: "check" }));

    // straight to the next card, graded as a pass
    expect(await screen.findByText("2 / 2 today")).toBeInTheDocument();
    const stats = JSON.parse(localStorage.getItem("joyo-kanji-stats:tester"));
    const st = Object.values(stats)[0];
    expect(st.interval).toBe(4);
    expect(st.fails).toEqual({});
  });

  it("records a miss and shows the answer when the reading is wrong", async () => {
    loggedIn();
    mockServer({ state: { prefs: { ...KANA_PLAN, typing: "kana" } } });
    render(<App />);
    await userEvent.click(await screen.findByLabelText("I know this"));
    await typeInto("zzz");
    await userEvent.click(screen.getByRole("button", { name: "check" }));

    const stats = JSON.parse(localStorage.getItem("joyo-kanji-stats:tester"));
    expect(Object.values(stats)[0].fails[todayStr()]).toBe(1);
    // flipped to the answer to study, card not counted as done
    expect(await screen.findByRole("button", { name: "next →" })).toBeInTheDocument();
    expect(screen.getByText("1 / 2 today")).toBeInTheDocument();
    expect(document.querySelector(".card").className).toContain("flipped");
    expect(screen.queryByLabelText("Type the reading in rōmaji")).toBeNull();
  });

  it("accepts alternative romanizations and ignores case", async () => {
    loggedIn();
    // し is the 12th hiragana; start the deck there by marking the first 11 known
    mockServer({
      state: {
        prefs: { ...KANA_PLAN, typing: "kana", newPerDay: 1 },
        known: KANA.slice(0, 11).map((k) => k.id),
      },
    });
    render(<App />);
    await userEvent.click(await screen.findByLabelText("I know this"));
    expect(document.querySelector(".kanji-main").textContent).toBe("し");
    await typeInto("SI"); // kunrei rather than Hepburn "shi"
    await userEvent.click(screen.getByRole("button", { name: "check" }));

    const stats = JSON.parse(localStorage.getItem("joyo-kanji-stats:tester"));
    expect(Object.values(stats)[0].interval).toBe(4);
  });

  it("does not prompt for typing when the setting is off", async () => {
    loggedIn();
    mockServer({ state: { prefs: { ...KANA_PLAN, typing: "off" } } });
    render(<App />);
    await userEvent.click(await screen.findByLabelText("I know this"));
    // straight to the old self-graded flow
    expect(await screen.findByRole("button", { name: "✓ next" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Type the reading in rōmaji")).toBeNull();
  });

  it("asks for kana instead of rōmaji when kanji input is set to kana", async () => {
    loggedIn();
    mockServer({
      state: { prefs: { ...PLAN, typing: "all", kanjiInput: "kana" } },
    });
    render(<App />);
    await userEvent.click(await screen.findByLabelText("I know this"));
    expect(await screen.findByLabelText("Type the reading in kana")).toBeInTheDocument();
    expect(screen.queryByLabelText("Type the reading in rōmaji")).toBeNull();
  });
});

describe("plan change", () => {
  it("rebuilds today's deck under the new plan, keeping done cards", async () => {
    const today = todayStr();
    loggedIn();
    // a stale deck queues cards that are no longer due (built under an
    // accidentally-selected plan); id 8 is already done today
    mockServer({
      state: {
        prefs: PLAN,
        stats: {
          4: { seen: "2026-07-10", fails: {}, interval: 100, due: "2099-01-01" },
          6: { seen: "2026-07-11", fails: {}, interval: 100, due: "2099-01-01" },
          8: { seen: today, fails: {}, interval: 4, due: addDays(today, 4) },
        },
        days: { [today]: { date: today, queue: [4, 6], done: [8] } },
      },
    });
    render(<App />);
    await screen.findByLabelText("I know this");
    await userEvent.click(screen.getByLabelText("Settings"));
    await userEvent.click(screen.getByText(/2 new · 5 rev/));
    await userEvent.click(await screen.findByRole("button", { name: "save" }));
    const day = JSON.parse(localStorage.getItem("joyo-kanji-day:tester"));
    // the stale, not-due cards are gone; fresh new cards replace them
    expect(day.queue).not.toContain(4);
    expect(day.queue).not.toContain(6);
    expect(day.queue).toHaveLength(2);
    expect(day.done).toEqual([8]);
  });

  // regression: same-day retries were carried over unconditionally, so a
  // kanji missed earlier today survived the switch into the kana-only deck
  it("drops carried-over kanji retries when switching to level 0", async () => {
    const today = todayStr();
    loggedIn();
    mockServer({
      state: {
        prefs: PLAN,
        // kanji 4 was failed earlier today, so it is owed a same-day retry
        stats: { 4: { seen: today, fails: { [today]: 1 }, interval: 1, due: addDays(today, 1) } },
        days: { [today]: { date: today, queue: [4], done: [] } },
      },
    });
    render(<App />);
    await screen.findByLabelText("I know this");
    await userEvent.click(screen.getByLabelText("Settings"));
    await userEvent.click(screen.getByText(/2 new · 5 rev/));
    await userEvent.click(await screen.findByRole("button", { name: /Level 0/ }));
    await userEvent.click(await screen.findByRole("button", { name: "save" }));

    const day = JSON.parse(localStorage.getItem("joyo-kanji-day:tester"));
    const kanaIds = new Set(KANA.map((k) => k.id));
    expect(day.queue).not.toContain(4);
    expect(day.queue.length).toBeGreaterThan(0);
    expect(day.queue.every((id) => kanaIds.has(id))).toBe(true);
  });
});

describe("mergeStats", () => {
  const D = "2026-07-15";
  const live = (over = {}) => ({
    seen: "2026-07-01",
    fails: { "2026-07-10": 1 },
    interval: 3,
    due: "2026-07-18",
    ...over,
  });

  it("keeps the standard union for live entries", () => {
    const local = { 1: live({ fails: { "2026-07-10": 2 }, due: "2026-07-20", interval: 8 }) };
    const server = { 1: live({ seen: "2026-06-20" }) };
    const out = mergeStats(local, server);
    expect(out[1]).toEqual({
      seen: "2026-06-20",
      fails: { "2026-07-10": 2 },
      interval: 8,
      due: "2026-07-20",
    });
  });

  it("lets a removal tombstone beat stale live state on either side", () => {
    // the live copies' last activity is on/before the removal date
    expect(mergeStats({ 1: { removed: D } }, { 1: live() })[1]).toEqual({ removed: D });
    expect(mergeStats({ 1: live() }, { 1: { removed: D } })[1]).toEqual({ removed: D });
    // same-day activity still loses: removal is the deliberate act
    expect(
      mergeStats({ 1: { removed: D } }, { 1: live({ fails: { [D]: 1 } }) })[1]
    ).toEqual({ removed: D });
  });

  it("revives a card re-learned after its removal", () => {
    const relearned = live({ seen: "2026-07-16", fails: {} });
    expect(mergeStats({ 1: { removed: D } }, { 1: relearned })[1]).toEqual(relearned);
    expect(mergeStats({ 1: relearned }, { 1: { removed: D } })[1]).toEqual(relearned);
  });

  it("keeps the later of two tombstones", () => {
    const out = mergeStats({ 1: { removed: "2026-07-12" } }, { 1: { removed: D } });
    expect(out[1]).toEqual({ removed: D });
  });
});

describe("seen deck and practice", () => {
  const seenState = {
    prefs: PLAN,
    stats: {
      4: { seen: "2026-07-10", fails: { "2026-07-15": 2 }, interval: 1, due: "2099-01-01" },
      6: { seen: "2026-07-11", fails: {}, interval: 4, due: "2099-01-01" },
    },
    known: [6],
  };

  it("lists seen kanji with fail badges and filters to failed only", async () => {
    loggedIn();
    mockServer({ state: seenState });
    render(<App />);
    await screen.findByLabelText("I know this");
    await userEvent.click(screen.getByLabelText("Seen kanji"));
    expect(await screen.findByText("2 seen")).toBeInTheDocument();
    expect(screen.getByText("愛")).toBeInTheDocument(); // id 4
    expect(screen.getByText("悪")).toBeInTheDocument(); // id 6
    expect(screen.getByText("×2")).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("failed only"));
    expect(screen.queryByText("悪")).not.toBeInTheDocument();
    expect(screen.getByText("愛")).toBeInTheDocument();
  });

  it("opens a detail modal with example words", async () => {
    loggedIn();
    mockServer({ state: seenState });
    render(<App />);
    await screen.findByLabelText("I know this");
    await userEvent.click(screen.getByLabelText("Seen kanji"));
    await userEvent.click(await screen.findByText("愛"));
    expect(await screen.findByText("love")).toBeInTheDocument();
    expect(screen.getByText("愛読")).toBeInTheDocument(); // example word
  });

  it("removes a card from the deck with a synced tombstone", async () => {
    const today = todayStr();
    loggedIn();
    vi.stubGlobal("confirm", vi.fn(() => true));
    mockServer({
      state: {
        prefs: PLAN,
        stats: {
          4: { seen: "2026-07-10", fails: { "2026-07-15": 2 }, interval: 1, due: today },
          6: { seen: "2026-07-11", fails: {}, interval: 4, due: "2099-01-01" },
        },
        known: [6],
        days: { [today]: { date: today, queue: [4], done: [] } },
      },
    });
    render(<App />);
    await screen.findByLabelText("I know this"); // 愛 (id 4) is queued today
    await userEvent.click(screen.getByLabelText("Seen kanji"));
    expect(await screen.findByText("2 seen")).toBeInTheDocument();
    await userEvent.click(screen.getByText("愛"));
    await userEvent.click(await screen.findByRole("button", { name: "remove from deck" }));
    // gone from the grid and the counter
    expect(screen.queryByText("愛")).not.toBeInTheDocument();
    expect(screen.getByText("1 seen")).toBeInTheDocument();
    // a dated tombstone replaces the stats and today's queue drops the card
    const stats = JSON.parse(localStorage.getItem("joyo-kanji-stats:tester"));
    expect(stats[4]).toEqual({ removed: today });
    const day = JSON.parse(localStorage.getItem("joyo-kanji-day:tester"));
    expect(day.queue).not.toContain(4);
    // removing a known card also forgets it
    await userEvent.click(screen.getByText("悪"));
    await userEvent.click(await screen.findByRole("button", { name: "remove from deck" }));
    expect(JSON.parse(localStorage.getItem("joyo-kanji-known:tester"))).toEqual([]);
  });

  it("practices failed kanji without touching the schedule", async () => {
    loggedIn();
    mockServer({ state: seenState });
    render(<App />);
    await screen.findByLabelText("I know this");
    await userEvent.click(screen.getByLabelText("Seen kanji"));
    await userEvent.click(await screen.findByText("practice ▶"));
    expect(await screen.findByText(/1 \/ 1 · failed ×2/)).toBeInTheDocument();
    // practice shows nav arrows, not ✓/✗
    expect(screen.queryByLabelText("I know this")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Next")).toBeInTheDocument();
    const before = seenState.stats[4].due;
    await userEvent.click(screen.getByLabelText("Next"));
    const stats = JSON.parse(localStorage.getItem("joyo-kanji-stats:tester"));
    expect(stats[4].due).toBe(before);
  });
});
