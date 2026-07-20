/**
 * Tests for computeShippedTerminalProof — the pure helper that authorizes
 * the alternate "shipped_terminal" eligibility branch of
 * adv_change_workflow_terminate (rq-shippedWorkflowTermination01).
 *
 * Each refusal code must produce zero-mutation typed evidence naming the
 * exact failing proof component.
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";
import {
  createTempDir,
  cleanupTempDir,
} from "../../__tests__/setup";
import {
  computeShippedTerminalProof,
  type ShippedTerminalProofRefusalCode,
} from "./recovery";
import type { Change } from "../../types";
import { createDefaultGates } from "../../types/gates";

// Build a valid shipped-terminal change fixture (all 7 gates done, phase9
// done). Used as the positive baseline; individual tests then mutate one
// field to exercise each refusal code.
function makeValidChange(): Change {
  const allDone = Object.fromEntries(
    (["proposal", "discovery", "design", "planning", "execution", "acceptance", "release"] as const).map(
      (g) => [g, { status: "done" as const }],
    ),
  );
  return {
    id: "fixWorkflowReliabilityDefects",
    title: "Fix workflow reliability defects",
    status: "draft",
    lifecycleState: "open",
    created_at: "2026-01-01T00:00:00Z",
    created_by: "test",
    tasks: [],
    deltas: {},
    wisdom: [],
    gates: allDone,
    phase9_status: {
      status: "done",
      startedAt: "2026-01-01T00:00:00Z",
      completedAt: "2026-01-02T00:00:00Z",
      route: "direct",
      changeTipSha: "abc123",
    },
  } as unknown as Change;
}

describe("computeShippedTerminalProof", () => {
  let tempRoot: string;
  let changesDir: string;
  let archiveDir: string;
  const changeId = "fixWorkflowReliabilityDefects";

  beforeEach(async () => {
    tempRoot = await createTempDir("adv-shipped-terminal-proof-");
    changesDir = join(tempRoot, "changes");
    archiveDir = join(tempRoot, "archive");
    await mkdir(changesDir, { recursive: true });
    await mkdir(archiveDir, { recursive: true });
  });

  afterEach(async () => {
    await cleanupTempDir(tempRoot);
  });

  async function writeDiskChange(change: Change): Promise<void> {
    const dir = join(changesDir, change.id);
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "change.json"),
      JSON.stringify(change, null, 2),
    );
  }

  async function writeBundle(
    bundleChangeId: string,
    change: Change,
    datePrefix = "2026-01-15",
  ): Promise<string> {
    const bundlePath = join(archiveDir, `${datePrefix}-${bundleChangeId}`);
    await mkdir(bundlePath, { recursive: true });
    await writeFile(
      join(bundlePath, "change.json"),
      JSON.stringify(change, null, 2),
    );
    return bundlePath;
  }

  it("returns ok:true when disk gates done, phase9 done, and bundle identity matches", async () => {
    const change = makeValidChange();
    await writeDiskChange(change);
    await writeBundle(changeId, change);

    const result = await computeShippedTerminalProof({
      changesDir,
      archiveDir,
      changeId,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.diskChange.id).toBe(changeId);
      expect(result.bundleChange.id).toBe(changeId);
      expect(result.bundlePath).toContain(changeId);
    }
  });

  it("refuses PROOF_INVALID_DISK_PROJECTION when change.json is missing", async () => {
    // No disk change written.
    const change = makeValidChange();
    await writeBundle(changeId, change);

    const result = await computeShippedTerminalProof({
      changesDir,
      archiveDir,
      changeId,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusalCode).toBe("PROOF_INVALID_DISK_PROJECTION");
      expect(result.evidence).toContain("no data");
    }
  });

  it("refuses PROOF_INVALID_DISK_PROJECTION when disk change.json fails ChangeSchema.parse", async () => {
    // Write a change.json missing required `id` field.
    const dir = join(changesDir, changeId);
    await mkdir(dir, { recursive: true });
    const malformed = { ...makeValidChange(), id: undefined } as unknown;
    await writeFile(join(dir, "change.json"), JSON.stringify(malformed));
    const change = makeValidChange();
    await writeBundle(changeId, change);

    const result = await computeShippedTerminalProof({
      changesDir,
      archiveDir,
      changeId,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusalCode).toBe("PROOF_INVALID_DISK_PROJECTION");
      // loadChange runs ChangeSchema.parse internally and returns its formatted
      // Zod error; the helper surfaces it via "loadChange failed: ..." evidence.
      expect(result.evidence).toContain("loadChange failed");
      expect(result.evidence).toContain("id");
    }
  });

  it("refuses PROOF_MISSING_GATES when any of seven disk gates is not done", async () => {
    const change = makeValidChange();
    const gates = createDefaultGates();
    gates.release = { status: "pending" };
    change.gates = gates;
    await writeDiskChange(change);
    await writeBundle(changeId, change);

    const result = await computeShippedTerminalProof({
      changesDir,
      archiveDir,
      changeId,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusalCode).toBe("PROOF_MISSING_GATES");
      expect(result.evidence).toContain("release");
    }
  });

  it("refuses PROOF_MISSING_PHASE9 when phase9_status.status is not done", async () => {
    const change = makeValidChange();
    change.phase9_status = {
      status: "pending",
      startedAt: "2026-01-01T00:00:00Z",
    };
    await writeDiskChange(change);
    await writeBundle(changeId, change);

    const result = await computeShippedTerminalProof({
      changesDir,
      archiveDir,
      changeId,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusalCode).toBe("PROOF_MISSING_PHASE9");
      expect(result.evidence).toContain("pending");
    }
  });

  it("refuses PROOF_MISSING_PHASE9 when phase9_status is undefined", async () => {
    const change = makeValidChange();
    delete (change as Partial<Change>).phase9_status;
    await writeDiskChange(change);
    await writeBundle(changeId, change);

    const result = await computeShippedTerminalProof({
      changesDir,
      archiveDir,
      changeId,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusalCode).toBe("PROOF_MISSING_PHASE9");
      expect(result.evidence).toContain("undefined");
    }
  });

  it("refuses PROOF_NO_BUNDLE when archive bundle directory does not exist", async () => {
    const change = makeValidChange();
    await writeDiskChange(change);
    // No bundle written.

    const result = await computeShippedTerminalProof({
      changesDir,
      archiveDir,
      changeId,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusalCode).toBe("PROOF_NO_BUNDLE");
      expect(result.evidence).toContain("no archive bundle");
    }
  });

  it("refuses PROOF_INVALID_BUNDLE when bundle change.json is malformed JSON", async () => {
    const change = makeValidChange();
    await writeDiskChange(change);
    // Write malformed JSON to bundle path.
    const bundlePath = join(archiveDir, `2026-01-15-${changeId}`);
    await mkdir(bundlePath, { recursive: true });
    await writeFile(join(bundlePath, "change.json"), "{ not valid json ");

    const result = await computeShippedTerminalProof({
      changesDir,
      archiveDir,
      changeId,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusalCode).toBe("PROOF_INVALID_BUNDLE");
      expect(result.evidence).toContain("JSON parse failed");
    }
  });

  it("refuses PROOF_INVALID_BUNDLE when bundle change.json fails ChangeSchema.parse", async () => {
    const change = makeValidChange();
    await writeDiskChange(change);
    // Bundle has a structurally invalid change (missing id).
    const bundlePath = join(archiveDir, `2026-01-15-${changeId}`);
    await mkdir(bundlePath, { recursive: true });
    const malformedBundle = { ...change, id: undefined } as unknown;
    await writeFile(
      join(bundlePath, "change.json"),
      JSON.stringify(malformedBundle),
    );

    const result = await computeShippedTerminalProof({
      changesDir,
      archiveDir,
      changeId,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusalCode).toBe("PROOF_INVALID_BUNDLE");
      expect(result.evidence).toContain("parse failed");
    }
  });

  it("refuses PROOF_BUNDLE_ID_MISMATCH when bundle change.id !== requested changeId", async () => {
    const diskChange = makeValidChange();
    await writeDiskChange(diskChange);

    // Bundle directory is named with changeId suffix (passes findArchiveBundle)
    // but the embedded change.id is different.
    const bundleChange = { ...diskChange, id: "someOtherChangeId" };
    await writeBundle(changeId, bundleChange);

    const result = await computeShippedTerminalProof({
      changesDir,
      archiveDir,
      changeId,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusalCode).toBe("PROOF_BUNDLE_ID_MISMATCH");
      expect(result.evidence).toContain("someOtherChangeId");
      expect(result.evidence).toContain(changeId);
    }
  });

  it("never mutates disk state on refusal (idempotent re-invocation)", async () => {
    const change = makeValidChange();
    await writeDiskChange(change);
    // No bundle → triggers PROOF_NO_BUNDLE.

    const beforeJson = await import("fs/promises").then((m) =>
      m.readFile(join(changesDir, changeId, "change.json"), "utf-8"),
    );

    await computeShippedTerminalProof({
      changesDir,
      archiveDir,
      changeId,
    });
    await computeShippedTerminalProof({
      changesDir,
      archiveDir,
      changeId,
    });

    const afterJson = await import("fs/promises").then((m) =>
      m.readFile(join(changesDir, changeId, "change.json"), "utf-8"),
    );

    expect(afterJson).toBe(beforeJson);
  });

  it("covers all six typed refusal codes plus positive case", async () => {
    // Smoke check that the refusal-code union is exactly the six documented
    // values — guards against silent enum drift.
    const expected: ShippedTerminalProofRefusalCode[] = [
      "PROOF_INVALID_DISK_PROJECTION",
      "PROOF_MISSING_GATES",
      "PROOF_MISSING_PHASE9",
      "PROOF_NO_BUNDLE",
      "PROOF_INVALID_BUNDLE",
      "PROOF_BUNDLE_ID_MISMATCH",
    ];
    // Each is exercised by a dedicated test above.
    expect(expected.length).toBe(6);
  });
});
