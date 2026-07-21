# Multi-Harness Repository Management Guide

**This is a portable meta-instruction.** Give this file to a coding agent with
a target repository and ask it to set up the repository. The result should work
with Claude Code, Codex, and other harnesses without maintaining independent
copies of project policy.

For a Rust target, use this guide together with
[`RUST_DEVELOPMENT_GUIDE.md`](RUST_DEVELOPMENT_GUIDE.md). This file owns the
repository, documentation, multi-harness, and pipeline-management structure;
the Rust companion owns crate design, determinism, caching, run-root safety,
concurrency, ingestion, and Rust verification practices.

The core rule is simple:

> Share behavior and knowledge; adapt only discovery paths, manifest syntax,
> permissions, and model configuration.

Do not claim universal compatibility merely because both harnesses can read a
Markdown file. Verify each harness's discovery rules and keep explicit adapters
for surfaces whose native formats differ.

## 0. Target Shape

```text
<repo>/
  AGENTS.md                       shared root instructions
  CLAUDE.md -> AGENTS.md          Claude entry point, same source of truth
  README.md                       human orientation
  docs/
    code_docs/
      README.md                   system map and authoritative part list
      invariants.md               checkable contracts with INV-* IDs
      build.md                    authoritative commands and dependencies
      <part>.md                   architecture and rationale per part
    communication/               optional unattended runbooks
    experiment_log/              optional reproducible run records
    research/                    optional external evidence
    seed/                        optional portable templates
    TRICKY_ISSUES.md             durable engineering-friction log
  src/<module>/README.md          optional concise local module rules
  scripts/
    check_repo.*                  repository contract checks
    pipeline/
      README.md                   pipeline ownership contract and index
      <workflow>_pipeline.*       canonical end-to-end entry points
      <family>_common.*           optional shared policy for related pipelines
    config.*                      optional platform capability resolution
  .agents/
    roles/<name>.md               harness-neutral role procedures
    skills/<name>/SKILL.md        canonical open-format Agent Skills
  .claude/
    agents/<name>.md              thin Claude Code agent adapters
    skills -> ../.agents/skills   Claude view of canonical skills
  .codex/
    agents/<name>.toml            thin Codex custom-agent adapters
```

Scale this shape down for small repositories. Empty trees are not useful.

## 1. Principles

1. **One source of truth.** A fact, workflow, role procedure, or glossary lives
   in one canonical file. Other surfaces link to it.
2. **Shared core, native adapters.** Keep harness-neutral content under
   `.agents/`. Keep only manifest metadata, permissions, model choice, and a
   pointer to shared content in `.claude/` or `.codex/`.
3. **Docs are part of done.** Root instructions include a trigger-to-files
   table naming every surface that changes together.
4. **Rules must be checkable.** Standing contracts receive stable `INV-*` IDs,
   an enforcement point, and a concrete check.
5. **Evidence, decisions, and results differ.** External research is not a
   project decision; a project decision is not implemented code; implemented
   code is not a measured result without reproducible artifacts.
6. **No fabricated status.** Agents verify files, commands, dates, and numbers
   before recording them.
7. **Preserve unrelated work.** A dirty worktree is not permission to clean,
   reset, or revert another contributor's changes.
8. **Clean generated artifacts immediately.** When an output moves, remove the
   stale location in the same change.
9. **Runbooks are for unattended execution.** Defaults are pre-decided,
   failures are logged, and hard stops are enumerated.
10. **Add surfaces when pain appears.** A small accurate system is better than
    an elaborate empty one.
11. **Orchestration owns run policy.** End-to-end workflow choices and
    run-varying constants belong at the pipeline boundary; reusable modules
    receive explicit values instead of reading hidden globals.

## 2. Root Instructions

Create `AGENTS.md` as the shared repository instruction file. Create the
relative symlink `CLAUDE.md -> AGENTS.md` and state at the top that edits belong
in `AGENTS.md`.

`AGENTS.md` should contain:

- a short factual orientation, including what does **not** exist yet;
- a documentation map that links rather than duplicates;
- a trigger-to-files synchronization table;
- imperative conventions and verification expectations;
- operational footguns and cost or safety boundaries;
- a short harness map explaining canonical and adapter locations;
- review priorities if the repository has stable review expectations.

