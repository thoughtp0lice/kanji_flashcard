// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import App from "../src/App.jsx";
import { todayStr } from "../src/lesson.js";

// minimal fake backend: routes the app's fetches against an in-memory state
function mockServer({ state = {}, loginStatus = 200 } = {}) {
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

describe("daily lesson", () => {
  it("runs a full day: check advances, finishing shows the done screen", async () => {
    loggedIn();
    mockServer({ state: { prefs: PLAN } });
    render(<App />);
    const check = await screen.findByLabelText("I know this");
    expect(screen.getByText("1 / 2 today")).toBeInTheDocument();
    await userEvent.click(check);
    expect(await screen.findByText("2 / 2 today")).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("I know this"));
    expect(await screen.findByText(/done for today/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /keep going/ })).toBeInTheDocument();
    // both cards recorded as seen with SRS scheduling
    const stats = JSON.parse(localStorage.getItem("joyo-kanji-stats:tester"));
    const entries = Object.values(stats);
    expect(entries).toHaveLength(2);
    for (const st of entries) expect(st.interval).toBe(4);
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
    await userEvent.click(await screen.findByLabelText("I know this"));
    await userEvent.click(await screen.findByLabelText("I know this"));
    await userEvent.click(await screen.findByRole("button", { name: /keep going/ }));
    expect(await screen.findByLabelText("I know this")).toBeInTheDocument();
    expect(screen.getByText(/stop ∞/)).toBeInTheDocument();
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
