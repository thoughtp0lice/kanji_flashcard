import express from "express";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { DatabaseSync } from "node:sqlite";

const USERNAME_RE = /^[a-z0-9_-]{1,32}$/;

const DEFAULT_STATE = {
  known: [],
  prefs: { mode: "kanji" },
  stats: {}, // per-kanji SRS state: { seen, fails: {date: n}, interval, due }
  days: {}, // per-date lesson: { date, queue: [ids], done: [ids] }
};

const isObject = (x) => typeof x === "object" && x !== null && !Array.isArray(x);

export function createApp(dbPath, { adminUsers = [] } = {}) {
  const db = new DatabaseSync(dbPath);
  db.exec(`
    ${dbPath === ":memory:" ? "" : "PRAGMA journal_mode = WAL;"}
    CREATE TABLE IF NOT EXISTS users (
      username  TEXT PRIMARY KEY,
      pass_hash TEXT NOT NULL,
      salt      TEXT NOT NULL,
      created   TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS state (
      username TEXT PRIMARY KEY REFERENCES users(username),
      data     TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token    TEXT PRIMARY KEY,
      username TEXT NOT NULL REFERENCES users(username),
      created  TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS visits (
      username TEXT NOT NULL,
      date     TEXT NOT NULL,
      count    INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (username, date)
    );
  `);

  const q = {
    getUser: db.prepare("SELECT * FROM users WHERE username = ?"),
    addUser: db.prepare("INSERT INTO users VALUES (?, ?, ?, ?)"),
    getState: db.prepare("SELECT data FROM state WHERE username = ?"),
    putState: db.prepare(
      "INSERT INTO state VALUES (?, ?) ON CONFLICT(username) DO UPDATE SET data = excluded.data"
    ),
    addSession: db.prepare("INSERT INTO sessions VALUES (?, ?, ?)"),
    getSession: db.prepare("SELECT username FROM sessions WHERE token = ?"),
    delSession: db.prepare("DELETE FROM sessions WHERE token = ?"),
    addVisit: db.prepare(
      "INSERT INTO visits VALUES (?, ?, 1) ON CONFLICT(username, date) DO UPDATE SET count = count + 1"
    ),
    visitsByDay: db.prepare(
      "SELECT date, SUM(count) AS visits, COUNT(*) AS active FROM visits GROUP BY date ORDER BY date DESC LIMIT 14"
    ),
    allUsers: db.prepare("SELECT username, created FROM users ORDER BY created"),
    lastSeen: db.prepare("SELECT MAX(date) AS d FROM visits WHERE username = ?"),
    delUserSessions: db.prepare("DELETE FROM sessions WHERE username = ?"),
    delUserVisits: db.prepare("DELETE FROM visits WHERE username = ?"),
    delUserState: db.prepare("DELETE FROM state WHERE username = ?"),
    delUser: db.prepare("DELETE FROM users WHERE username = ?"),
  };

  const isAdmin = (username) => adminUsers.includes(username);
  const localDate = () => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  const hash = (password, salt) => scryptSync(password, salt, 64).toString("hex");

  function readState(username) {
    const row = q.getState.get(username);
    if (!row) return structuredClone(DEFAULT_STATE);
    return { ...structuredClone(DEFAULT_STATE), ...JSON.parse(row.data) };
  }

  const app = express();
  app.use(express.json({ limit: "2mb" }));

  function checkCredentials(req, res) {
    const { username, password } = req.body ?? {};
    if (typeof username !== "string" || !USERNAME_RE.test(username)) {
      res.status(400).json({ error: "invalid username" });
      return null;
    }
    if (typeof password !== "string" || password.length < 4) {
      res.status(400).json({ error: "password must be at least 4 characters" });
      return null;
    }
    return { username, password };
  }

  function issueToken(username) {
    const token = randomBytes(32).toString("hex");
    q.addSession.run(token, username, new Date().toISOString());
    return token;
  }

  app.post("/api/register", (req, res) => {
    const creds = checkCredentials(req, res);
    if (!creds) return;
    if (q.getUser.get(creds.username)) {
      return res.status(409).json({ error: "username already taken" });
    }
    const salt = randomBytes(16).toString("hex");
    q.addUser.run(
      creds.username,
      hash(creds.password, salt),
      salt,
      new Date().toISOString()
    );
    res.json({
      token: issueToken(creds.username),
      username: creds.username,
      admin: isAdmin(creds.username),
    });
  });

  app.post("/api/login", (req, res) => {
    const creds = checkCredentials(req, res);
    if (!creds) return;
    const user = q.getUser.get(creds.username);
    if (!user) return res.status(404).json({ error: "no such user" });
    const attempt = Buffer.from(hash(creds.password, user.salt), "hex");
    const stored = Buffer.from(user.pass_hash, "hex");
    if (!timingSafeEqual(attempt, stored)) {
      return res.status(401).json({ error: "wrong password" });
    }
    res.json({
      token: issueToken(creds.username),
      username: creds.username,
      admin: isAdmin(creds.username),
    });
  });

  // resolves the session token to a username for the routes below
  function auth(req, res, next) {
    const token = (req.headers.authorization || "").replace(/^Bearer /, "");
    const session = token && q.getSession.get(token);
    if (!session) return res.status(401).json({ error: "not logged in" });
    req.username = session.username;
    req.token = token;
    next();
  }

  app.post("/api/logout", auth, (req, res) => {
    q.delSession.run(req.token);
    res.json({ ok: true });
  });

  app.get("/api/state", auth, (req, res) => {
    q.addVisit.run(req.username, localDate());
    res.json(readState(req.username));
  });

  function requireAdmin(req, res, next) {
    if (!isAdmin(req.username)) {
      return res.status(403).json({ error: "not an admin" });
    }
    next();
  }

  app.get("/api/admin/overview", auth, requireAdmin, (req, res) => {
    const users = q.allUsers.all().map((u) => {
      const state = readState(u.username);
      return {
        username: u.username,
        created: u.created.slice(0, 10),
        lastSeen: q.lastSeen.get(u.username)?.d ?? null,
        known: state.known.length,
        // removed cards carry a { removed: date } tombstone — not "seen"
        seen: Object.values(state.stats).filter((s) => !s?.removed).length,
        admin: isAdmin(u.username),
      };
    });
    const byDay = q.visitsByDay.all();
    const today = byDay.find((d) => d.date === localDate());
    res.json({
      totalUsers: users.length,
      activeToday: today?.active ?? 0,
      visitsToday: today?.visits ?? 0,
      byDay,
      users,
    });
  });

  app.delete("/api/admin/users/:name", auth, requireAdmin, (req, res) => {
    const name = req.params.name;
    if (name === req.username) {
      return res.status(400).json({ error: "cannot delete yourself" });
    }
    if (!q.getUser.get(name)) {
      return res.status(404).json({ error: "no such user" });
    }
    q.delUserSessions.run(name);
    q.delUserVisits.run(name);
    q.delUserState.run(name);
    q.delUser.run(name);
    res.json({ ok: true });
  });

  // partial update: { known?, prefs?, stats?, days? } — object fields merge
  // shallowly per key
  app.put("/api/state", auth, (req, res) => {
    const { known, prefs, stats, days } = req.body ?? {};
    const current = readState(req.username);
    if (known !== undefined) {
      if (!Array.isArray(known) || known.some((x) => typeof x !== "number")) {
        return res.status(400).json({ error: "known must be a number[]" });
      }
      current.known = [...new Set(known)];
    }
    for (const [field, value] of Object.entries({ prefs, stats, days })) {
      if (value === undefined) continue;
      if (!isObject(value)) {
        return res.status(400).json({ error: `${field} must be an object` });
      }
      current[field] = { ...current[field], ...value };
    }
    q.putState.run(req.username, JSON.stringify(current));
    res.json(current);
  });

  return app;
}
