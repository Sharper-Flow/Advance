/**
 * End-to-end integration tests for the arch-scan capability-consistency
 * pipeline.
 *
 * These tests exercise the FULL stack — CLI binary → bridge → scan →
 * evaluator → report renderer — and complement:
 *   - the per-rule tests (__tests__/rule-*.test.ts), which call
 *     runCapabilityScan directly against single-rule + single-fixture
 *     combinations, and
 *   - the bridge unit tests (bridge.test.ts), which use ephemeral temp
 *     dirs to verify forwarding/normalization behavior.
 *
 * What this file adds: CLI subprocess invocation (exit codes, stdout
 * parsing), multi-rule coverage tracking, report rendering roundtrips,
 * and end-to-end time budgets.
 *
 * Test map (matches task AC scenarios 1–7 + exit codes):
 *   1. CLI smoke: JSON output from app-insights-bicep-plumbed
 *   2. CLI smoke: text output from knip-config-without-dep
 *   3. Bridge direct call: validated findings shape
 *   4. Filter flags: --phase 1, --phase 3, --relationship-id
 *   5. Coverage: all 5 rules tracked without filter; filter narrows
 *   6. Report rendering: text + JSON roundtrip
 *   7. Time budget: each fixture scan < 5s
 *   8. Exit codes: 0 success, 1 bridge error, 2 arg error
 *
 * Read-only constraint: this test does not modify registry.ts, schema.ts,
 * evaluator.ts, scan.ts, report.ts, bridge.ts, or fixtures.
 */
import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { tmpdir } from "os";
import { spawnSync } from "node:child_process";

import { runCapabilityBridge } from "../bridge";
import { CAPABILITY_RELATIONSHIPS } from "../registry";
import { renderReport } from "../report";
import { validateCapabilityFinding } from "../schema";

// --- Path constants -------------------------------------------------------

const HERE = dirname(fileURLToPath(import.meta.url));
// __tests__ → arch-scan → lib → bin → worktree root (4 levels up).
const WORKTREE_ROOT = join(HERE, "..", "..", "..", "..");
const ARCH_SCAN_BIN = join(WORKTREE_ROOT, "bin", "arch-scan.ts");

const FIXTURES = join(HERE, "fixtures");
const FIXTURE_ENV_VAR = join(FIXTURES, "app-insights-bicep-plumbed");
const FIXTURE_KNIP = join(FIXTURES, "knip-config-without-dep");
const FIXTURE_MANIFEST = join(FIXTURES, "pwa-manifest-with-workbox");
const FIXTURE_SCAFFOLD = join(FIXTURES, "capacitor-scaffold-with-script");

// Registry-derived ID sets so this test does not hardcode rule IDs that
// could drift out of sync with the registry.
const ALL_RULE_IDS = CAPABILITY_RELATIONSHIPS.map((r) => r.id);
const PHASE1_IDS = CAPABILITY_RELATIONSHIPS.filter(
  (r) => r.detection_phase === 1,
).map((r) => r.id);
const PHASE3_IDS = CAPABILITY_RELATIONSHIPS.filter(
  (r) => r.detection_phase === 3,
).map((r) => r.id);

// --- CLI subprocess helper ------------------------------------------------

interface CliResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

/**
 * Invoke the arch-scan CLI binary as a Bun subprocess. Captures stdout,
 * stderr, and exit code. A 15-second wall-clock timeout guards against
 * hangs (the AC time-budget is 5s per scan; Bun startup adds ~1s).
 */
function runCli(...args: string[]): CliResult {
  const proc = spawnSync("bun", ["run", ARCH_SCAN_BIN, ...args], {
    encoding: "utf-8",
    timeout: 15000,
    cwd: WORKTREE_ROOT,
  });
  return {
    stdout: typeof proc.stdout === "string" ? proc.stdout : "",
    stderr: typeof proc.stderr === "string" ? proc.stderr : "",
    // `status` is null on signal/timeout; normalize to -1 for assertions.
    exitCode: typeof proc.status === "number" ? proc.status : -1,
  };
}

/**
 * Compute the set of all rule IDs that appear in any coverage list
 * (applied ∪ skipped ∪ degraded). Used to verify the scan accounted for
 * every selected relationship.
 */
function evaluatedIds(result: {
  coverage: {
    appliedRelationships: readonly string[];
    skippedRelationships: ReadonlyArray<{ id: string; reason: string }>;
    degradedRelationships: ReadonlyArray<{ id: string; reason: string }>;
  };
}): Set<string> {
  return new Set([
    ...result.coverage.appliedRelationships,
    ...result.coverage.skippedRelationships.map((s) => s.id),
    ...result.coverage.degradedRelationships.map((d) => d.id),
  ]);
}

// ==========================================================================
// Scenario 1 — CLI smoke: JSON output from app-insights-bicep-plumbed
// ==========================================================================

