#!/usr/bin/env node
// Repository contract checks — dependency-free (Node built-ins only).
// Enforces the structural INV-* invariants from docs/code_docs/invariants.md.
// Run: `node scripts/check_repo.mjs` (or `npm run check`).
// Exit 0 = all pass; exit 1 = at least one failure. Warnings never fail.

import { readFileSync, readdirSync, statSync, lstatSync, readlinkSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const r = (p) => join(ROOT, p);

let failures = 0;
let warnings = 0;
const pass = (id, msg) => console.log(`  ok   ${id}: ${msg}`);
const fail = (id, msg) => { console.error(`  FAIL ${id}: ${msg}`); failures++; };
const warn = (id, msg) => { console.warn(`  warn ${id}: ${msg}`); warnings++; };

// ── INV-DOC-1: CLAUDE.md is a relative symlink to AGENTS.md ──────────────────
try {
  const st = lstatSync(r("CLAUDE.md"));
  if (!st.isSymbolicLink()) fail("INV-DOC-1", "CLAUDE.md is not a symlink");
  else {
    const target = readlinkSync(r("CLAUDE.md"));
    if (target !== "AGENTS.md") fail("INV-DOC-1", `CLAUDE.md -> ${target} (expected AGENTS.md)`);
    else if (!existsSync(r("AGENTS.md"))) fail("INV-DOC-1", "AGENTS.md missing");
    else pass("INV-DOC-1", "CLAUDE.md -> AGENTS.md");
  }
} catch (e) { fail("INV-DOC-1", `CLAUDE.md missing (${e.code})`); }

// ── INV-DOC-2: local Markdown links resolve ──────────────────────────────────
// docs/seed/ holds portable templates that may reference companion files not
// present in this repo (e.g. RUST_DEVELOPMENT_GUIDE.md) — their internal links
// are not a repo contract, so they are excluded from the resolver.
const SEED_DIR = r("docs/seed");
const MD_FILES = [];
(function walkMd(dir) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git" || name === "dist" || name === "build") continue;
    const p = join(dir, name);
    // skip symlinks: .claude/skills -> .agents/skills would otherwise re-walk
    // the skill files under a path where their relative links don't resolve.
    if (lstatSync(p).isSymbolicLink()) continue;
    const st = statSync(p);
    if (st.isDirectory()) walkMd(p);
    else if (name.endsWith(".md") && !p.startsWith(SEED_DIR)) MD_FILES.push(p);
  }
})(ROOT);

const LINK_RE = /\[[^\]]*\]\(([^)]+)\)/g;
let brokenLinks = 0;
for (const file of MD_FILES) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(LINK_RE)) {
    let link = m[1].trim();
    if (/^(https?:|mailto:|#)/.test(link)) continue; // external / anchor-only
    link = link.split("#")[0].split(" ")[0]; // strip anchor + title
    if (!link) continue;
    const targetPath = resolve(dirname(file), link);
    if (!existsSync(targetPath)) {
      fail("INV-DOC-2", `${relative(ROOT, file)} → broken link "${m[1]}"`);
      brokenLinks++;
    }
  }
}
if (brokenLinks === 0) pass("INV-DOC-2", `all local Markdown links resolve (${MD_FILES.length} files)`);

// ── INV-DOC-3: every part-table doc in code_docs/README.md exists ────────────
try {
  const sysmap = readFileSync(r("docs/code_docs/README.md"), "utf8");
  const partSection = sysmap.slice(sysmap.indexOf("## Parts"));
  const docLinks = [...partSection.matchAll(/\[[^\]]+\]\((\w[\w./-]*\.md)\)/g)].map((m) => m[1]);
  let missing = 0;
  for (const d of new Set(docLinks)) {
    if (!existsSync(r(join("docs/code_docs", d)))) { fail("INV-DOC-3", `part doc missing: ${d}`); missing++; }
  }
  if (missing === 0) pass("INV-DOC-3", `part-table docs all exist (${new Set(docLinks).size})`);
} catch (e) { fail("INV-DOC-3", `cannot read system map (${e.code})`); }

