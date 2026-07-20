import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../server/app.js";

let server;
let base;

function api(path, { method = "GET", token, body } = {}) {
  return fetch(`${base}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeAll(async () => {
  const app = createApp(":memory:");
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://localhost:${server.address().port}`;
});

afterAll(() => server?.close());

describe("register", () => {
  it("creates an account and returns a token", async () => {
    const res = await api("/api/register", {
      method: "POST",
      body: { username: "alice", password: "sekret" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.username).toBe("alice");
    expect(body.token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects duplicate usernames", async () => {
    const res = await api("/api/register", {
      method: "POST",
      body: { username: "alice", password: "other" },
    });
    expect(res.status).toBe(409);
  });

  it("rejects invalid usernames", async () => {
    for (const username of ["Bad Name", "ALICE", "", "a".repeat(33), "ハナ"]) {
      const res = await api("/api/register", {
        method: "POST",
        body: { username, password: "sekret" },
      });
      expect(res.status, `username: ${JSON.stringify(username)}`).toBe(400);
    }
  });

  it("rejects short and missing passwords", async () => {
    for (const password of ["abc", "", undefined, 1234]) {
      const res = await api("/api/register", {
        method: "POST",
        body: { username: "bob", password },
      });
      expect(res.status).toBe(400);
    }
  });
});

describe("login", () => {
  it("returns a fresh token for correct credentials", async () => {
    const res = await api("/api/login", {
      method: "POST",
      body: { username: "alice", password: "sekret" },
    });
    expect(res.status).toBe(200);
    expect((await res.json()).token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects a wrong password", async () => {
    const res = await api("/api/login", {
      method: "POST",
      body: { username: "alice", password: "wrong!" },
    });
    expect(res.status).toBe(401);
  });

  it("404s for unknown users", async () => {
    const res = await api("/api/login", {
      method: "POST",
      body: { username: "nobody", password: "sekret" },
    });
    expect(res.status).toBe(404);
  });
});

describe("state", () => {
  let token;

  beforeAll(async () => {
    const res = await api("/api/register", {
      method: "POST",
      body: { username: "carol", password: "sekret" },
    });
    token = (await res.json()).token;
  });

  it("requires auth", async () => {
    expect((await api("/api/state")).status).toBe(401);
    expect((await api("/api/state", { token: "bogus" })).status).toBe(401);
  });

  it("returns defaults for a new user", async () => {
    const res = await api("/api/state", { token });
    expect(await res.json()).toEqual({
      known: [],
      prefs: { mode: "kanji" },
      stats: {},
      days: {},
    });
  });

  it("replaces and dedupes known", async () => {
    const res = await api("/api/state", {
      method: "PUT",
      token,
      body: { known: [3, 1, 2, 3, 1] },
    });
    expect((await res.json()).known.sort()).toEqual([1, 2, 3]);
  });

  it("merges prefs shallowly", async () => {
    await api("/api/state", {
      method: "PUT",
      token,
      body: { prefs: { startGrade: "2" } },
    });
    const res = await api("/api/state", { token });
    const { prefs } = await res.json();
    expect(prefs).toEqual({ mode: "kanji", startGrade: "2" });
  });

  it("merges days per date instead of replacing", async () => {
    await api("/api/state", {
      method: "PUT",
      token,
      body: { days: { "2026-07-20": { date: "2026-07-20", queue: [1], done: [] } } },
    });
    await api("/api/state", {
      method: "PUT",
      token,
      body: { days: { "2026-07-21": { date: "2026-07-21", queue: [2], done: [] } } },
    });
    const { days } = await (await api("/api/state", { token })).json();
    expect(Object.keys(days).sort()).toEqual(["2026-07-20", "2026-07-21"]);
  });

  it("merges stats per kanji", async () => {
    await api("/api/state", {
      method: "PUT",
      token,
      body: { stats: { 1: { seen: "2026-07-20", fails: {} } } },
    });
    await api("/api/state", {
      method: "PUT",
      token,
      body: { stats: { 2: { seen: "2026-07-21", fails: {} } } },
    });
    const { stats } = await (await api("/api/state", { token })).json();
    expect(Object.keys(stats).sort()).toEqual(["1", "2"]);
  });

  it("validates payload shapes", async () => {
    const cases = [
      { known: "nope" },
      { known: [1, "2"] },
      { prefs: [1] },
      { stats: 5 },
      { days: null },
    ];
    for (const body of cases) {
      const res = await api("/api/state", { method: "PUT", token, body });
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });

  it("isolates users from each other", async () => {
    const res = await api("/api/register", {
      method: "POST",
      body: { username: "dave", password: "sekret" },
    });
    const daveToken = (await res.json()).token;
    const dave = await (await api("/api/state", { token: daveToken })).json();
    expect(dave.known).toEqual([]);
    expect(dave.prefs).toEqual({ mode: "kanji" });
  });
});

describe("admin", () => {
  let adminServer;
  let adminBase;
  let rootToken;
  let userToken;

  const adminApi = (path, opts = {}) => {
    const prev = base;
    base = adminBase;
    const p = api(path, opts);
    base = prev;
    return p;
  };

  beforeAll(async () => {
    const app = createApp(":memory:", { adminUsers: ["root"] });
    await new Promise((resolve) => {
      adminServer = app.listen(0, resolve);
    });
    adminBase = `http://localhost:${adminServer.address().port}`;
    const reg = await adminApi("/api/register", {
      method: "POST",
      body: { username: "root", password: "sekret" },
    });
    const rootBody = await reg.json();
    expect(rootBody.admin).toBe(true);
    rootToken = rootBody.token;
    const reg2 = await adminApi("/api/register", {
      method: "POST",
      body: { username: "mortal", password: "sekret" },
    });
    const mortalBody = await reg2.json();
    expect(mortalBody.admin).toBe(false);
    userToken = mortalBody.token;
  });

  afterAll(() => adminServer?.close());

  it("rejects non-admin and unauthenticated access", async () => {
    expect((await adminApi("/api/admin/overview")).status).toBe(401);
    expect((await adminApi("/api/admin/overview", { token: userToken })).status).toBe(403);
    expect(
      (await adminApi("/api/admin/users/mortal", { method: "DELETE", token: userToken }))
        .status
    ).toBe(403);
  });

  it("reports users, visits, and active counts", async () => {
    // two state loads by mortal, one by root -> 3 visits, 2 active today
    await adminApi("/api/state", { token: userToken });
    await adminApi("/api/state", { token: userToken });
    await adminApi("/api/state", { token: rootToken });
    const res = await adminApi("/api/admin/overview", { token: rootToken });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalUsers).toBe(2);
    expect(body.visitsToday).toBe(3);
    expect(body.activeToday).toBe(2);
    expect(body.byDay).toHaveLength(1);
    const mortal = body.users.find((u) => u.username === "mortal");
    expect(mortal.admin).toBe(false);
    expect(mortal.lastSeen).toBe(body.byDay[0].date);
    expect(body.users.find((u) => u.username === "root").admin).toBe(true);
  });

  it("refuses to delete yourself", async () => {
    const res = await adminApi("/api/admin/users/root", {
      method: "DELETE",
      token: rootToken,
    });
    expect(res.status).toBe(400);
  });

  it("404s deleting an unknown user", async () => {
    const res = await adminApi("/api/admin/users/ghost", {
      method: "DELETE",
      token: rootToken,
    });
    expect(res.status).toBe(404);
  });

  it("deletes a user and invalidates their session", async () => {
    const res = await adminApi("/api/admin/users/mortal", {
      method: "DELETE",
      token: rootToken,
    });
    expect(res.status).toBe(200);
    expect((await adminApi("/api/state", { token: userToken })).status).toBe(401);
    const overview = await (
      await adminApi("/api/admin/overview", { token: rootToken })
    ).json();
    expect(overview.totalUsers).toBe(1);
    expect(overview.users.some((u) => u.username === "mortal")).toBe(false);
  });
});

describe("logout", () => {
  it("invalidates the session token", async () => {
    const reg = await api("/api/register", {
      method: "POST",
      body: { username: "eve", password: "sekret" },
    });
    const { token } = await reg.json();
    expect((await api("/api/state", { token })).status).toBe(200);
    expect((await api("/api/logout", { method: "POST", token })).status).toBe(200);
    expect((await api("/api/state", { token })).status).toBe(401);
  });
});
