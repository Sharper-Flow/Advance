/**
 * Integration tests for the `config-vs-dependency-presence` arch-scan rule.
 *
 * The registry entry already exists (see `../registry.ts`). These tests
 * verify the rule fires correctly end-to-end through the public
 * {@link runCapabilityScan} orchestrator using on-disk fixture projects.
 *
 * Fixtures (POSITIVE / NEGATIVE):
 *   - `fixtures/knip-config-without-dep/` — config blocks present, no
 *     owning deps, no workspace hoist. Rule MUST fire.
 *   - `fixtures/knip-config-with-workspace-hoist/` — same shape plus a
 *     `pnpm-workspace.yaml` whose content matches the rule's exception
 *     signal. Rule MUST NOT fire.
 *
 * Read-only constraint: this test does not modify registry.ts, schema.ts,
 * evaluator.ts, scan.ts, or report.ts.
 */
import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import { runCapabilityScan } from "../scan";
import { findCapabilityRelationship } from "../registry";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_POSITIVE = join(
  HERE,
  "fixtures",
  "knip-config-without-dep",
);
const FIXTURE_HOIST = join(
  HERE,
  "fixtures",
  "knip-config-with-workspace-hoist",
);
const FIXTURE_MIXED = join(
  HERE,
  "fixtures",
  "config-with-unrelated-owner-dep",
);

const RULE_ID = "config-vs-dependency-presence";

/**
 * Locate the finding whose trigger evidence `matchedSignal` contains the
 * given tool name (e.g. "knip", "eslintConfig"). The trigger regex captures
 * the alternation arm verbatim, so the matched signal is the literal
 * `"tool":` substring.
 */
function findingForTool(
  findings: ReadonlyArray<{
    readonly relationship_id: string;
    readonly evidence: ReadonlyArray<{
      readonly role: string;
      readonly matchedSignal?: string;
    }>;
  }>,
  tool: string,
) {
  return findings.find((f) =>
    f.evidence.some(
      (e) =>
        e.role === "trigger" &&
        typeof e.matchedSignal === "string" &&
        e.matchedSignal.includes(tool),
    ),
  );
}

