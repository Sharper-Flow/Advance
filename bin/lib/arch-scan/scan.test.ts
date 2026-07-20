import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

import { runCapabilityScan } from "./scan";

describe("runCapabilityScan", () => {
  let repoRoot: string;

  beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), "arch-scan-scan-"));
  });

  afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  test("aggregates findings from multiple relationships in a single pass", async () => {
    // env-var-injection-vs-sdk-import: trigger on docker-compose with the
    // APPLICATIONINSIGHTS_CONNECTION_STRING literal.
    await writeFile(
      join(repoRoot, "docker-compose.yml"),
      "services:\n  web:\n    environment:\n      APPLICATIONINSIGHTS_CONNECTION_STRING: \"x\"\n",
    );
    // config-vs-dependency-presence: trigger on package.json with a `knip`
    // config block but no `knip` dependency.
    await writeFile(
      join(repoRoot, "package.json"),
      JSON.stringify({ name: "demo", knip: {} }, null, 2),
    );

    const result = await runCapabilityScan({ repoRoot, phase: 1 });

    const ids = new Set(result.findings.map((f) => f.relationship_id));
    expect(ids.has("env-var-injection-vs-sdk-import")).toBe(true);
    expect(ids.has("config-vs-dependency-presence")).toBe(true);
  });

  test("phase=1 excludes Phase 3-only relationships from the scan", async () => {
    // Phase 3 scaffold trigger: cypress.config presence.
    await mkdir(join(repoRoot, "cypress"), { recursive: true });
    await writeFile(
      join(repoRoot, "cypress", "cypress.config.js"),
      "module.exports = {};\n",
    );

    const result = await runCapabilityScan({ repoRoot, phase: 1 });

    expect(
      result.findings.every(
        (f) => f.relationship_id !== "scaffold-vs-test-green-path",
      ),
    ).toBe(true);
  });

  test("phase=3 evaluates Phase 3 relationships; intent absence surfaces as skipped", async () => {
    await mkdir(join(repoRoot, "cypress"), { recursive: true });
    await writeFile(
      join(repoRoot, "cypress", "cypress.config.js"),
      "module.exports = {};\n",
    );

    const result = await runCapabilityScan({ repoRoot, phase: 3 });

    expect(
      result.findings.every(
        (f) => f.relationship_id !== "scaffold-vs-test-green-path",
      ),
    ).toBe(true);
    expect(
      result.coverage.skippedRelationships.some(
        (s) => s.id === "scaffold-vs-test-green-path",
      ),
    ).toBe(true);
  });

  test("relationshipId filter narrows the scan to a single relationship", async () => {
    await writeFile(
      join(repoRoot, "package.json"),
      JSON.stringify({ name: "demo", knip: {} }, null, 2),
    );

    const result = await runCapabilityScan({
      repoRoot,
      relationshipId: "config-vs-dependency-presence",
    });

    expect(result.findings.length).toBeGreaterThan(0);
    expect(
      result.findings.every(
        (f) => f.relationship_id === "config-vs-dependency-presence",
      ),
    ).toBe(true);
  });

  test("unknown relationshipId yields empty findings and a skipped entry", async () => {
    const result = await runCapabilityScan({
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
  });

  test("coverage includes applied, skipped, and degraded breakdown", async () => {
    const result = await runCapabilityScan({ repoRoot });

    expect(Array.isArray(result.coverage.appliedRelationships)).toBe(true);
    expect(Array.isArray(result.coverage.skippedRelationships)).toBe(true);
    expect(Array.isArray(result.coverage.degradedRelationships)).toBe(true);

    const appliedIds = new Set(result.coverage.appliedRelationships);
    const skippedIds = new Set(result.coverage.skippedRelationships.map((s) => s.id));
    for (const id of appliedIds) {
      expect(skippedIds.has(id)).toBe(false);
    }
  });

  test("default phase='all' runs both Phase 1 and Phase 3 relationships", async () => {
    await writeFile(
      join(repoRoot, "package.json"),
      JSON.stringify({ name: "demo", knip: {} }, null, 2),
    );

    const result = await runCapabilityScan({ repoRoot });

    // config-vs-dependency-presence is Phase 1; manifest/scaffold are Phase 3.
    const evaluatedIds = new Set([
      ...result.coverage.appliedRelationships,
      ...result.coverage.skippedRelationships.map((s) => s.id),
      ...result.coverage.degradedRelationships.map((d) => d.id),
    ]);
    expect(evaluatedIds.has("config-vs-dependency-presence")).toBe(true);
    expect(evaluatedIds.has("manifest-reference-vs-runtime-registration")).toBe(true);
    expect(evaluatedIds.has("scaffold-vs-test-green-path")).toBe(true);
  });
});
