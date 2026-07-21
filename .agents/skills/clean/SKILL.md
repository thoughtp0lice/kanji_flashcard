---
name: clean
description: Audit one bounded part of the kanji-flashcard repo against its written contracts (part doc + invariants) and report verified discrepancies without inventing facts.
---

# clean — audit one part against its contracts

Runs the [repository-auditor](../../roles/repository-auditor.md) role over a
single part. Use this to check that a part's code, its doc under
`docs/code_docs/`, and its `INV-*` invariants still agree — before a release,
after a refactor, or when something feels stale.

## Input

The name of one part from the table in
[`docs/code_docs/README.md`](../../../docs/code_docs/README.md) — e.g.
`lesson`, `frontend`, `server`, `data`, or `bundling`. If none is given, ask
which part, or default to the part touched by the current diff.

## Procedure

1. Load and follow [`.agents/roles/repository-auditor.md`](../../roles/repository-auditor.md).
2. Read `AGENTS.md`, the part's doc (`docs/code_docs/<part>.md`), and the part's
   rows in `docs/code_docs/invariants.md`.
3. For each bound `INV-*`, run its "How checked" and record the **actual**
   result:
   - structural invariants → `npm run check`;
   - algorithmic/API invariants → `npm test -- test/<part>.test.js`.
4. Diff the doc against the code (entry points, schemas, flags, flows). Flag
   drift with `file:line`.
5. Report concise findings: each is an `INV-*`/doc claim + evidence + minimal
   fix. Mark confirmed vs. uncertain. Say so if the part is clean.

## Guardrails

- Report only; do not change behavior or generated data as part of the audit.
- On Node ≥ 26, do **not** report the 15 jsdom UI failures as regressions — see
  [`docs/TRICKY_ISSUES.md`](../../../docs/TRICKY_ISSUES.md).
- Every recorded fact must trace to a file/line, command output, or `INV-*` ID.