// ── INV-SKILL-1: .claude/skills -> .agents/skills and each skill has SKILL.md ─
try {
  const st = lstatSync(r(".claude/skills"));
  if (!st.isSymbolicLink()) fail("INV-SKILL-1", ".claude/skills is not a symlink");
  else if (!existsSync(r(".claude/skills"))) fail("INV-SKILL-1", ".claude/skills does not resolve");
  else {
    const skillsDir = r(".agents/skills");
    const skills = readdirSync(skillsDir).filter((n) => statSync(join(skillsDir, n)).isDirectory());
    let bad = 0;
    for (const s of skills) if (!existsSync(join(skillsDir, s, "SKILL.md"))) { fail("INV-SKILL-1", `skill "${s}" has no SKILL.md`); bad++; }
    if (bad === 0) pass("INV-SKILL-1", `skills symlink resolves; ${skills.length} skill(s) each have SKILL.md`);
  }
} catch (e) { fail("INV-SKILL-1", `.claude/skills missing (${e.code})`); }

// ── INV-AGENT-1: every adapter references an existing .agents role ────────────
function roleReferenced(text) {
  const m = text.match(/\.agents\/roles\/([\w-]+)\.md/);
  return m ? m[1] : null;
}
let adapterChecked = 0, adapterBad = 0;
for (const [dir, ext] of [[".claude/agents", ".md"], [".codex/agents", ".toml"]]) {
  const abs = r(dir);
  if (!existsSync(abs)) continue;
  for (const name of readdirSync(abs).filter((n) => n.endsWith(ext))) {
    adapterChecked++;
    const text = readFileSync(join(abs, name), "utf8");
    const role = roleReferenced(text);
    if (!role) { fail("INV-AGENT-1", `${dir}/${name} names no .agents/roles/*.md`); adapterBad++; }
    else if (!existsSync(r(join(".agents/roles", `${role}.md`)))) { fail("INV-AGENT-1", `${dir}/${name} → missing role ${role}.md`); adapterBad++; }
  }
}
if (adapterChecked > 0 && adapterBad === 0) pass("INV-AGENT-1", `${adapterChecked} adapter(s) reference existing roles`);
if (adapterChecked === 0) warn("INV-AGENT-1", "no adapters found to check");

// ── INV-BUILD-2: dist/ and build/ are gitignored ─────────────────────────────
try {
  const gi = readFileSync(r(".gitignore"), "utf8").split(/\r?\n/).map((l) => l.trim());
  const missing = ["dist", "build"].filter((d) => !gi.includes(d));
  if (missing.length) fail("INV-BUILD-2", `.gitignore missing: ${missing.join(", ")}`);
  else pass("INV-BUILD-2", "dist/ and build/ are gitignored");
} catch (e) { fail("INV-BUILD-2", `.gitignore unreadable (${e.code})`); }

