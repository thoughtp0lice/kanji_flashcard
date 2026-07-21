# Application Repository Management Guide

**This is a portable meta-instruction, adapted for application repositories.**
It is the app-oriented companion to
[`REPO_MANAGEMENT_GUIDE.md`](REPO_MANAGEMENT_GUIDE.md), which is written for
research/experiment repositories. Give this file to a coding agent with a target
**application** repo (web app, service, CLI, mobile — anything whose primary
output is running software, not measured results) and ask it to set the repo up.

The core rule is unchanged:

> Share behavior and knowledge in one canonical place; adapt only discovery
> paths, manifest syntax, permissions, and model configuration.

## Why an app adaptation exists

The research guide optimizes for **reproducible evidence**: experiment logs,
pipeline-owned run policy, external research trees, datasets/models/seeds as
first-class run-varying config. Applications optimize for **correct, shippable,
maintainable behavior**. The principles carry over; the emphasis and the
concrete surfaces differ.

| Research repo emphasis | App repo emphasis |
|---|---|
| `docs/experiment_log/` — one dated record per run | (usually dropped) — behavior is verified by tests, not run logs |
| `docs/research/` — external evidence | (usually dropped) — a short "data provenance" note if data is vendored |
| `scripts/pipeline/` owning datasets/models/seeds/thresholds | **build/CI/deploy pipeline** owning commands, ports, env, artifacts |
| Determinism, caching, run-root safety | offline/sync correctness, **user-data safety**, migrations, auth |
| "measured result ≠ implemented code" | "green test ≠ verified in the running app" |

Keep the parts that fit; do not erect empty research scaffolding in an app repo.

## What still applies unchanged

1. **One source of truth.** `AGENTS.md` + a relative `CLAUDE.md -> AGENTS.md`
   symlink; every fact/workflow/glossary term has exactly one home; others link.
2. **Shared core, native adapters.** Harness-neutral role/skill bodies in
   `.agents/`; only metadata (tools, model, sandbox) in `.claude/` / `.codex/`.
3. **Docs are part of done.** A trigger-to-files table in `AGENTS.md` naming
   every surface that changes together.
4. **Rules must be checkable.** `INV-*` IDs with an enforcement point and a
   concrete check.
5. **No fabricated status.** Verify files, commands, dates, numbers before
   recording them.
6. **Preserve unrelated work; clean generated artifacts on move.**
7. **A detailed architecture-and-rationale doc per real part**, ending in the
   part's binding invariant IDs.
8. **Add surfaces when pain appears.** Scale the shape down for small apps.

## Target shape (app)

```text
<repo>/
  AGENTS.md                       shared root instructions
  CLAUDE.md -> AGENTS.md
  README.md                       user/operator orientation (features, running)
  docs/
    code_docs/
      README.md                   system map + part table + glossary
      <part>.md                   one detailed doc per real subsystem
      build.md                    authoritative commands, env, verified status
      invariants.md               INV-* catalog + Known Open Violations
    TRICKY_ISSUES.md              durable friction log (newest first)
    seed/                         these portable guides
  scripts/
    check_repo.*                  dependency-free repo/doc/data contract checks
    <build stages>               build/bundle/codegen steps if any
  .agents/roles/<name>.md         shared role procedures
  .agents/skills/<name>/SKILL.md  canonical skills
  .claude/agents/*.md  .claude/skills -> ../.agents/skills
  .codex/agents/*.toml
```

Compared with the research shape: `experiment_log/`, `research/`, and
`communication/` runbooks are usually **absent**; `scripts/pipeline/` becomes an
ordinary build pipeline documented in a part doc.

## App-specific documentation priorities

Beyond the generic part-doc checklist, an application part doc should nail:

- **The frontend/backend/data boundary** — which layer owns which decision (in
  this repo: the SRS algorithm is client-side; the server stores an opaque
  blob). State the layering rule and enforce it (`INV-*`).
- **State & schema** — the persisted data shape, where it lives (DB, files,
  `localStorage`), and **migration/back-compat** policy. Additive-only? Manual
  migration? Say so.
- **Sync & offline** (if applicable) — the source-of-truth rule, the merge
  semantics, and the guarantee that no path silently loses user data.
