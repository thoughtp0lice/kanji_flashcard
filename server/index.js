import express from "express";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { DatabaseSync } from "node:sqlite";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "data");
const DIST = join(__dirname, "..", "dist");
const PORT = process.env.PORT || 8034;

const USERNAME_RE = /^[a-z0-9_-]{1,32}$/;

const DEFAULT_STATE = {
  known: [],
  prefs: { mode: "kanji" },
  stats: {}, // per-kanji SRS state: { seen, fails: {date: n}, interval, due }
  days: {}, // per-date lesson: { date, queue: [ids], done: [ids] }
};

mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(join(DATA_DIR, "kanji.db"));
db.exec(`
  PRAGMA journal_mode = WAL;
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
};

const hash = (password, salt) =>
  scryptSync(password, salt, 64).toString("hex");

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
  res.json({ token: issueToken(creds.username), username: creds.username });
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
  res.json({ token: issueToken(creds.username), username: creds.username });
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
  res.json(readState(req.username));
});

const isObject = (x) => typeof x === "object" && x !== null && !Array.isArray(x);

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

// serve the production build when it exists (single-port deployment)
if (existsSync(DIST)) {
  app.use(express.static(DIST));
}

app.listen(PORT, () => {
  console.log(`kanji backend on http://localhost:${PORT}`);
});
