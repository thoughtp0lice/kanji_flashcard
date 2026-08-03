# Part: Backend API (`server/`)

A small Express 5 + `node:sqlite` server: accounts, cross-device state sync,
an admin dashboard, and (in production) serving the built frontend.

- **Purpose:** durable, authenticated, multi-device storage for user progress.
- **Boundary:** the server stores and validates the opaque state blob; it does
  **not** run the SRS algorithm (that is client-side in [`lesson.js`](lesson.md)).
  Its only domain logic is shallow per-key state merging, auth, and admin stats.
- **Dependency position:** `server/index.js` (dev) and `server/prod.js` (bundled
  prod) both wrap the pure factory `createApp(dbPath, { adminUsers })` in
  `server/app.js`. The factory is I/O-testable against `:memory:`.

## Entry points

| File | Role |
|---|---|
| `server/app.js` | `createApp(dbPath, {adminUsers})` → Express app (all routes, schema, queries) |
| `server/index.js` | dev/`npm start` entry: port 8034 (or `PORT`), data in `server/data/`, serves `dist/` if present |
| `server/prod.js` | bundled entry: port 52654, data in `KANJI_DATA` or `./data`, serves embedded assets; unknown extension-less GET paths (not `/api/*`) fall back to `index.html` for the client-routed views (`/deck`, `/practice`, `/admin`) — `server/index.js` does the same over `dist/` |

`createApp` opens the DB, runs `CREATE TABLE IF NOT EXISTS` (+ WAL for on-disk
DBs), prepares all statements once into `q`, and registers routes. There is **no
migration framework** — schema changes must stay additive or ship a manual
migration.

## Database schema (SQLite)

| Table | Columns | Notes |
|---|---|---|
| `users` | `username` PK, `pass_hash`, `salt`, `created` | scrypt hash (64 B hex), per-user 16 B salt |
| `state` | `username` PK→users, `data` | the JSON state blob (one row per user) |
| `sessions` | `token` PK, `username`, `created` | opaque 32 B hex bearer tokens |
| `visits` | (`username`,`date`) PK, `count` | per-day visit tally, bumped on `GET /api/state` |

The `state.data` blob shape (defaults in `DEFAULT_STATE`):
`{ known: number[], prefs: {mode,...}, stats: {[id]:stat}, days: {[date]:day} }`.
`readState` always spreads over `DEFAULT_STATE`, so missing keys are backfilled.
A `stat` is either a live SRS record or a removal tombstone
`{ removed: "YYYY-MM-DD" }` (see [lesson.md](lesson.md)); the server treats
both as opaque values — only the client interprets them. The admin overview's
`seen` count skips tombstones.

## Routes

| Method & path | Auth | Behavior |
|---|---|---|
| `POST /api/register` | — | validate creds, reject dup, hash, create user, issue token → `{token,username,admin}` |
| `POST /api/login` | — | `timingSafeEqual` hash compare; `404` unknown, `401` wrong pw |
| `POST /api/logout` | token | delete the session row |
| `GET /api/state` | token | bump today's visit, return merged state |
| `PUT /api/state` | token | **partial** update — see merge rules below |
| `GET /api/admin/overview` | token+admin | totals, 14-day visits, per-user stats |
| `DELETE /api/admin/users/:name` | token+admin | cascade-delete a user (not self) |

### Credential validation (`checkCredentials`)

- `username` must match `/^[a-z0-9_-]{1,32}$/` → else `400`. (`INV-AUTH-2`)
- `password` must be a string ≥ 4 chars → else `400`.

### `PUT /api/state` merge semantics (`INV-STATE-1`)

Body may contain any of `{ known, prefs, stats, days }`:

- `known`: must be `number[]`; **replaces** and dedupes (`[...new Set(known)]`).
- `prefs`/`stats`/`days`: must be objects; **shallow-merged per top-level key**
  into the current value (`{...current[field], ...value}`). So pushing
  `{days:{[today]:deck}}` adds/overwrites only today's entry; other dates and
  other fields are untouched. Any non-object → `400`.

This per-key merge is what lets the debounced client push a single changed field
without clobbering the rest of the server state.

### Auth middleware

`auth` reads `Authorization: Bearer <token>`, resolves it against `sessions`,
sets `req.username`/`req.token`, else `401`. `requireAdmin` checks
`adminUsers.includes(req.username)` → else `403`. (`INV-ADMIN-1`)

### Admin

`adminUsers` comes from `KANJI_ADMINS` (comma-separated) at startup. Overview
reports `totalUsers`, `activeToday`, `visitsToday`, a 14-day `byDay` series, and
per-user `{created, lastSeen, known, seen, admin}`. Delete refuses self
(`400`) and unknown users (`404`), otherwise cascades across `sessions`,
`visits`, `state`, `users`. (`INV-ADMIN-2`)

## Security properties & limits

- Passwords: `scryptSync(pw, salt, 64)`, per-user random salt, constant-time
  compare. (`INV-AUTH-1`)
- Tokens: 128-bit random hex, no expiry (logout/delete invalidate).
- **Known gaps (not implemented):** no rate limiting on login/register, no
  password reset, no CSRF concern (bearer-token, no cookies), no HTTPS (deploy
  behind a proxy), no token TTL, no request logging.
- Body limit: `express.json({ limit: "2mb" })`.

## Configuration

| Env | Default | Used by |
|---|---|---|
| `PORT` | 8034 (dev) / 52654 (prod) | both entries |
| `KANJI_ADMINS` | `""` | admin allow-list |
| `KANJI_DATA` | `./data` next to the bundle | prod data dir only |

## Tests

`test/server.test.js` (against `createApp(":memory:")`) covers register/login
validation and errors, state defaults/replace-dedupe/per-key merge/user
isolation/payload validation, admin auth + reporting + delete-guards +
cascade + session invalidation, and logout. Node-environment suite —
**unaffected** by the Node 26 `localStorage` caveat.

Run: `npm test -- test/server.test.js`.

## Related

State shape & sync client: [`frontend.md`](frontend.md). Production bundling &
asset serving: [`bundling.md`](bundling.md). Invariants:
`INV-AUTH-*`, `INV-ADMIN-*`, `INV-STATE-*`.