describe("rule: config-vs-dependency-presence", () => {
  test("registry entry declares the five tool→dependency mappings", () => {
    // AC: All 5 mappings present in registry entry's acceptable_counterparts.
    const entry = findCapabilityRelationship(RULE_ID);
    expect(entry).toBeDefined();
    expect(entry!.id).toBe(RULE_ID);
    expect(entry!.detection_phase).toBe(1);
    expect(entry!.severity_hint).toBe("major");
    expect(entry!.confidence).toBe("high");
    expect(entry!.acceptable_counterparts).toHaveLength(5);

    // Sanity: each expected tool name appears in some counterpart description,
    // confirming the five mappings cover knip / eslint / prettier / stylelint /
    // commitlint (the trigger alternation arms and their owning deps).
    const descriptions = entry!.acceptable_counterparts
      .map((c) => c.description)
      .join("\n");
    expect(descriptions).toContain("knip");
    expect(descriptions).toContain("eslint");
    expect(descriptions).toContain("prettier");
    expect(descriptions).toContain("stylelint");
    expect(descriptions).toContain("@commitlint/cli");
  });

  test("fires a major/high finding for a `knip` config block without the knip dependency", async () => {
    // AC: Fixture produces a CapabilityFinding with the required shape.
    const result = await runCapabilityScan({
      repoRoot: FIXTURE_POSITIVE,
      phase: 1,
      relationshipId: RULE_ID,
    });

    const ruleFindings = result.findings.filter(
      (f) => f.relationship_id === RULE_ID,
    );
    expect(ruleFindings.length).toBeGreaterThan(0);

    const knipFinding = findingForTool(ruleFindings, "knip");
    expect(knipFinding).toBeDefined();

    // Required shape (AC).
    expect(knipFinding!.relationship_id).toBe(RULE_ID);
    expect(knipFinding!.category).toBe("capability-consistency");
    expect(knipFinding!.severity).toBe("major");
    expect(knipFinding!.confidence).toBe("high");
    expect(knipFinding!.detection_method).toBe("regex");

    // P34: every finding has file:line evidence.
    const triggerEv = knipFinding!.evidence.find((e) => e.role === "trigger");
    expect(triggerEv).toBeDefined();
    expect(triggerEv!.file).toBe("package.json");
    expect(typeof triggerEv!.line).toBe("number");
    expect(triggerEv!.line).toBeGreaterThan(0);
    // Exact line of the `"knip":` config block (see fixture README line map).
    expect(triggerEv!.line).toBe(8);
    expect(triggerEv!.matchedSignal).toContain("knip");

    // searched_scope evidence is attached (evaluator invariant).
    const searchedEv = knipFinding!.evidence.find(
      (e) => e.role === "searched_scope",
    );
    expect(searchedEv).toBeDefined();

    // Absence proof records the dependency search scope.
    expect(knipFinding!.absence_proof).toBeDefined();
    const proof = knipFinding!.absence_proof!;
    expect(proof.searchedRoots.length).toBeGreaterThan(0);
    expect(proof.includedGlobs).toContain("**/package.json");
    expect(Array.isArray(proof.excludedGlobs)).toBe(true);
    expect(Array.isArray(proof.parseFailures)).toBe(true);
  });

  test("emits multiple findings when eslintConfig and prettier blocks also lack their owning deps", async () => {
    const result = await runCapabilityScan({
      repoRoot: FIXTURE_POSITIVE,
      phase: 1,
      relationshipId: RULE_ID,
    });

    const ruleFindings = result.findings.filter(
      (f) => f.relationship_id === RULE_ID,
    );

    // Three distinct config-block trigger hits → three findings.
    expect(ruleFindings).toHaveLength(3);

    const eslintFinding = findingForTool(ruleFindings, "eslintConfig");
    const prettierFinding = findingForTool(ruleFindings, "prettier");
    expect(eslintFinding).toBeDefined();
    expect(prettierFinding).toBeDefined();

    // All findings inherit severity/confidence from the registry entry.
    for (const f of ruleFindings) {
      expect(f.severity).toBe("major");
      expect(f.confidence).toBe("high");
    }

    // Trigger evidence points at the exact config-block line of each tool.
    const eslintLine = eslintFinding!.evidence.find(
      (e) => e.role === "trigger",
    )?.line;
    const prettierLine = prettierFinding!.evidence.find(
      (e) => e.role === "trigger",
    )?.line;
    expect(eslintLine).toBe(11);
    expect(prettierLine).toBe(14);
  });

  test("does not let one tool dependency satisfy another tool's config block", async () => {
    const result = await runCapabilityScan({
      repoRoot: FIXTURE_MIXED,
      phase: 1,
      relationshipId: RULE_ID,
    });

    // `prettier` is installed, so its block is satisfied. `knip` remains
    // unowned and must still produce the AC2-style finding.
    expect(findingForTool(result.findings, "prettier")).toBeUndefined();
    expect(findingForTool(result.findings, "knip")).toBeDefined();
  });

  test("does NOT fire when pnpm-workspace.yaml declares a hoist pattern (exception signal)", async () => {
    const result = await runCapabilityScan({
      repoRoot: FIXTURE_HOIST,
      phase: 1,
      relationshipId: RULE_ID,
    });

    const ruleFindings = result.findings.filter(
      (f) => f.relationship_id === RULE_ID,
    );

    // Exception signal suppresses every trigger hit → no findings.
    expect(ruleFindings).toHaveLength(0);

    // Coverage reports the relationship as applied (suppressed, not skipped).
    expect(result.coverage.appliedRelationships).toContain(RULE_ID);

    // Reason mentions the exception suppression.
    // (appliedRelationships is a string list; reason lives on the coverage
    // object only for skipped/degraded, so we instead assert no findings and
    // applied state — the observable contract.)
  });
});
