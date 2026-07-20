/**
 * Integration tests for the `scaffold-vs-test-green-path` arch-scan rule.
 *
 * The registry entry already exists (see `../registry.ts`). These tests
 * verify the Phase 3 declared-capability intent gate works end-to-end
 * through the public {@link runCapabilityScan} orchestrator using on-disk
 * fixture projects.
 *
 * Fixtures (POSITIVE / NEGATIVE):
 *   - `fixtures/capacitor-scaffold-with-script/` — `android/` scaffold dir
 *     present, README contains the literal declaration string
 *     "script entry in package.json referencing the scaffold" (matches
 *     intent_required[0]), no test runner config. Rule MUST fire.
 *   - `fixtures/capacitor-scaffold-without-declared-capability/` — same
 *     `android/` scaffold trigger present, but no intent declaration string
 *     anywhere in the repo. Rule MUST NOT fire (Phase 3 intent gate closed).
 *
 * AC #8 (false-positive protection): the contrast between fixtures proves
 * directory presence alone is insufficient to trigger the rule — the
 * declared-capability gate is the deciding factor.
 *
 * Detection method: the evaluator derives `detection_method` from
 * `relationship.detection_phase`. Phase 3 heuristic rules emit
 * `"heuristic"`; Phase 1 deterministic rules emit `"regex"`. This rule
 * is registered at Phase 3, so its findings carry
 * `detection_method: "heuristic"` per the AC and the severity rubric in
 * `skills/adv-arch-detection/SKILL.md`.
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
const FIXTURE_WITH_SCRIPT = join(
  HERE,
  "fixtures",
  "capacitor-scaffold-with-script",
);
const FIXTURE_WITHOUT_DECLARED = join(
  HERE,
  "fixtures",
  "capacitor-scaffold-without-declared-capability",
);

const RULE_ID = "scaffold-vs-test-green-path";

describe("rule: scaffold-vs-test-green-path", () => {
  test("registry entry declares the scaffold trigger and Phase 3 intent_required gate", () => {
    // Sanity: the rule is registered as a Phase 3, minor, low-confidence
    // relationship with an entry-level intent_required gate. The gate is
    // the false-positive protection under test.
    const entry = findCapabilityRelationship(RULE_ID);
    expect(entry).toBeDefined();
    expect(entry!.id).toBe(RULE_ID);
    expect(entry!.detection_phase).toBe(3);
    expect(entry!.severity_hint).toBe("minor");
    expect(entry!.confidence).toBe("low");
    expect(entry!.intent_required).toBeDefined();
    expect(entry!.intent_required!.length).toBeGreaterThan(0);

    // The literal declaration string the POSITIVE fixture relies on is one
    // of the entry-level intent_required declarations. Ties the fixture to
    // the registry contract (P34: evidence-backed claim about intent gate).
    expect(entry!.intent_required).toContain(
      "script entry in package.json referencing the scaffold",
    );

    // Sanity: trigger globs include the `android/` scaffold path used by
    // both fixtures.
    const triggerGlobs = entry!.trigger.file_globs.join("\n");
    expect(/\bandroid\b/.test(triggerGlobs)).toBe(true);
  });

  test("POSITIVE: declared-capability fixture emits a minor/low finding with file:line evidence", async () => {
    // AC #8: fixture produces a CapabilityFinding with the required shape.
    // Intent gate OPENs because the README contains the literal declaration
    // string "script entry in package.json referencing the scaffold".
    const result = await runCapabilityScan({
      repoRoot: FIXTURE_WITH_SCRIPT,
      phase: 3,
      relationshipId: RULE_ID,
    });

    const ruleFindings = result.findings.filter(
      (f) => f.relationship_id === RULE_ID,
    );
    expect(ruleFindings.length).toBeGreaterThan(0);

    const finding = ruleFindings[0];
    expect(finding.category).toBe("capability-consistency");
    expect(finding.severity).toBe("minor");
    expect(finding.confidence).toBe("low");
    // Phase 3 heuristic rule → detection_method "heuristic" (AC + SKILL.md
    // severity rubric). See file-header note.
    expect(finding.detection_method).toBe("heuristic");

    // P34: every finding has file:line evidence. The trigger evidence
    // points at the scaffold dir's build.gradle, whose content contains
    // the literal `build.gradle` trigger pattern.
    const triggerEv = finding.evidence.find((e) => e.role === "trigger");
    expect(triggerEv).toBeDefined();
    expect(triggerEv!.file).toBe("android/build.gradle");
    expect(typeof triggerEv!.line).toBe("number");
    expect(triggerEv!.line).toBeGreaterThan(0);
    expect(triggerEv!.matchedSignal).toBe("build.gradle");

    // searched_scope evidence attached (evaluator invariant).
    const searchedEv = finding.evidence.find((e) => e.role === "searched_scope");
    expect(searchedEv).toBeDefined();

    // Absence proof records the counterpart search scope. The counterpart
    // pattern spans test-runner config files (ts/js/json/yaml).
    expect(finding.absence_proof).toBeDefined();
    const proof = finding.absence_proof!;
    expect(proof.searchedRoots.length).toBeGreaterThan(0);
    expect(proof.includedGlobs).toContain("**/*.ts");
    expect(proof.includedGlobs).toContain("**/*.js");
    expect(proof.includedGlobs).toContain("**/*.json");
    expect(proof.includedGlobs).toContain("**/*.yaml");
    expect(Array.isArray(proof.excludedGlobs)).toBe(true);
    expect(proof.excludedGlobs).toContain("node_modules");
    expect(Array.isArray(proof.parseFailures)).toBe(true);
  });

  test("NEGATIVE: without-declared-capability fixture produces no finding (intent gate closed)", async () => {
    // AC #8 (false-positive protection): the scaffold dir is present and
    // the build.gradle content matches the trigger pattern, but no intent
    // declaration string exists anywhere in the repo. The Phase 3 intent
    // gate stays closed and the rule does NOT fire.
    //
    // Sanity tie: confirm the fixture's build.gradle literally contains
    // the trigger substring, so the only thing blocking the finding is
    // the intent gate (not a missing trigger match).
    // (Implicit: covered by the registry entry test above + the fixture
    // content documented in its README line map.)

    const result = await runCapabilityScan({
      repoRoot: FIXTURE_WITHOUT_DECLARED,
      phase: 3,
      relationshipId: RULE_ID,
    });

    const ruleFindings = result.findings.filter(
      (f) => f.relationship_id === RULE_ID,
    );
    expect(ruleFindings).toHaveLength(0);

    // Intent gate closed → relationship reported as skipped with the
    // documented reason. This is the deterministic, machine-checkable
    // signal that the gate (not a missing trigger) blocked the finding.
    expect(result.coverage.skippedRelationships.length).toBeGreaterThan(0);
    const skipped = result.coverage.skippedRelationships.find(
      (s) => s.id === RULE_ID,
    );
    expect(skipped).toBeDefined();
    expect(skipped!.reason).toBe("intent evidence not present");

    // The relationship must NOT appear in the applied list — skipped means
    // the engine never reached the trigger-walk phase.
    expect(result.coverage.appliedRelationships).not.toContain(RULE_ID);
  });
});