Example synchronization table:

| When you change... | Update all of... |
|---|---|
| a schema, field, or data model | schema doc, parser doc, and local module README |
| module behavior | part doc and local module README |
| a design contract | explanatory doc and `invariants.md` |
| a command, flag, or dependency | `build.md` and executable checks |
| a workflow stage, run parameter, or artifact path | owning pipeline, pipeline doc, and affected part docs |
| a shared agent role or skill | canonical `.agents/` source and affected adapters |
| an output location | referencing docs and deletion of stale artifacts |

Keep detailed commands in `build.md`, architecture in the system map, and the
formal contract catalog in `invariants.md`.

### Nested Instructions

Both harnesses can apply more local instructions, but discovery and precedence
may differ. Add nested `AGENTS.md` files only when a subtree has materially
different rules. Do not create nested files merely to repeat root policy.

## 3. Code Documentation

### 3.1 `docs/code_docs/README.md`

Use this as the system map. Include, in order:

1. current system and one-line data/control flow;
2. commented documentation tree;
3. authoritative `Part | Doc | Code | Status` table;
4. architecture/dependency diagram and layering rules;
5. central design problem;
6. cross-cutting conventions with a link to formal invariants;
7. generated artifact locations and retention rules;
8. real worked traces when executable flows exist;
9. one authoritative glossary;
10. a "Where do I look?" table.

Use explicit statuses such as `active`, `planned`, `deprecated`, and
`not implemented`. Never fill missing sections with invented architecture.

### 3.2 Part Docs and Module READMEs

Each real subsystem gets one **detailed** architecture-and-rationale document.
The target is a complete engineering reference, not an overview. An engineer or
coding agent should be able to understand, operate, change, and review the part
without first reverse-engineering the entire codebase.

Cover every applicable dimension:

- purpose, scope, ownership boundary, and dependency/layering position;
- exact entry points, important types/functions, and call/data flow;
- inputs, outputs, field-level schemas, flags, defaults, configuration
  precedence, and generated artifact paths;
- algorithms and state transitions, including ordering, caching, concurrency,
  retry, resume, idempotency, and cleanup;
- invariants, assumptions, validation, errors, edge cases, and known limits;
- design decisions, alternatives considered, and why the current design exists;
- tests, smoke probes, operational commands, and worked end-to-end examples;
- links to adjacent parts, local module READMEs, research, and runbooks.

Use tables for complete field/flag/dependency references, diagrams for control
or data flow, and concrete examples for non-obvious behavior. Do not optimize
for shortness and do not stop after describing the happy path. At the same
time, do not invent detail: planned or paused parts state their contract,
status, open decisions, and known unknowns explicitly.

End each part doc with the binding invariant IDs. Add a concise
`src/<module>/README.md` only when contributors benefit from rules beside the
code; it links back rather than repeating the architecture.

### 3.3 `invariants.md`

Use one catalog:

| ID | Invariant | Defined / enforced in | How checked |
|---|---|---|---|

IDs follow `INV-<AREA>-<N>`. A check must name a test, script, grep, review
question, or manual probe. Maintain a `Known Open Violations` table so gaps are
not mistaken for coverage.

Useful starting areas include documentation links, dependency direction,
status honesty, cache-key completeness, cleanup, agent adapter consistency,
and reproducible experiments. Seed only contracts relevant to the target.

### 3.4 `build.md`

This is the authoritative command reference. Record only commands that exist
and have been verified. Explicitly say when the repository has no build, test,
lint, training, or serving command yet.

### 3.5 Pipeline Execution and Configuration

When a repository has multi-stage data, experiment, build, release, or report
workflows, gather durable execution under `scripts/pipeline/`. Each workflow
gets one canonical pipeline entry point that owns:

- stage registration, ordering, dependencies, and resume policy;
- workflow defaults such as datasets, model sets, thresholds, seeds, and
  artifact roots;
- supported one-run CLI and environment overrides;
- validation of stage combinations and prerequisites;
- printing the fully resolved non-secret configuration before execution.

Separate four ownership layers:

| Layer | Owns |
|---|---|
| workflow pipeline | stage graph and run/experiment policy |
| pipeline-common file | parameters and helpers shared by one related pipeline family |
| platform config | backend, machine, model-capability, and resource resolution |
| implementation module | reusable domain logic called with explicit arguments |

The pipeline is allowed to contain visible run defaults because it is the run
specification. Reusable modules must not hide run selection in globals or read
environment variables for workflow policy.

Use deterministic precedence:

```text
explicit CLI override
  > one-run environment override
  > owning pipeline default
  > shared platform capability default
```

Not every parameter needs every override surface. Prefer one stage registry
that drives parsing, help, `--all` order, active-stage printing, and the
no-stage guard. Avoid copying the stage list into several case statements and
documentation blocks.

Long or paid stages need a resumable/idempotent path. Each run should persist
its selected stages, resolved configuration, source revision, input identifiers,
artifact paths, and completion status.

Direct module commands remain useful for tests and debugging, but the pipeline
is the canonical operational interface. Document this boundary in
`docs/code_docs/pipelines.md` and `scripts/pipeline/README.md`.

## 4. Operational Records

Create these only when the project uses them:

- `docs/communication/`: unattended runbooks with purpose, preconditions,
  fixed decisions, exact steps, failure posture, hard stops, and append-only
  run logs.
- `docs/experiment_log/`: one dated record per reproducible run, with every
  number traceable to versioned configuration and artifacts.
- `docs/TRICKY_ISSUES.md`: newest-first friction log. Update matching root
  causes rather than creating duplicates; move resolved entries without
  deleting their history.

Detailed evidence flows inward to experiment or issue logs. External status
surfaces receive distilled outcomes only and should have one designated writer.

## 5. Multi-Harness Agent Design

### 5.1 Shared Role Bodies

Place role procedures in `.agents/roles/<name>.md`. A role body contains:

- identity and success criteria;
- bounded scope and explicit exclusions;
- numbered operating procedure, beginning with reading written contracts;
- verification commands or a pointer to `build.md`;
- cleanup obligations;
- hand-offs and destructive-action boundaries.

Role bodies must not contain harness-only tool lists, model slugs, or permission
syntax.

### 5.2 Claude Code Adapter

Claude Code custom agents use Markdown files under `.claude/agents/` with YAML
frontmatter. Keep the body thin:

```markdown
---
name: repository-auditor
description: Audit one bounded part against written contracts.
tools: Bash, Read, Grep, Glob, Edit, Write
model: sonnet
---

Before acting, read and follow `.agents/roles/repository-auditor.md` as the
canonical role. This file supplies Claude-specific metadata only.
```

Tool names and model values are Claude configuration and may change without
changing the shared role.

### 5.3 Codex Adapter

Codex project custom agents use TOML files under `.codex/agents/`. Keep their
instructions thin:

```toml
name = "repository-auditor"
description = "Audit one bounded part against written contracts."
sandbox_mode = "workspace-write"
developer_instructions = """
Before acting, read and follow `.agents/roles/repository-auditor.md` as the
canonical role. This file supplies Codex-specific configuration only.
"""
```

Codex custom-agent settings, project `.codex/config.toml`, hooks, and approval
policies are not portable policy. Add them only for a verified need and keep
them out of the shared role body.

### 5.4 Why Adapters Are Necessary

Do not symlink Claude agent Markdown directly to Codex agent TOML or vice
versa. The manifest formats and configuration fields differ. The correct unit
of reuse is the role procedure they both load.

## 6. Multi-Harness Skills

Use the open Agent Skills structure as the canonical workflow source:

```text
.agents/skills/<skill-name>/SKILL.md
```

Each `SKILL.md` has `name` and `description` frontmatter followed by the
procedure. Keep references and scripts inside the skill directory when they are
specific to that workflow.

Codex discovers repository skills under `.agents/skills`. Expose the same files
to Claude Code with:

```bash
mkdir -p .claude
ln -s ../.agents/skills .claude/skills
```

If a target harness does not follow directory symlinks, generate or copy only a
small adapter that points back to the canonical skill; do not silently maintain
two editable copies. Add a repository check that verifies the chosen wiring.

Minimum useful skills for documentation-heavy repositories:

- `clean`: audits one bounded part through the shared auditor role;
- `record-tricky-issue`: records non-obvious friction without inventing facts.

