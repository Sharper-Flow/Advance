#!/usr/bin/env node
/**
 * CI lint script: skill-reference resolution guard.
 *
 * Enforces rq-skillReferenceIntegrity01 — an active ADV surface MUST NOT
 * reference a skill that does not exist. A canonical skill reference is
 * `skill("<name>")` or a `skills/<name>/` path; each must resolve to an
 * existing `skills/<name>/SKILL.md`. Historical surfaces are excluded.
 *
 * Detection is deliberately precise: slash-prefixed prose and bare
 * backticked names are NOT matched. Teaching the validator to guess at
 * prose references would be heuristic — the failure class this guard
 * exists to remove (P33).
 */

import { readdir, readFile, stat } from "fs/promises";
import { join, relative, resolve, sep } from "path";
import { fileURLToPath } from "url";

export interface SkillReference {
  skill: string;
  line: number;
}

export interface UnresolvedReference {
  skill: string;
  file: string;
  line: number;
}

const SKILL_CALL_RE = /skill\("([a-z0-9][a-z0-9-]*)"\)/g;
// Repo-local `skills/<name>/` only — a preceding path segment (e.g. the
// upstream `mattpocock/skills@<sha>:skills/engineering/...` attribution
// header) means the path is not repo-local and is excluded.
const SKILL_PATH_RE = /(?:^|[\s"`'(=|])skills\/([a-z0-9][a-z0-9-]*)\//g;

/**
 * Exemptions are location-scoped, never global: a name is skipped ONLY in a
 * surface whose path matches the entry's surface regex. This is the structural
 * answer to the allowlist-masking risk — a typo like `skill("playwright-mcp")`
 * in a random skill doc is still reported because that doc is not a declared
 * playwright-mcp surface. Each entry documents why the exemption is sound.
 */
interface Exemption {
  skill: string;
  /** Matched against the repo-relative posix path of the referencing file. */
  surface: RegExp;
  reason: string;
}

const EXEMPTIONS: Exemption[] = [
  // Spec docs use `adv-foo` as a placeholder in Given/When/Then scenarios.
  {
    skill: "adv-foo",
    surface: /^docs\/specs\//,
    reason: "scenario placeholder in spec documentation",
  },
  // Globally installed under ~/.config/opencode/skills/, declared in agent
  // manifests and the specs that govern them — never repo-local.
  {
    skill: "playwright-mcp",
    surface: /^(\.opencode\/agents\/|docs\/specs\/)/,
    reason: "globally-installed skill declared in agent manifests and their specs",
  },
  // Optional user-owned skill, referenced from ADV instruction docs and agent
  // manifests that mention it as an inline alternative.
  {
    skill: "prioritizer",
    surface: /^(ADV_INSTRUCTIONS\.md|docs\/user-intuit-protocol\.md|\.opencode\/agents\/)/,
    reason: "optional user-owned skill referenced from ADV instruction docs and agent manifests",
  },
  // Retired names surfaced in ADV_INSTRUCTIONS.md "Stale-reference note"
  // precisely to forbid them. A blind check cannot tell "call this" from
  // "never call this" without reading intent (heuristic — P33), so the note is
  // the guard's own complaint made durable. The guard's tests assert each name
  // stays unresolved, so the exemption cannot mask a restored live skill.
  {
    skill: "adv-review-methodology",
    surface: /^ADV_INSTRUCTIONS\.md$/,
    reason: "retired-skill do-not-call note",
  },
  {
    skill: "adv-apply-methodology",
    surface: /^ADV_INSTRUCTIONS\.md$/,
    reason: "retired-skill do-not-call note",
  },
  {
    skill: "adv-harden-methodology",
    surface: /^ADV_INSTRUCTIONS\.md$/,
    reason: "retired-skill do-not-call note",
  },
  {
    skill: "global-verify",
    surface: /^ADV_INSTRUCTIONS\.md$/,
    reason: "retired-skill do-not-call note",
  },
];

export function isExempt(skill: string, relPath: string): boolean {
  const p = toPosix(relPath);
  return EXEMPTIONS.some((e) => e.skill === skill && e.surface.test(p));
}

/** Enforced surface roots, relative to repo root. */
const ENFORCED_DIRS = ["skills", ".opencode/command", ".opencode/agents", ".opencode/overlays", "docs"];
const ENFORCED_ROOT_FILES = ["ADV_INSTRUCTIONS.md", "AGENTS.md", "project.md"];

/** Historical surfaces excluded from enforcement. */
const EXCLUDED_DIRS = [".adv/archive", "docs/adr"];
const EXCLUDED_FILES = ["CHANGELOG.md", "LICENSE-THIRD-PARTY.md"];

function toPosix(p: string): string {
  return p.split(sep).join("/");
}

export function isExcludedSurface(relPath: string): boolean {
  const p = toPosix(relPath);
  if (EXCLUDED_FILES.includes(p)) return true;
  return EXCLUDED_DIRS.some((dir) => p === dir || p.startsWith(`${dir}/`));
}

/**
 * Extract canonical skill references from source text.
 * Only `skill("name")` and `skills/name/` forms match.
 */
export function collectSkillReferences(source: string): SkillReference[] {
  const refs: SkillReference[] = [];
  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i];
    const line = i + 1;
    for (const re of [SKILL_CALL_RE, SKILL_PATH_RE]) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        refs.push({ skill: m[1], line });
      }
    }
  }
  return refs;
}