// ── INV-SCHED-4: no `new Date("YYYY-MM-DD")` UTC-parsing in src/server ────────
{
  const suspects = [];
  const scan = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) { if (name !== "node_modules") scan(p); continue; }
      if (!/\.(js|jsx|mjs)$/.test(name)) continue;
      if (name === "data.js" || name === "examples.js") continue; // vendored data
      // strip comments first: they legitimately mention the anti-pattern to
      // warn against it (e.g. lesson.js explains why NOT to parse UTC).
      const text = readFileSync(p, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
      // new Date("...-...") or new Date(`...`) with a dashed date literal
      if (/new Date\(\s*["'`][^"'`]*-[^"'`]*-[^"'`]*["'`]\s*\)/.test(text))
        suspects.push(relative(ROOT, p));
    }
  };
  scan(r("src")); scan(r("server"));
  if (suspects.length) fail("INV-SCHED-4", `possible UTC date parse in: ${suspects.join(", ")}`);
  else pass("INV-SCHED-4", "no new Date(\"YYYY-MM-DD\") parsing in src/ or server/");
}

// ── INV-DATA-1 / INV-DATA-2: unique ids; grades within GRADE_ORDER ───────────
const GRADE_ORDER = ["0", "1", "2", "3", "4", "5", "6", "S"];
const KANA_GRADE = "0";
try {
  const { KANJI } = await import(pathToFileURL(r("src/data.js")).href);
  const ids = new Set();
  let dup = 0, badGrade = 0;
  for (const k of KANJI) {
    if (ids.has(k.id)) { dup++; } else ids.add(k.id);
    if (!GRADE_ORDER.includes(k.grade)) badGrade++;
  }
  if (dup) fail("INV-DATA-1", `${dup} duplicate id(s) in KANJI`);
  else pass("INV-DATA-1", `${KANJI.length} kanji, all ids unique`);
  if (badGrade) fail("INV-DATA-2", `${badGrade} kanji with a grade outside GRADE_ORDER`);
  else pass("INV-DATA-2", "all grades within GRADE_ORDER");

  // ── INV-DATA-3: kana ids are disjoint from kanji ids; all are grade "0" ────
  try {
    const { KANA } = await import(pathToFileURL(r("src/kana.js")).href);
    const problems = [];
    const kanaIds = new Set();
    for (const k of KANA) {
      if (ids.has(k.id)) problems.push(`id ${k.id} collides with a kanji`);
      if (kanaIds.has(k.id)) problems.push(`duplicate kana id ${k.id}`);
      kanaIds.add(k.id);
      if (k.grade !== KANA_GRADE) problems.push(`${k.kanji} has grade ${k.grade}`);
      if (k.kind !== "kana") problems.push(`${k.kanji} is not kind "kana"`);
      if (!k.pair || !k.script || !k.romaji) problems.push(`${k.kanji} is missing script/pair/romaji`);
      // the example is the card's third row — it has to actually contain the
      // sign it is illustrating, or it teaches nothing
      if (!k.examples?.length) problems.push(`${k.kanji} has no example word`);
      else
        for (const [word, romaji, gloss] of k.examples) {
          if (!word.includes(k.kanji)) problems.push(`${k.kanji}: example "${word}" does not contain it`);
          if (!romaji || !gloss) problems.push(`${k.kanji}: example "${word}" is missing romaji/gloss`);
        }
    }
    // every glyph must be paired: its `pair` is another card's glyph
    const glyphs = new Set(KANA.map((k) => k.kanji));
    for (const k of KANA) if (!glyphs.has(k.pair)) problems.push(`${k.kanji} pairs with unknown ${k.pair}`);
    const hira = KANA.filter((k) => k.script === "hiragana").length;
    const kata = KANA.filter((k) => k.script === "katakana").length;
    if (hira !== kata) problems.push(`${hira} hiragana vs ${kata} katakana — scripts must mirror`);
    if (problems.length) fail("INV-DATA-3", problems.slice(0, 5).join("; ") + (problems.length > 5 ? ` (+${problems.length - 5} more)` : ""));
    else pass("INV-DATA-3", `${KANA.length} kana (${hira}+${kata}), ids disjoint from KANJI, all grade "0"`);
  } catch (e) { fail("INV-DATA-3", `could not import src/kana.js (${e.message})`); }

  // soft: EXAMPLES keys should exist as kanji characters
  try {
    const { EXAMPLES } = await import(pathToFileURL(r("src/examples.js")).href);
    const chars = new Set(KANJI.map((k) => k.kanji));
    const stray = Object.keys(EXAMPLES).filter((c) => !chars.has(c));
    if (stray.length) warn("DATA-EX", `${stray.length} EXAMPLES key(s) not in KANJI (external data — informational)`);
    else pass("DATA-EX", "all EXAMPLES keys exist in KANJI");
  } catch (e) { warn("DATA-EX", `could not load examples.js (${e.message})`); }
} catch (e) { fail("INV-DATA-1", `could not import src/data.js (${e.message})`); }

// ── summary ──────────────────────────────────────────────────────────────────
console.log("");
if (failures) {
  console.error(`check_repo: ${failures} failure(s), ${warnings} warning(s)`);
  process.exit(1);
}
console.log(`check_repo: all checks passed (${warnings} warning(s))`);