## 7. Setup Procedure

### Phase 0: Survey

Read the repository, existing instructions, worktree status, build system,
entry points, docs, generated artifacts, and actual verification commands.
Identify what exists and what is merely planned. Merge existing guidance; do
not discard it.

### Phase 1: Shared Root

Write `AGENTS.md`, create `CLAUDE.md -> AGENTS.md`, and add a human `README.md`
if none exists. Keep root guidance concise and factual.

### Phase 2: Documentation Bottom-Up

Document each real part in full detail, tracing the implementation rather than
summarizing filenames. Inventory public and internal entry points, types,
schemas, flags, defaults, artifacts, edge cases, failure paths, tests, and
design rationale. Then document verified commands, then write the system map.
The system map is written last because it indexes the real surfaces.

### Phase 3: Contracts and Checks

Extract enforceable invariants. Add a dependency-free validation script when
the repo lacks a test runner. Checks should cover symlinks, local links,
required headings, and adapter references where relevant.

If executable workflows exist, add pipeline invariants covering canonical
entry points, explicit module configuration, resolved-config printing, and
override precedence. Provide a dry-run, dummy backend, or smallest-data smoke
path that does not trigger a full expensive run.

### Phase 4: Operational Records

Create only the record trees the repository will use. An empty runbook or
experiment hierarchy adds maintenance without value.

### Phase 4a: Pipeline Boundary

Inventory existing scripts and direct module commands. Group end-to-end work by
workflow, move orchestration into `scripts/pipeline/`, and centralize each
workflow's run-varying values in its pipeline or narrow family-common file.
Keep machine/model capability lookup separate. Do not mechanically move every
constant: algorithmic and schema constants still belong with their owning code.

### Phase 5: Shared Agent Core

Create `.agents/roles/` and `.agents/skills/`. Add one narrow role or skill at a
time, based on repeated work rather than imagined future needs.

### Phase 6: Harness Adapters

Add `.claude/agents/*.md`, `.codex/agents/*.toml`, and the Claude skills
symlink. Keep adapter content minimal and verify each adapter references an
existing shared source.

### Phase 7: Verify

- [ ] `CLAUDE.md` is a relative symlink to `AGENTS.md`.
- [ ] Local Markdown links resolve.
- [ ] The current-part list, glossary, commands, and invariant catalog each
      have one authoritative home.
- [ ] Every implemented non-trivial part has a detailed architecture-and-
      rationale doc covering concrete APIs/flows, complete configuration and
      artifacts, edge/failure behavior, tests, examples, and invariant IDs.
- [ ] Planned work is not described as implemented.
- [ ] Durable end-to-end workflows have one canonical pipeline entry point.
- [ ] Run-varying datasets, models, thresholds, seeds, and artifact roots are
      not hidden as globals in reusable modules.
- [ ] Pipelines reject missing or invalid stage selections and print resolved
      non-secret configuration before execution.
- [ ] One-run overrides do not require editing committed defaults.
- [ ] Every invariant has an enforcement point and concrete check.
- [ ] `.agents/skills` is canonical and Claude resolves the same files.
- [ ] Every Claude and Codex agent adapter points to an existing shared role.
- [ ] Adapter-only metadata has not leaked into shared role procedures.
- [ ] Documented commands run successfully.
- [ ] Existing unrelated worktree changes remain intact.

## 8. Scaling and Portability

For a documentation-only or single-module repository, use `AGENTS.md`, the
Claude symlink, a small system map, invariants, build/validation documentation,
one checker, and at most one auditor role plus two small skills. Add runbooks,
experiment logs, nested instructions, or more agents only after real work needs
them.

Portable concepts:

- one root policy source;
- links instead of copies;
- open-format shared skills;
- shared role bodies with native manifest adapters;
- checkable contracts and honest status;
- deterministic validation;
- pipeline-owned orchestration and explicit configuration flow.

Harness-specific concepts:

- discovery directories beyond `AGENTS.md`;
- custom-agent manifest syntax;
- tool names, model values, sandbox modes, and approval policy;
- hooks, project configuration, and UI invocation.

Treat harness-specific behavior as an adapter layer that may evolve. When a
harness changes, update its adapter and the repository check, not the shared
project policy.