describe("CLI smoke: JSON output", () => {
  test("app-insights-bicep-plumbed produces parseable JSON with an env-var major finding", () => {
    const { stdout, exitCode } = runCli(
      "--format",
      "json",
      "--phase",
      "1",
      FIXTURE_ENV_VAR,
    );
    expect(exitCode).toBe(0);

    const parsed = JSON.parse(stdout) as {
      findings: Array<Record<string, unknown>>;
      coverage: Record<string, unknown>;
    };
    expect(Array.isArray(parsed.findings)).toBe(true);

    const envVarFindings = parsed.findings.filter(
      (f) => f.relationship_id === "env-var-injection-vs-sdk-import",
    );
    expect(envVarFindings.length).toBeGreaterThan(0);

    const finding = envVarFindings[0];
    expect(finding.severity).toBe("major");
    expect(finding.category).toBe("capability-consistency");
    // Phase 1 → detection_method "regex".
    expect(finding.detection_method).toBe("regex");

    // Coverage block present and well-formed.
    expect(parsed.coverage).toBeDefined();
    expect(Array.isArray((parsed.coverage as { appliedRelationships?: unknown }).appliedRelationships)).toBe(true);
  });
});

// ==========================================================================
// Scenario 2 — CLI smoke: text output from knip-config-without-dep
// ==========================================================================

describe("CLI smoke: text output", () => {
  test("knip-config-without-dep produces text containing the config-vs-dep finding", () => {
    const { stdout, exitCode } = runCli(
      "--format",
      "text",
      "--phase",
      "1",
      FIXTURE_KNIP,
    );
    expect(exitCode).toBe(0);
    // The text renderer groups findings by relationship id; the rule id
    // must appear verbatim in the output.
    expect(stdout).toContain("config-vs-dependency-presence");
    // Header is always present in text format.
    expect(stdout).toContain("Capability-Consistency Scan");
  });
});

// ==========================================================================
// Scenario 3 — Bridge direct call: findings shape
// ==========================================================================

describe("Bridge direct call", () => {
  test("runCapabilityBridge on env-var fixture returns schema-valid findings", async () => {
    const result = await runCapabilityBridge({
      repoRoot: FIXTURE_ENV_VAR,
      phase: 1,
    });

    expect(result.findings.length).toBeGreaterThan(0);

    // Every emitted finding must pass the schema validator.
    for (const finding of result.findings) {
      const validation = validateCapabilityFinding(finding);
      expect(validation.ok).toBe(true);
    }

    // The env-var rule fired.
    const envVarFindings = result.findings.filter(
      (f) => f.relationship_id === "env-var-injection-vs-sdk-import",
    );
    expect(envVarFindings.length).toBeGreaterThan(0);

    // No bridge-level synthetic degraded entries on a healthy scan.
    expect(
      result.coverage.degradedRelationships.some((d) => d.id === "bridge"),
    ).toBe(false);
  });
});

// ==========================================================================
// Scenario 4 — Filter flags
// ==========================================================================

describe("Filter flags", () => {
  test("--phase 1: only Phase 1 findings and coverage entries; no Phase 3", async () => {
    const result = await runCapabilityBridge({
      repoRoot: FIXTURE_ENV_VAR,
      phase: 1,
    });

    // No Phase 3 relationship should appear among findings.
    for (const finding of result.findings) {
      expect(PHASE3_IDS).not.toContain(finding.relationship_id);
    }

    // No Phase 3 relationship should appear in any coverage list.
    const ids = evaluatedIds(result);
    for (const phase3Id of PHASE3_IDS) {
      expect(ids.has(phase3Id)).toBe(false);
    }

    // At least one Phase 1 rule should be tracked.
    expect(
      [...ids].some((id) => PHASE1_IDS.includes(id)),
    ).toBe(true);
  });

  test("--phase 3: only Phase 3 findings and coverage entries; no Phase 1", async () => {
    // Use the manifest fixture which carries the intent declaration
    // needed to open the Phase 3 intent gate for Rule 4.
    const result = await runCapabilityBridge({
      repoRoot: FIXTURE_MANIFEST,
      phase: 3,
    });

    for (const finding of result.findings) {
      expect(PHASE1_IDS).not.toContain(finding.relationship_id);
    }

    const ids = evaluatedIds(result);
    for (const phase1Id of PHASE1_IDS) {
      expect(ids.has(phase1Id)).toBe(false);
    }

    // Phase 3 rules should be tracked (at least one).
    expect(
      [...ids].some((id) => PHASE3_IDS.includes(id)),
    ).toBe(true);
  });

  test("--relationship-id: only that single rule's findings and coverage", async () => {
    const RULE = "env-var-injection-vs-sdk-import";
    const result = await runCapabilityBridge({
      repoRoot: FIXTURE_ENV_VAR,
      relationshipId: RULE,
    });

    // Every finding belongs to the selected rule.
    for (const finding of result.findings) {
      expect(finding.relationship_id).toBe(RULE);
    }

    // Coverage tracks exactly the one selected rule.
    const ids = evaluatedIds(result);
    expect(ids.size).toBe(1);
    expect(ids.has(RULE)).toBe(true);
  });
});

