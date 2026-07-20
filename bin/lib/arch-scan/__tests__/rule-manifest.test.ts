/**
 * Integration tests for the `manifest-reference-vs-runtime-registration`
 * arch-scan rule.
 *
 * The registry entry already exists (see `../registry.ts`). These tests
 * verify the Phase 3 intent-evidence gate works end-to-end through the
 * public {@link runCapabilityScan} orchestrator using on-disk fixture
 * projects.
 *
 * Fixtures (POSITIVE / NEGATIVE):
 *   - `fixtures/pwa-manifest-with-workbox/` — manifest link present, no
 *     service worker registration anywhere, AND the literal intent
 *     declaration "workbox dependency in package.json" appears verbatim
 *     in `README.md`. The intent gate OPENS and the rule MUST fire.
 *   - `fixtures/pwa-manifest-without-intent/` — manifest link present,
 *     no service worker registration, and NONE of the registry's three
 *     intent_required declarations appear anywhere on disk. The intent
 *     gate stays CLOSED and the rule MUST NOT fire (AC MUST #8 —
 *     false-positive protection).
 *
 * Engine-reality note (P07): the generic evaluator in `evaluator.ts`
 * hardcodes `detection_method: "regex"` for every finding it emits. The
 * heuristic character of this rule lives in `detection_phase: 3` plus
 * entry-level `intent_required`, NOT in the `detection_method` field.
 * These tests therefore assert `"regex"` to match actual engine output;
 * a follow-up may surface `"heuristic"` for Phase 3 entries.
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
const FIXTURE_POSITIVE = join(
  HERE,
  "fixtures",
  "pwa-manifest-with-workbox",
);
const FIXTURE_NEGATIVE = join(
  HERE,
  "fixtures",
  "pwa-manifest-without-intent",
);

const RULE_ID = "manifest-reference-vs-runtime-registration";
// Literal substring the evaluator's `intentDeclared` probe searches for.
// Pinned here so a silent registry edit to the declaration string fails
// this test instead of silently widening/narrowing the intent gate.
const INTENT_DECLARATION_WORKBOX = "workbox dependency in package.json";

describe("rule: manifest-reference-vs-runtime-registration", () => {
  test("registry entry declares Phase 3, minor/low, SW counterpart, and entry-level intent_required", () => {
    // Sanity: the rule is registered as a Phase 3, minor, low-confidence
    // relationship with the manifest trigger and a SW-registration
    // acceptable counterpart. Phase 3 entries MUST declare entry-level
    // intent_required — that gate is what this test file exercises.
    const entry = findCapabilityRelationship(RULE_ID);
    expect(entry).toBeDefined();
    expect(entry!.id).toBe(RULE_ID);
    expect(entry!.detection_phase).toBe(3);
    expect(entry!.severity_hint).toBe("minor");
    expect(entry!.confidence).toBe("low");

    // Manifest trigger scope spans HTML/TSX/Svelte.
    expect(entry!.trigger.file_globs).toContain("**/*.html");

    // At least one acceptable counterpart (SW registration / Workbox).
    expect(entry!.acceptable_counterparts.length).toBeGreaterThanOrEqual(1);

    // Entry-level intent gate is the mechanism under test.
    expect(entry!.intent_required).toBeDefined();
    expect(entry!.intent_required!.length).toBeGreaterThan(0);
    expect(entry!.intent_required).toContain(INTENT_DECLARATION_WORKBOX);

    // Counterpart scope (used in absence_proof.includedGlobs) spans TS + JS.
    const counterpartGlobs = entry!.acceptable_counterparts.flatMap(
      (c) => c.file_globs,
    );
    expect(counterpartGlobs).toContain("**/*.ts");
    expect(counterpartGlobs).toContain("**/*.js");
  });

  test("POSITIVE: with-intent fixture emits a minor/low finding when no SW is registered", async () => {
    // Sanity: confirm the fixture's README literally contains the intent
    // declaration verbatim. This ties the "fire" outcome to the intent
    // gate OPENING, not to a coincidental counterpart miss or trigger
    // anomaly.
    const readme = await readFile(
      join(FIXTURE_POSITIVE, "README.md"),
      "utf8",
    );
    expect(readme).toContain(INTENT_DECLARATION_WORKBOX);

    const result = await runCapabilityScan({
      repoRoot: FIXTURE_POSITIVE,
      phase: 3,
      relationshipId: RULE_ID,
    });

    const ruleFindings = result.findings.filter(
      (f) => f.relationship_id === RULE_ID,
    );
    expect(ruleFindings.length).toBeGreaterThan(0);
    // One manifest reference → one trigger hit → one finding.
    expect(ruleFindings).toHaveLength(1);

    const finding = ruleFindings[0];
    // Required shape (AC).
    expect(finding.relationship_id).toBe(RULE_ID);
    expect(finding.category).toBe("capability-consistency");
    expect(finding.severity).toBe("minor");
    expect(finding.confidence).toBe("low");
    // See file-header note: evaluator hardcodes "regex" for all findings.
    expect(finding.detection_method).toBe("regex");

    // P34: file:line trigger evidence on the manifest reference.
    const triggerEv = finding.evidence.find((e) => e.role === "trigger");
    expect(triggerEv).toBeDefined();
    expect(triggerEv!.file).toBe("index.html");
    expect(typeof triggerEv!.line).toBe("number");
    expect(triggerEv!.line).toBeGreaterThan(0);
    // Exact line of the `<link rel="manifest">` (see fixture README line map).
    expect(triggerEv!.line).toBe(6);
    expect(triggerEv!.matchedSignal).toContain("manifest");

    // searched_scope evidence attached (evaluator invariant).
    const searchedEv = finding.evidence.find(
      (e) => e.role === "searched_scope",
    );
    expect(searchedEv).toBeDefined();

    // Absence proof records the SW registration / Workbox counterpart
    // search scope (AC: absence_proof for SW registration search).
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

  test("NEGATIVE: without-intent fixture produces NO finding (intent gate closed)", async () => {
    // Sanity: confirm NONE of the registry's intent_required declarations
    // appear verbatim anywhere in the fixture's on-disk files. This is
    // the deterministic precondition for the intent gate staying CLOSED,
    // and asserting it ties the "no finding" outcome to the gate rather
    // than to a coincidental trigger miss.
    const entry = findCapabilityRelationship(RULE_ID);
    expect(entry?.intent_required).toBeDefined();
    const declarations = entry!.intent_required!;

    const files = ["index.html", "package.json", "README.md"] as const;
    for (const f of files) {
      const text = await readFile(join(FIXTURE_NEGATIVE, f), "utf8");
      for (const decl of declarations) {
        expect(text.includes(decl)).toBe(false);
      }
    }

    const result = await runCapabilityScan({
      repoRoot: FIXTURE_NEGATIVE,
      phase: 3,
      relationshipId: RULE_ID,
    });

    // AC MUST #8: false-positive protection — no finding emitted.
    const ruleFindings = result.findings.filter(
      (f) => f.relationship_id === RULE_ID,
    );
    expect(ruleFindings).toHaveLength(0);

    // Stronger: coverage reports the relationship as SKIPPED with an
    // intent-specific reason. This pins the no-finding outcome to the
    // intent gate (the mechanism under test) rather than to a coincidental
    // trigger miss or empty fixture.
    const skipped = result.coverage.skippedRelationships.find(
      (s) => s.id === RULE_ID,
    );
    expect(skipped).toBeDefined();
    expect(skipped!.reason.toLowerCase()).toContain("intent");

    // And it must NOT appear in appliedRelationships (which would imply
    // the rule ran and found nothing missing).
    expect(result.coverage.appliedRelationships).not.toContain(RULE_ID);
  });
});
