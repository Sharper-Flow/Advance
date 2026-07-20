/**
 * Integration tests for the `env-var-injection-vs-sdk-import` arch-scan rule.
 *
 * The registry entry already exists (see `../registry.ts`). These tests
 * verify the rule fires correctly end-to-end through the public
 * {@link runCapabilityScan} orchestrator using on-disk fixture projects.
 *
 * Fixtures (POSITIVE / NEGATIVE):
 *   - `fixtures/app-insights-bicep-plumbed/` — `APPLICATIONINSIGHTS_CONNECTION_STRING`
 *     plumbed in via bicep; no SDK import; no autoinstrumentation resource;
 *     no external-agent documentation. Rule MUST fire.
 *   - `fixtures/app-insights-autoinstrumented/` — same env-var injection PLUS
 *     a `Microsoft.AzureMonitor/autoInstrumentation` resource whose literal
 *     type matches the rule's autoinstrumentation acceptable-counterpart
 *     pattern. Rule MUST NOT fire.
 *
 * Read-only constraint: this test does not modify registry.ts, schema.ts,
 * evaluator.ts, scan.ts, or report.ts.
 */
import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFile } from "fs/promises";

import { runCapabilityScan } from "../scan";
import { findCapabilityRelationship } from "../registry";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PLUMBED = join(
  HERE,
  "fixtures",
  "app-insights-bicep-plumbed",
);
const FIXTURE_AUTOINSTRUMENTED = join(
  HERE,
  "fixtures",
  "app-insights-autoinstrumented",
);

const RULE_ID = "env-var-injection-vs-sdk-import";

describe("rule: env-var-injection-vs-sdk-import", () => {
  test("registry entry declares the env-var trigger and 3 acceptable counterparts", () => {
    // Sanity: the rule is registered as a Phase 1, major, high-confidence
    // relationship with at least the three counterparts shipped in Rev #8
    // (SDK import, App Service autoinstrumentation, documented external agent).
    const entry = findCapabilityRelationship(RULE_ID);
    expect(entry).toBeDefined();
    expect(entry!.id).toBe(RULE_ID);
    expect(entry!.detection_phase).toBe(1);
    expect(entry!.severity_hint).toBe("major");
    expect(entry!.confidence).toBe("high");
    expect(entry!.acceptable_counterparts.length).toBeGreaterThanOrEqual(3);

    const descriptions = entry!.acceptable_counterparts
      .map((c) => c.description)
      .join("\n");
    expect(/SDK/i.test(descriptions)).toBe(true);
    expect(/autoinstrumentation/i.test(descriptions)).toBe(true);
  });

  test("POSITIVE: plumbed fixture emits a major/high finding with file:line evidence", async () => {
    // AC: Fixture produces a CapabilityFinding with the required shape.
    const result = await runCapabilityScan({
      repoRoot: FIXTURE_PLUMBED,
      phase: 1,
      relationshipId: RULE_ID,
    });

    const ruleFindings = result.findings.filter(
      (f) => f.relationship_id === RULE_ID,
    );
    expect(ruleFindings.length).toBeGreaterThan(0);

    const finding = ruleFindings[0];
    expect(finding.category).toBe("capability-consistency");
    expect(finding.severity).toBe("major");
    expect(["high", "medium"]).toContain(finding.confidence);
    expect(finding.detection_method).toBe("regex");

    // P34: every finding has file:line evidence.
    const triggerEv = finding.evidence.find((e) => e.role === "trigger");
    expect(triggerEv).toBeDefined();
    expect(triggerEv!.file).toBe("infra/web.bicep");
    expect(typeof triggerEv!.line).toBe("number");
    expect(triggerEv!.line).toBeGreaterThan(0);
    expect(triggerEv!.matchedSignal).toBe("APPLICATIONINSIGHTS_CONNECTION_STRING");
    // Exact line per the fixture README line map.
    expect(triggerEv!.line).toBe(22);

    // searched_scope evidence attached (evaluator invariant).
    const searchedEv = finding.evidence.find((e) => e.role === "searched_scope");
    expect(searchedEv).toBeDefined();

    // Absence proof records the counterpart search scope.
    expect(finding.absence_proof).toBeDefined();
    const proof = finding.absence_proof!;
    expect(proof.searchedRoots.length).toBeGreaterThan(0);
    // Counterpart scope spans SDK (ts/js) + autoinstrumentation (bicep) +
    // external agent (bicep/md) — all four globs must appear.
    expect(proof.includedGlobs).toContain("**/*.ts");
    expect(proof.includedGlobs).toContain("**/*.js");
    expect(proof.includedGlobs).toContain("**/*.bicep");
    expect(proof.includedGlobs).toContain("**/*.md");
    expect(Array.isArray(proof.excludedGlobs)).toBe(true);
    expect(proof.excludedGlobs).toContain("node_modules");
    expect(Array.isArray(proof.parseFailures)).toBe(true);
  });

  test("NEGATIVE: autoinstrumented fixture produces no finding (counterpart match)", async () => {
    // Sanity: confirm the fixture's bicep literally contains a substring
    // matching the registry's autoinstrumentation counterpart pattern. This
    // ties the "no finding" outcome to the specific counterpart we expect,
    // rather than to a coincidental match in a different scope.
    const entry = findCapabilityRelationship(RULE_ID);
    expect(entry).toBeDefined();
    const autoinstrCounterpart = entry!.acceptable_counterparts.find((c) =>
      /autoinstrumentation/i.test(c.description),
    );
    expect(autoinstrCounterpart).toBeDefined();
    const bicepText = await readFile(
      join(FIXTURE_AUTOINSTRUMENTED, "infra", "web.bicep"),
      "utf8",
    );
    expect(autoinstrCounterpart!.pattern.test(bicepText)).toBe(true);

    // AC: No finding produced — counterpart match succeeds.
    const result = await runCapabilityScan({
      repoRoot: FIXTURE_AUTOINSTRUMENTED,
      phase: 1,
      relationshipId: RULE_ID,
    });

    const ruleFindings = result.findings.filter(
      (f) => f.relationship_id === RULE_ID,
    );
    expect(ruleFindings).toHaveLength(0);

    // Counterpart match → coverage reports the relationship as applied.
    expect(result.coverage.appliedRelationships).toContain(RULE_ID);
  });
});