- **Auth & security** — hashing, sessions, authorization gates, and the
  explicit list of **not-implemented** protections (rate limiting, HTTPS,
  password reset) so gaps are not mistaken for coverage.
- **User-data safety** — which operations are irreversible/cascading; treat
  destructive ops as hard-stop-worthy.
- **Config precedence** — CLI flag > env var > built-in default, printed or
  documented.

## The build/deploy pipeline (app version of §3.5)

Most apps have exactly one durable end-to-end workflow: **source → artifact →
run.** Treat it like the research "pipeline," scaled down:

- **One canonical entry point** (e.g. `make build` / `npm run bundle`) that owns
  stage ordering and prints/uses the resolved config. Do not invoke a single
  stage as a shortcut when later stages depend on it.
- **Document the stages** (reads → writes) in a part doc and the exact commands
  in `build.md`.
- **Run-varying values** (ports, data dirs, admin lists, feature flags) live at
  the pipeline/entry boundary as env/flags with clear precedence — not hidden in
  reusable modules.
- **Artifacts** are listed with retention rules and are gitignored; when an
  output moves, delete the old location in the same change.
- Provide a **smoke path** (build succeeds + artifact imports/boots) distinct
  from the full test suite.

`docs/experiment_log/` is replaced by **CI**: the authoritative record that the
verified commands actually pass, on a pinned runtime.

## Invariants: useful app areas

Seed only what the target has. Common app invariant areas:

- **doc/link/status honesty** and **adapter/skill wiring** (as in the research
  guide);
- **scheduling / core-algorithm contracts** (enforced by unit tests);
- **state & sync** (merge never loses data; partial-update semantics);
- **auth & authorization** (hashing, session invalidation, admin gates);
- **data integrity** (unique keys, enum domains) — checkable in `check_repo.*`;
- **build** (self-contained artifact; generated paths gitignored & cleaned).

Map algorithmic/API invariants to **named tests**; map structural/data/doc
invariants to the **dependency-free checker** so `check_repo.*` fails loudly and
CI catches drift.

## Verification: "green test ≠ working app"

The research guide separates evidence from decisions from code. The app analogue
of the strictest separation is: **passing tests are necessary but not
sufficient** — exercise the actual running app (or a smoke boot) for behavior
changes with a runtime surface. Record verified status in `build.md` with the
date and runtime version, and re-run rather than copying an old claim forward.

## Setup procedure (app)

Follow the research guide's phases, with these substitutions:

0. **Survey** — read code, existing docs, worktree, build system, entry points,
   and **actually run** the build and tests. Note what is verified vs. assumed.
1. **Shared root** — `AGENTS.md`, `CLAUDE.md` symlink, keep/extend `README.md`.
2. **Docs bottom-up** — one detailed doc per real part (frontend, backend, core
   algorithm, data, build), then `build.md`, then the system map last.
3. **Contracts & checks** — extract `INV-*`; add a dependency-free
   `check_repo.*` covering symlinks, doc links, data integrity, adapter wiring,
   and build hygiene; map behavioral invariants to named tests.
4. **Operational records** — usually just `TRICKY_ISSUES.md`. Add runbooks only
   for genuinely unattended operations.
5. **Pipeline boundary** — document the one build/deploy workflow and its
   entry point; keep run-varying config at the boundary.
6. **Shared agent core + adapters** — one auditor role and a couple of narrow
   skills (`clean`, `record-tricky-issue`); thin `.claude`/`.codex` adapters +
   the skills symlink.
7. **Verify** — the research guide's checklist, plus: documented commands run on
   the pinned runtime; generated artifacts gitignored; user-data operations
   flagged; no fabricated status.

## Scaling

A small app needs only: `AGENTS.md` + symlink, a compact system map, per-part
docs for each real subsystem, `build.md`, `invariants.md`, one `check_repo.*`,
one auditor role, and two small skills. Add sync/migration/runbook depth,
nested instructions, or more agents only when real work demands them.

Portable concepts (same as research): one root policy source; links not copies;
open-format shared skills; shared role bodies with native adapters; checkable
contracts and honest status; deterministic validation; a canonical build entry
point with explicit config flow. Harness-specific concepts (discovery dirs,
manifest syntax, tool/model/sandbox values, hooks) remain an adapter layer that
may evolve independently.
