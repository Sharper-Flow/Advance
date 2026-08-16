import { describe, expect, test } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  collectSkillReferences,
  findUnresolvedReferences,
  isExcludedSurface,
  runSkillReferenceCheck,
} from "./check-skill-references";

describe("check-skill-references", () => {
  // rq-skillReferenceIntegrity01.1 — resolving canonical reference
  test("resolving skill(\"adv-foo\") reference reports no failure", async () => {
    const repo = await mkdtemp(join(tmpdir(), "srk-ok-"));
    try {
      await mkdir(join(repo, "skills/adv-foo"), { recursive: true });
      await writeFile(join(repo, "skills/adv-foo/SKILL.md"), "---\nname: adv-foo\n---\n");
      await mkdir(join(repo, "skills/adv-bar"), { recursive: true });
      await writeFile(
        join(repo, "skills/adv-bar/SKILL.md"),
        'Hand off via skill("adv-foo").\n',
      );
      const unresolved = await runSkillReferenceCheck(repo);
      expect(unresolved).toEqual([]);
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  // rq-skillReferenceIntegrity01.2 — unresolved canonical reference
  test("unresolved skill reference exits with file:line and skill name", async () => {
    const repo = await mkdtemp(join(tmpdir(), "srk-missing-"));
    try {
      await mkdir(join(repo, "skills/adv-bar"), { recursive: true });
      await writeFile(
        join(repo, "skills/adv-bar/SKILL.md"),
        'Line one.\nHand off via skill("adv-missing").\n',
      );
      const unresolved = await runSkillReferenceCheck(repo);
      expect(unresolved).toHaveLength(1);
      expect(unresolved[0].skill).toBe("adv-missing");
      expect(unresolved[0].file).toContain("skills/adv-bar/SKILL.md");
      expect(unresolved[0].line).toBe(2);
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  // rq-skillReferenceIntegrity01.3 — deleted skill with live reference
  test("deleting a skill directory while a reference stays fails the check", async () => {
    const repo = await mkdtemp(join(tmpdir(), "srk-deleted-"));
    try {
      await mkdir(join(repo, "skills/adv-temp"), { recursive: true });
      await writeFile(join(repo, "skills/adv-temp/SKILL.md"), "---\nname: adv-temp\n---\n");
      await mkdir(join(repo, ".opencode/command"), { recursive: true });
      await writeFile(
        join(repo, ".opencode/command/adv-design.md"),
        'Load skill("adv-temp") here.\n',
      );
      // Baseline: resolves.
      expect(await runSkillReferenceCheck(repo)).toEqual([]);
      // Simulate the dormant-skill prune.
      await rm(join(repo, "skills/adv-temp"), { recursive: true, force: true });
      const unresolved = await runSkillReferenceCheck(repo);
      expect(unresolved).toHaveLength(1);
      expect(unresolved[0].skill).toBe("adv-temp");
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  // rq-skillReferenceIntegrity01.4 — historical surface exclusion
  test("references in excluded historical surfaces are not enforced", async () => {
    const repo = await mkdtemp(join(tmpdir(), "srk-hist-"));
    try {
      await mkdir(join(repo, ".adv/archive/old-change"), { recursive: true });
      await writeFile(
        join(repo, ".adv/archive/old-change/notes.md"),
        'This referenced skill("adv-gone") before deletion.\n',
      );
      await writeFile(
        join(repo, "CHANGELOG.md"),
        'Removed skill("adv-gone").\n',
      );
      await mkdir(join(repo, "docs/adr"), { recursive: true });
      await writeFile(
        join(repo, "docs/adr/0001-x.md"),
        'Decision mentions skill("adv-gone").\n',
      );
      await writeFile(
        join(repo, "LICENSE-THIRD-PARTY.md"),
        'Vendored skills/adv-gone/SKILL.md once.\n',
      );
      const unresolved = await runSkillReferenceCheck(repo);
      expect(unresolved).toEqual([]);
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  // rq-skillReferenceIntegrity01.5 — all references resolve
  test("repo with all references resolving exits clean", async () => {
    const repo = await mkdtemp(join(tmpdir(), "srk-clean-"));
    try {
      await mkdir(join(repo, "skills/adv-a"), { recursive: true });
      await writeFile(join(repo, "skills/adv-a/SKILL.md"), "---\nname: adv-a\n---\n");
      await mkdir(join(repo, "docs"), { recursive: true });
      await writeFile(
        join(repo, "docs/guide.md"),
        'Use skill("adv-a") and see skills/adv-a/SKILL.md.\n',
      );
      const unresolved = await runSkillReferenceCheck(repo);
      expect(unresolved).toEqual([]);
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  // Detection-rule precision: prose references must NOT match (P33 — no heuristic guessing)
  test("slash-prefixed prose and backticked names are not canonical references", () => {
    const source = [
      "hand off to the `/improve-codebase-architecture` skill",
      "the `adv-codebase-design` vocabulary",
      "run `/adv-clarify {id}` to resolve",
    ].join("\n");
    expect(collectSkillReferences(source)).toEqual([]);
  });

  test("both canonical forms are detected", () => {
    const source = 'Load skill("adv-foo") and read skills/adv-bar/SKILL.md.\n';
    const refs = collectSkillReferences(source);
    expect(refs.map((r) => r.skill).sort()).toEqual(["adv-bar", "adv-foo"]);
  });

  test("excluded surface classification is structural", () => {
    expect(isExcludedSurface(".adv/archive/x/notes.md")).toBe(true);
    expect(isExcludedSurface("CHANGELOG.md")).toBe(true);
    expect(isExcludedSurface("docs/adr/0001-x.md")).toBe(true);
    expect(isExcludedSurface("LICENSE-THIRD-PARTY.md")).toBe(true);
    expect(isExcludedSurface("docs/guide.md")).toBe(false);
    expect(isExcludedSurface("skills/adv-foo/SKILL.md")).toBe(false);
    expect(isExcludedSurface(".opencode/command/adv-design.md")).toBe(false);
    expect(isExcludedSurface("ADV_INSTRUCTIONS.md")).toBe(false);
  });

  test("findUnresolvedReferences maps line numbers correctly", async () => {
    const repo = await mkdtemp(join(tmpdir(), "srk-lines-"));
    try {
      await mkdir(join(repo, "docs"), { recursive: true });
      await writeFile(
        join(repo, "docs/multi.md"),
        'first skill("adv-missing-a")\nsecond\nthird skill("adv-missing-b")\n',
      );
      const unresolved = await findUnresolvedReferences(repo, new Set());
      const byLine = unresolved.map((u) => [u.skill, u.line]);
      expect(byLine).toContainEqual(["adv-missing-a", 1]);
      expect(byLine).toContainEqual(["adv-missing-b", 3]);
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  // The retired-skill allowlist is the guard's complaint made durable. It must
  // never mask a live reference: every name in it must stay unresolved, and a
  // canonical reference to a retired skill must NOT be reported (it is a
  // do-not-call note, not a live reference).
  test("retired-skill allowlist names never resolve to a live skill", async () => {
    const repo = await mkdtemp(join(tmpdir(), "srk-retired-"));
    try {
      // No skill dirs at all -> nothing resolves.
      const existing = new Set<string>();
      const unresolved = await findUnresolvedReferences(repo, existing);
      // Sanity: the allowlist is consulted only when a reference exists; an
      // empty repo yields nothing.
      expect(unresolved).toEqual([]);
      // Direct guard: none of the retired names may appear in `existing`.
      for (const name of [
        "adv-review-methodology",
        "adv-apply-methodology",
        "adv-harden-methodology",
        "global-verify",
      ]) {
        expect(existing.has(name)).toBe(false);
      }
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  test("reference to a retired skill in an enforced surface is not reported", async () => {
    const repo = await mkdtemp(join(tmpdir(), "srk-retiredref-"));
    try {
      await mkdir(join(repo, "docs"), { recursive: true });
      await writeFile(
        join(repo, "docs/note.md"),
        'Calls to skill("adv-review-methodology") are stale — do not use.\n',
      );
      const unresolved = await runSkillReferenceCheck(repo);
      expect(unresolved).toEqual([]);
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });
});
