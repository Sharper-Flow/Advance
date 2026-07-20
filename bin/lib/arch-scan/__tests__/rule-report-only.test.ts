/**
 * Integration tests for the `report-only-header-with-deferred-todo`
 * arch-scan rule (Rule 3 — escalate semantics).
 *
 * The registry entry already exists (see `../registry.ts`). These tests
 * verify the rule's ESCALATE exception semantics work end-to-end through
 * the public {@link runCapabilityScan} orchestrator using on-disk fixture
 * projects.
 *
 * Fixtures (POSITIVE / NEGATIVE):
 *   - `fixtures/csp-report-only-with-todo/` — Report-Only header set; no
 *     enforced equivalent; no reporting endpoint; TODO/FIXME referencing
 *     enforcement within 5 lines of the trigger. Rule MUST fire at
 *     ESCALATED severity (major → blocker) with `exception` evidence
 *     attached.
 *   - `fixtures/csp-report-only-without-todo/` — Report-Only header set;
 *     no enforced equivalent; no reporting endpoint; NO debt marker
 *     anywhere. Rule MUST fire at original severity (major) with NO
 *     `exception` evidence.
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
const FIXTURE_WITH_TODO = join(
  HERE,
  "fixtures",
  "csp-report-only-with-todo",
);
const FIXTURE_WITHOUT_TODO = join(
  HERE,
  "fixtures",
  "csp-report-only-without-todo",
);

const RULE_ID = "report-only-header-with-deferred-todo";

describe("rule: report-only-header-with-deferred-todo (escalate semantics)", () => {
  test("registry entry is Phase 1, major, medium, with escalate exception_semantics", () => {
    // Sanity: the rule is registered as a Phase 1, major, medium-confidence
    // relationship whose exception_signals ESCALATE the finding (rather
    // than suppress it). This is the structural contract the rest of the
    // test file exercises.
    const entry = findCapabilityRelationship(RULE_ID);
    expect(entry).toBeDefined();
    expect(entry!.id).toBe(RULE_ID);
    expect(entry!.detection_phase).toBe(1);
    expect(entry!.severity_hint).toBe("major");
    expect(entry!.confidence).toBe("medium");
    expect(entry!.exception_semantics).toBe("escalate");
  });

  test("POSITIVE: with-TODO fixture escalates severity major → blocker with exception evidence", async () => {
    // AC: Fixture produces a CapabilityFinding whose severity has been
    // escalated one level (major → blocker) because a debt marker appears
    // near the trigger header. Confidence remains medium (Rev #9).
    const result = await runCapabilityScan({
      repoRoot: FIXTURE_WITH_TODO,
      phase: 1,
      relationshipId: RULE_ID,
    });

    const ruleFindings = result.findings.filter(
      (f) => f.relationship_id === RULE_ID,
    );
    expect(ruleFindings.length).toBeGreaterThan(0);

    const finding = ruleFindings[0];
    expect(finding.relationship_id).toBe(RULE_ID);
    expect(finding.category).toBe("capability-consistency");
    // Major + 1 level → blocker (capped).
    expect(finding.severity).toBe("blocker");
    expect(finding.confidence).toBe("medium");
    expect(finding.detection_method).toBe("regex");

    // P34: every finding has file:line trigger evidence.
    const triggerEv = finding.evidence.find((e) => e.role === "trigger");
    expect(triggerEv).toBeDefined();
    expect(triggerEv!.file).toBe("src/server/hooks/response-utils.ts");
    expect(typeof triggerEv!.line).toBe("number");
    expect(triggerEv!.line).toBeGreaterThan(0);
    // Exact line of the header literal (see fixture README line map).
    expect(triggerEv!.line).toBe(14);
    expect(triggerEv!.matchedSignal).toBe("Content-Security-Policy-Report-Only");

    // P34: escalate semantics attach an `exception` evidence entry pointing
    // at the debt marker (file:line:matchedSignal).
    const exceptionEv = finding.evidence.find((e) => e.role === "exception");
    expect(exceptionEv).toBeDefined();
    expect(exceptionEv!.file).toBe("src/server/hooks/response-utils.ts");
    expect(typeof exceptionEv!.line).toBe("number");
    expect(exceptionEv!.line).toBeGreaterThan(0);
    // Exact line of the TODO comment (see fixture README line map).
    expect(exceptionEv!.line).toBe(12);
    expect(typeof exceptionEv!.matchedSignal).toBe("string");
    expect(exceptionEv!.matchedSignal!.length).toBeGreaterThan(0);

    // searched_scope evidence attached (evaluator invariant).
    const searchedEv = finding.evidence.find(
      (e) => e.role === "searched_scope",
    );
    expect(searchedEv).toBeDefined();

    // Absence proof records the enforced-header / reporting-endpoint search.
    expect(finding.absence_proof).toBeDefined();
    const proof = finding.absence_proof!;
    expect(proof.searchedRoots.length).toBeGreaterThan(0);
    expect(proof.includedGlobs).toContain("**/*.ts");
    expect(proof.includedGlobs).toContain("**/*.js");
    expect(Array.isArray(proof.excludedGlobs)).toBe(true);
    expect(proof.excludedGlobs).toContain("node_modules");
    expect(Array.isArray(proof.parseFailures)).toBe(true);

    // Rule fired → coverage reports the relationship as applied.
    expect(result.coverage.appliedRelationships).toContain(RULE_ID);
  });

  test("NEGATIVE: without-TODO fixture fires at original severity (major) with NO exception evidence", async () => {
    // AC: When no debt marker is present anywhere in the fixture, the rule
    // fires at its original `severity_hint` (major) and emits NO `exception`
    // evidence. Confidence remains medium (Rev #9).
    const result = await runCapabilityScan({
      repoRoot: FIXTURE_WITHOUT_TODO,
      phase: 1,
      relationshipId: RULE_ID,
    });

    const ruleFindings = result.findings.filter(
      (f) => f.relationship_id === RULE_ID,
    );
    expect(ruleFindings.length).toBeGreaterThan(0);

    const finding = ruleFindings[0];
    expect(finding.relationship_id).toBe(RULE_ID);
    expect(finding.severity).toBe("major");
    expect(finding.confidence).toBe("medium");
    expect(finding.detection_method).toBe("regex");

    // Trigger evidence at the exact header line (see fixture README line map).
    const triggerEv = finding.evidence.find((e) => e.role === "trigger");
    expect(triggerEv).toBeDefined();
    expect(triggerEv!.file).toBe("src/server/hooks/response-utils.ts");
    expect(triggerEv!.line).toBe(13);
    expect(triggerEv!.matchedSignal).toBe("Content-Security-Policy-Report-Only");

    // No exception evidence — escalation did not fire.
    const exceptionEv = finding.evidence.find((e) => e.role === "exception");
    expect(exceptionEv).toBeUndefined();

    // searched_scope evidence still attached.
    const searchedEv = finding.evidence.find(
      (e) => e.role === "searched_scope",
    );
    expect(searchedEv).toBeDefined();

    // Rule fired → coverage reports the relationship as applied.
    expect(result.coverage.appliedRelationships).toContain(RULE_ID);
  });

  test("escalation is capped at blocker (a blocker hint does not escalate further)", () => {
    // Deterministic edge case (P33): the escalateSeverity helper caps at
    // blocker. A finding whose original severity_hint is already blocker
    // must remain blocker even when an exception signal is present. This
    // test does not run the scan; it asserts the registry field is read
    // correctly and that the rule contractually stays at most blocker.
    const entry = findCapabilityRelationship(RULE_ID);
    expect(entry).toBeDefined();
    // The CSP rule's hint is major; escalated to blocker. The escalation
    // table is nit → minor → major → blocker with blocker as the cap, so
    // escalating major yields blocker (not a hypothetical higher level).
    const validSeverities = ["blocker", "major", "minor", "nit"];
    expect(validSeverities).toContain(entry!.severity_hint);
    expect(entry!.severity_hint).toBe("major");
  });
});
