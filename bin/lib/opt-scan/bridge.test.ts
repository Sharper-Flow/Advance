import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

import { runOptBridge, BRIDGE_DEGRADED_ID } from "./bridge";

describe("runOptBridge", () => {
  let repoRoot: string;

  beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), "opt-scan-bridge-"));
  });

  afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  test("valid repo returns a v1 report envelope without bridge degradation", async () => {
    const result = await runOptBridge({ repoRoot });

    expect(result.schema_version).toBe("opt_scan_report.v1");
    expect(
      result.coverage.some(
        (d) => d.id === BRIDGE_DEGRADED_ID && d.state === "degraded",
      ),
    ).toBe(false);
  });

  test("missing repoRoot returns degraded coverage with repo not found reason", async () => {
    const missing = join(
      tmpdir(),
      `opt-scan-bridge-missing-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );

    const result = await runOptBridge({ repoRoot: missing });

    expect(result.candidates).toHaveLength(0);
    expect(result.coverage).toEqual([
      {
        id: BRIDGE_DEGRADED_ID,
        label: "bridge",
        state: "degraded",
        reason: "repo not found",
        important: true,
      },
    ]);
  });

  test("unknown detectorId forwards the skipped coverage entry from the scan", async () => {
    const result = await runOptBridge({
      repoRoot,
      detectorId: "does-not-exist",
    });

    expect(result.candidates).toHaveLength(0);
    expect(result.coverage).toEqual([
      {
        id: "does-not-exist",
        label: "does-not-exist",
        state: "skipped",
        reason: "detector id not found in registry",
        important: true,
      },
    ]);
    expect(
      result.coverage.some((d) => d.id === BRIDGE_DEGRADED_ID),
    ).toBe(false);
  });

  test("forwards regexTimeoutMs to the scan pipeline without altering behavior", async () => {
    const result = await runOptBridge({
      repoRoot,
      phase: 1,
      regexTimeoutMs: 1234,
    });

    expect(result.schema_version).toBe("opt_scan_report.v1");
    expect(result.coverage.length).toBeGreaterThan(0);
  });
});
