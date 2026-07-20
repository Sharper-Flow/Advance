import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

import { evaluateRelationship } from "./evaluator";
import type { CapabilityRelationship } from "./registry";

/**
 * Build a minimal, fully-typed CapabilityRelationship for evaluator tests.
 * Defaults describe a Phase 1 TODO-without-FIX relationship scoped to *.md.
 */
function makeRelationship(
  overrides: Partial<CapabilityRelationship> = {},
): CapabilityRelationship {
  const base: CapabilityRelationship = {
    id: "test-todo-vs-fix",
    title: "TODO marker without FIX counterpart",
    detection_phase: 1,
    trigger: {
      file_globs: ["**/*.md"],
      pattern: /TODO/g,
      description: "TODO marker found without a paired FIX.",
    },
    acceptable_counterparts: [
      {
        description: "RESOLVED marker present in any *.md file.",
        file_globs: ["**/*.md"],
        pattern: /RESOLVED/,
      },
    ],
    exception_signals: [],
    severity_hint: "minor",
    confidence: "high",
  };
  return { ...base, ...overrides } as CapabilityRelationship;
}

describe("evaluateRelationship", () => {
  let repoRoot: string;

  beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), "arch-scan-evaluator-"));
  });

  afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  test("produces a finding with trigger evidence when no counterpart matches", async () => {
    await mkdir(join(repoRoot, "docs"), { recursive: true });
    await writeFile(
      join(repoRoot, "docs", "a.md"),
      "line one\nTODO: do something\nline three\n",
    );

    const result = await evaluateRelationship(makeRelationship(), { repoRoot });

    expect(result.findings).toHaveLength(1);
    const finding = result.findings[0];
    expect(finding.relationship_id).toBe("test-todo-vs-fix");
    expect(finding.category).toBe("capability-consistency");
    expect(finding.detection_method).toBe("regex");

    const triggerEv = finding.evidence.find((e) => e.role === "trigger");
    expect(triggerEv).toBeDefined();
    expect(triggerEv?.file).toBe("docs/a.md");
    expect(triggerEv?.line).toBe(2);
    expect(triggerEv?.matchedSignal).toBe("TODO");

    expect(finding.absence_proof).toBeDefined();
    expect(finding.absence_proof?.searchedRoots.length).toBeGreaterThan(0);
    expect(finding.absence_proof?.includedGlobs).toContain("**/*.md");
    expect(Array.isArray(finding.absence_proof?.parseFailures)).toBe(true);

    expect(result.coverage_entry.id).toBe("test-todo-vs-fix");
    expect(result.coverage_entry.state).toBe("applied");
  });

  test("does not emit a finding when an acceptable counterpart matches", async () => {
    await mkdir(join(repoRoot, "docs"), { recursive: true });
    await writeFile(join(repoRoot, "docs", "a.md"), "TODO: x\nRESOLVED: y\n");

    const result = await evaluateRelationship(makeRelationship(), { repoRoot });

    expect(result.findings).toHaveLength(0);
    expect(result.coverage_entry.state).toBe("applied");
    expect(result.coverage_entry.reason).toContain("counterpart");
  });

  test("counterpart match in a different file suppresses the finding", async () => {
    await mkdir(join(repoRoot, "docs"), { recursive: true });
    await writeFile(join(repoRoot, "docs", "trigger.md"), "TODO: x\n");
    await writeFile(
      join(repoRoot, "docs", "fixed.md"),
      "RESOLVED: handled elsewhere\n",
    );

    const result = await evaluateRelationship(makeRelationship(), { repoRoot });

    expect(result.findings).toHaveLength(0);
    expect(result.coverage_entry.state).toBe("applied");
  });

  test("exception signal suppresses the finding", async () => {
    const rel = makeRelationship({
      exception_signals: [
        {
          description: "WONTFIX annotation present.",
          file_globs: ["**/*.md"],
          pattern: /WONTFIX/,
        },
      ],
    });
    await mkdir(join(repoRoot, "docs"), { recursive: true });
    await writeFile(join(repoRoot, "docs", "a.md"), "TODO: x\nWONTFIX\n");

    const result = await evaluateRelationship(rel, { repoRoot });

    expect(result.findings).toHaveLength(0);
    expect(result.coverage_entry.state).toBe("applied");
    expect(result.coverage_entry.reason).toContain("exception");
  });

  test("Phase 3 rule with intent_required does NOT fire when intent absent", async () => {
    const rel = makeRelationship({
      detection_phase: 3,
      intent_required: [
        "explicit declared intent for this workflow",
      ],
    });
    await mkdir(join(repoRoot, "docs"), { recursive: true });
    await writeFile(join(repoRoot, "docs", "a.md"), "TODO: x\n");

    const result = await evaluateRelationship(rel, { repoRoot });

    expect(result.findings).toHaveLength(0);
    expect(result.coverage_entry.state).toBe("skipped");
    expect(result.coverage_entry.reason).toContain("intent");
  });

  test("Phase 3 rule fires when intent declaration is present in repo", async () => {
    const rel = makeRelationship({
      detection_phase: 3,
      intent_required: [
        "explicit declared intent for this workflow",
      ],
    });
    await mkdir(join(repoRoot, "docs"), { recursive: true });
    await writeFile(join(repoRoot, "docs", "a.md"), "TODO: x\n");
    await writeFile(
      join(repoRoot, "README.md"),
      "# Project\n\nThis repo carries an explicit declared intent for this workflow.\n",
    );

    const result = await evaluateRelationship(rel, { repoRoot });

    expect(result.findings).toHaveLength(1);
    expect(result.coverage_entry.state).toBe("applied");
    // Phase 3 → "heuristic" (detection_method derived from detection_phase).
    expect(result.findings[0].detection_method).toBe("heuristic");
  });

  test("skips with a documented reason when no trigger files are in scope", async () => {
    await writeFile(join(repoRoot, "notes.txt"), "no markdown here\n");

    const result = await evaluateRelationship(makeRelationship(), { repoRoot });

    expect(result.findings).toHaveLength(0);
    expect(result.coverage_entry.state).toBe("skipped");
    expect(result.coverage_entry.reason).toContain("trigger");
  });

  test("file traversal stays bounded by trigger.file_globs", async () => {
    // Trigger globs say **/*.md. A TODO in a .txt file must NOT trigger.
    await writeFile(join(repoRoot, "notes.txt"), "TODO: should not match\n");

    const result = await evaluateRelationship(makeRelationship(), { repoRoot });

    expect(result.findings).toHaveLength(0);
    expect(result.coverage_entry.state).toBe("skipped");
  });

  test("emits one finding per trigger match site", async () => {
    await mkdir(join(repoRoot, "docs"), { recursive: true });
    await writeFile(
      join(repoRoot, "docs", "a.md"),
      "TODO: one\nsome text\nTODO: two\n",
    );

    const result = await evaluateRelationship(makeRelationship(), { repoRoot });

    expect(result.findings).toHaveLength(2);
    const lines = result.findings.map((f) =>
      f.evidence.find((e) => e.role === "trigger")?.line,
    );
    expect(lines).toEqual([1, 3]);
  });

  test("respects regexTimeoutMs by aborting on a long-running pattern", async () => {
    // Craft a regex that produces many matches across a large body. The
    // timeout is set deliberately low (1ms) to force a degraded result.
    const rel = makeRelationship({
      trigger: {
        file_globs: ["**/*.md"],
        pattern: /a/g,
        description: "match every 'a'",
      },
    });
    await mkdir(join(repoRoot, "docs"), { recursive: true });
    await writeFile(
      join(repoRoot, "docs", "big.md"),
      "a".repeat(200000) + "\n",
    );

    const result = await evaluateRelationship(rel, {
      repoRoot,
      regexTimeoutMs: 1,
    });

    expect(result.coverage_entry.state).toBe("degraded");
    expect(result.coverage_entry.reason).toContain("timeout");
  });

  test("finding evidence includes a searched_scope entry (P34)", async () => {
    await mkdir(join(repoRoot, "docs"), { recursive: true });
    await writeFile(join(repoRoot, "docs", "a.md"), "TODO\n");

    const result = await evaluateRelationship(makeRelationship(), { repoRoot });

    expect(result.findings).toHaveLength(1);
    const searched = result.findings[0].evidence.find(
      (e) => e.role === "searched_scope",
    );
    expect(searched).toBeDefined();
    expect(typeof searched?.file).toBe("string");
  });

  test("treats entry-level severity_hint and confidence as finding fields", async () => {
    const rel = makeRelationship({
      severity_hint: "major",
      confidence: "medium",
    });
    await mkdir(join(repoRoot, "docs"), { recursive: true });
    await writeFile(join(repoRoot, "docs", "a.md"), "TODO\n");

    const result = await evaluateRelationship(rel, { repoRoot });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].severity).toBe("major");
    expect(result.findings[0].confidence).toBe("medium");
  });
});