// ==========================================================================
// Scenario 5 — Coverage report
// ==========================================================================

describe("Coverage report", () => {
  test("no-filter scan on env-var fixture accounts for all 5 registered rules", async () => {
    // A no-filter scan selects every registered relationship. Each one
    // must land in exactly one coverage list (applied / skipped /
    // degraded). The env-var fixture has diverse enough content that:
    //   - Phase 1 rules (env-var, config-vs-dep, report-only) run to
    //     completion → "applied"
    //   - Phase 3 rules (manifest, scaffold) fail the intent gate →
    //     "skipped"
    // So the union of all three coverage lists === all 5 rule IDs.
    const result = await runCapabilityBridge({
      repoRoot: FIXTURE_ENV_VAR,
    });

    const ids = evaluatedIds(result);
    for (const ruleId of ALL_RULE_IDS) {
      expect(ids.has(ruleId)).toBe(true);
    }
  });

  test("relationship-id filter excludes non-matching rules from coverage", async () => {
    const RULE = "env-var-injection-vs-sdk-import";
    const result = await runCapabilityBridge({
      repoRoot: FIXTURE_ENV_VAR,
      relationshipId: RULE,
    });

    const ids = evaluatedIds(result);
    // Only the selected rule appears; the other four are absent.
    const others = ALL_RULE_IDS.filter((id) => id !== RULE);
    for (const id of others) {
      expect(ids.has(id)).toBe(false);
    }
  });
});

// ==========================================================================
// Scenario 6 — Report rendering
// ==========================================================================

describe("Report rendering", () => {
  test("text format renders the header and finding relationship id without errors", async () => {
    const result = await runCapabilityBridge({
      repoRoot: FIXTURE_ENV_VAR,
      phase: 1,
    });

    const text = renderReport(result, "text");
    expect(typeof text).toBe("string");
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain("Capability-Consistency Scan");

    // When findings exist, their relationship id appears in the text
    // output (the renderer groups by relationship id).
    if (result.findings.length > 0) {
      expect(text).toContain("env-var-injection-vs-sdk-import");
    }
  });

  test("JSON format survives a parse → stringify → parse roundtrip", async () => {
    const result = await runCapabilityBridge({
      repoRoot: FIXTURE_ENV_VAR,
      phase: 1,
    });

    const json = renderReport(result, "json");
    expect(typeof json).toBe("string");

    // First parse must not throw.
    const parsed = JSON.parse(json);
    // Re-stringify and re-parse; the two parsed objects must be deep-equal.
    const reparsed = JSON.parse(JSON.stringify(parsed));
    expect(reparsed).toEqual(parsed);

    // Findings count survives the roundtrip.
    expect((parsed as { findings: unknown[] }).findings.length).toBe(
      result.findings.length,
    );
  });
});

// ==========================================================================
// Scenario 7 — Time budget
// ==========================================================================

describe("Time budget", () => {
  test("each fixture scan completes within 5 seconds via the bridge", async () => {
    const fixtures = [
      FIXTURE_ENV_VAR,
      FIXTURE_KNIP,
      FIXTURE_MANIFEST,
      FIXTURE_SCAFFOLD,
    ];

    for (const fixture of fixtures) {
      const start = Date.now();
      await runCapabilityBridge({ repoRoot: fixture });
      const elapsed = Date.now() - start;
      // AC: each scan < 5000 ms.
      expect(elapsed).toBeLessThan(5000);
    }
  });
});

// ==========================================================================
// Scenario 8 — Exit codes
// ==========================================================================

describe("Exit codes", () => {
  test("0 on a successful scan", () => {
    const { exitCode } = runCli("--format", "json", FIXTURE_ENV_VAR);
    expect(exitCode).toBe(0);
  });

  test("1 on a bridge error (missing repo)", () => {
    const missing = join(
      tmpdir(),
      `arch-scan-integration-missing-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    const { exitCode, stdout } = runCli("--format", "json", missing);
    expect(exitCode).toBe(1);
    // The degraded entry still renders as JSON so callers get a shape.
    const parsed = JSON.parse(stdout) as {
      coverage: { degradedRelationships: Array<{ id: string }> };
    };
    expect(
      parsed.coverage.degradedRelationships.some((d) => d.id === "bridge"),
    ).toBe(true);
  });

  test("2 on an arg error (invalid --format value)", () => {
    const { exitCode, stderr } = runCli("--format", "xml", FIXTURE_ENV_VAR);
    expect(exitCode).toBe(2);
    // The usage message identifies the bad flag.
    expect(stderr).toContain("--format");
  });
});