async function* walkMarkdown(dir: string): AsyncGenerator<string> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return; // missing enforced dir is not an error
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkMarkdown(full);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      yield full;
    }
  }
}

async function collectSkillNames(repoRoot: string): Promise<Set<string>> {
  const names = new Set<string>();
  const skillsDir = join(repoRoot, "skills");
  let entries;
  try {
    entries = await readdir(skillsDir, { withFileTypes: true });
  } catch {
    return names; // no skills dir -> nothing resolves
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const s = await stat(join(skillsDir, entry.name, "SKILL.md"));
      if (s.isFile()) names.add(entry.name);
    } catch {
      // no SKILL.md -> not a resolvable skill
    }
  }
  return names;
}

async function* iterEnforcedFiles(repoRoot: string): AsyncGenerator<string> {
  for (const dir of ENFORCED_DIRS) {
    yield* walkMarkdown(join(repoRoot, dir));
  }
  for (const file of ENFORCED_ROOT_FILES) {
    const full = join(repoRoot, file);
    try {
      const s = await stat(full);
      if (s.isFile()) yield full;
    } catch {
      // absent root file is not an error
    }
  }
}

export async function findUnresolvedReferences(
  repoRoot: string,
  existing: Set<string>,
): Promise<UnresolvedReference[]> {
  const unresolved: UnresolvedReference[] = [];
  for await (const filePath of iterEnforcedFiles(repoRoot)) {
    const relPath = toPosix(relative(repoRoot, filePath));
    if (isExcludedSurface(relPath)) continue;
    const source = await readFile(filePath, "utf-8");
    for (const ref of collectSkillReferences(source)) {
      if (isExempt(ref.skill, relPath)) continue;
      if (!existing.has(ref.skill)) {
        unresolved.push({ skill: ref.skill, file: relPath, line: ref.line });
      }
    }
  }
  return unresolved;
}

export async function runSkillReferenceCheck(repoRoot: string): Promise<UnresolvedReference[]> {
  const existing = await collectSkillNames(repoRoot);
  return findUnresolvedReferences(repoRoot, existing);
}

async function main() {
  const scriptDir = resolve(fileURLToPath(import.meta.url), "..");
  const repoRoot = resolve(scriptDir, "../..");
  const target = process.argv[2] ? resolve(process.argv[2]) : repoRoot;
  const unresolved = await runSkillReferenceCheck(target);
  if (unresolved.length > 0) {
    console.error("Unresolved skill references (rq-skillReferenceIntegrity01):");
    for (const u of unresolved) {
      console.error(`  ${u.file}:${u.line} -> skill \"${u.skill}\" has no skills/${u.skill}/SKILL.md`);
    }
    process.exit(1);
  }
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main();
}
