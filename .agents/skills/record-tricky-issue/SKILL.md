---
name: record-tricky-issue
description: Record a non-obvious engineering-friction issue in docs/TRICKY_ISSUES.md using verified facts only — updating a matching root cause instead of duplicating, and preserving history when resolved.
---

# record-tricky-issue — log durable friction honestly

Appends or updates an entry in
[`docs/TRICKY_ISSUES.md`](../../../docs/TRICKY_ISSUES.md). Use it when you hit
something non-obvious that cost real time — an environment quirk, a
counter-intuitive behavior, a footgun — and the next person should not have to
rediscover it.

## When to use

- A failure or surprise whose root cause is not evident from the code alone.
- Something the tests/CI hide or that only reproduces under specific versions.
- **Not** for routine bugs with an obvious fix (just fix those and add a test).

## Procedure

1. **Verify before writing.** Reproduce the symptom and capture the exact
   command, output, versions, and dates. Never record a guessed cause.
2. **Check for an existing entry** with the same root cause. If one exists,
   **update it** (add the new symptom/observation) rather than adding a
   duplicate.
3. **Write newest-first** at the top, following the existing entry shape:
   - Title (the root cause, not just the symptom).
   - Status, first-observed (date + versions), Symptom, Root cause (with
     evidence), Impact, Workarounds, Candidate fixes, and why not-yet-fixed.
   - Cross-links to affected docs (`build.md`, `AGENTS.md`, part docs).
4. **On resolution:** move the entry to a "Resolved" section with the fix and
   the commit — do **not** delete its history.

## Guardrails

- Facts only: real commands, real output, real versions/dates.
- One root cause per entry; consolidate duplicates.
- Distilled, not a transcript — enough for the next person to recognize and act.
