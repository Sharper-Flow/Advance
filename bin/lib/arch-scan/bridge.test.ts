import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

import { runCapabilityBridge } from "./bridge";

describe("runCapabilityBridge", () => {
  let repoRoot: string;

  beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), "arch-scan-bridge-"));
  });

  afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  test("valid repo + Phase 1 fixture surfaces a finding via the scan pipeline", async () => {
    // env-var-injection-vs-sdk-import trigger: docker-compose with the
    // APPLICATIONINSIGHTS_CONNECTION_STRING literal and no SDK counterpart.
    await writeFile(
      join(repoRoot, "docker-compose.yml"),
      "services:\n  web:\n    environment:\n      APPLICATIONINSIGHTS_CONNECTION_STRING: \"x\"\n",
    );

    const result = await runCapabilityBridge({ repoRoot, phase: 1 });

    expect(result.findings.length).toBeGreaterThan(0);
    const ids = new Set(result.findings.map((f) => f.relationship_id));
    expect(ids.has("env-var-injection-vs-sdk-import")).toBe(true);
    expect(result.coverage.appliedRelationships).toContain(
      "env-var-injection-vs-sdk-import",
    );
    // Bridge-level synthetic degraded entries must not appear on a healthy run.
    expect(
      result.coverage.degradedRelationships.some((d) => d.id === "bridge"),
    ).toBe(false);
  });

  test("missing repoRoot returns empty findings + degraded entry with reason 'repo not found'", async () => {
    const missing = join(tmpdir(), `arch-scan-bridge-missing-${Date.now()}-${Math.random().toString(36).slice(2)}`);

    const result = await runCapabilityBridge({ repoRoot: missing });

    expect(result.findings).toHaveLength(0);
    expect(result.coverage.appliedRelationships).toHaveLength(0);
    expect(result.coverage.skippedRelationships).toHaveLength(0);
    expect(result.coverage.degradedRelationships).toEqual([
      { id: "bridge", reason: "repo not found" },
    ]);
  });

  test("unknown relationshipId forwards the skipped entry from the scan pipeline", async () => {
    const result = await runCapabilityBridge({
      repoRoot,
      relationshipId: "does-not-exist",
    });

    expect(result.findings).toHaveLength(0);
    expect(result.coverage.skippedRelationships).toEqual([
      {
        id: "does-not-exist",
        reason: "relationship id not found in registry",
      },
    ]);
    // Bridge must not pollute a clean scan-forward result with its own
    // synthetic degraded entry.
    expect(result.coverage.degradedRelationships).toHaveLength(0);
  });

  test("phase=1 excludes Phase 3 relationships from coverage", async () => {
    // Phase 3 scaffold trigger: cypress.config presence.
    await mkdir(join(repoRoot, "cypress"), { recursive: true });
    await writeFile(
      join(repoRoot, "cypress", "cypress.config.js"),
      "module.exports = {};\n",
    );

    const result = await runCapabilityBridge({ repoRoot, phase: 1 });

    const evaluatedIds = new Set([
      ...result.coverage.appliedRelationships,
      ...result.coverage.skippedRelationships.map((s) => s.id),
      ...result.coverage.degradedRelationships.map((d) => d.id),
    ]);
    expect(evaluatedIds.has("scaffold-vs-test-green-path")).toBe(false);
    expect(evaluatedIds.has("manifest-reference-vs-runtime-registration")).toBe(false);
  });

  test("phase=3 evaluates Phase 3 relationships and surfaces scaffold as skipped", async () => {
    await mkdir(join(repoRoot, "cypress"), { recursive: true });
    await writeFile(
      join(repoRoot, "cypress", "cypress.config.js"),
      "module.exports = {};\n",
    );

    const result = await runCapabilityBridge({ repoRoot, phase: 3 });

    // No Phase 1 relationship should appear when phase=3.
    const evaluatedIds = new Set([
      ...result.coverage.appliedRelationships,
      ...result.coverage.skippedRelationships.map((s) => s.id),
      ...result.coverage.degradedRelationships.map((d) => d.id),
    ]);
    expect(evaluatedIds.has("config-vs-dependency-presence")).toBe(false);
    expect(evaluatedIds.has("scaffold-vs-test-green-path")).toBe(true);
  });

  test("forwards regexTimeoutMs to the scan pipeline without altering behavior", async () => {
    await writeFile(
      join(repoRoot, "docker-compose.yml"),
      "services:\n  web:\n    environment:\n      APPLICATIONINSIGHTS_CONNECTION_STRING: \"x\"\n",
    );

    const result = await runCapabilityBridge({
      repoRoot,
      phase: 1,
      regexTimeoutMs: 1234,
    });

    expect(result.coverage.appliedRelationships).toContain(
      "env-var-injection-vs-sdk-import",
    );
    // Timeout must not produce a degraded entry on a healthy scan.
    expect(
      result.coverage.degradedRelationships.some(
        (d) => d.id === "env-var-injection-vs-sdk-import",
      ),
    ).toBe(false);
  });
});
