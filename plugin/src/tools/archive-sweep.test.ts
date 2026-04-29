/**
 * Archive Orphan Sweep Tests
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { mkdir, writeFile, access } from "fs/promises";
import { createTempDir, cleanupTempDir } from "../__tests__/setup";
import { sweepArchiveOrphans, archiveSweepTools } from "./archive-sweep";
import type { Store } from "../storage/store";

// =============================================================================
// Test fixture builders
// =============================================================================

interface FixtureLayout {
  testDir: string;
  changesDir: string;
  archiveDir: string;
}

async function buildFixture(): Promise<FixtureLayout> {
  const testDir = await createTempDir();
  const changesDir = join(testDir, "changes");
  const archiveDir = join(testDir, "archive");
  await mkdir(changesDir, { recursive: true });
  await mkdir(archiveDir, { recursive: true });
  return { testDir, changesDir, archiveDir };
}

async function makeSourceDir(
  changesDir: string,
  id: string,
  files: Record<string, string> = {},
): Promise<string> {
  const dir = join(changesDir, id);
  await mkdir(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(dir, name), content);
  }
  return dir;
}

async function makeArchiveBundle(
  archiveDir: string,
  date: string,
  id: string,
): Promise<string> {
  const dir = join(archiveDir, `${date}-${id}`);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "change.json"),
    JSON.stringify({ id, title: id, status: "archived" }),
  );
  return dir;
}

// =============================================================================
// Pure helper tests
// =============================================================================

describe("sweepArchiveOrphans", () => {
  let fixture: FixtureLayout;

  beforeEach(async () => {
    fixture = await buildFixture();
  });

  afterEach(async () => {
    await cleanupTempDir(fixture.testDir);
  });

  it("dry-run lists orphans matched by archive change.json id", async () => {
    await makeSourceDir(fixture.changesDir, "leakedChange1", {
      "proposal.md": "x",
    });
    await makeSourceDir(fixture.changesDir, "leakedChange2");
    await makeArchiveBundle(fixture.archiveDir, "2026-01-01", "leakedChange1");
    await makeArchiveBundle(fixture.archiveDir, "2026-02-15", "leakedChange2");

    const result = await sweepArchiveOrphans(
      fixture.changesDir,
      fixture.archiveDir,
      { dryRun: true },
    );

    expect(result.dryRun).toBe(true);
    expect(result.candidateCount).toBe(2);
    const ids = result.candidates.map((c) => c.id).sort();
    expect(ids).toEqual(["leakedChange1", "leakedChange2"]);
    expect(result.skippedActive).toEqual([]);
  });

  it("dry-run leaves source dirs untouched on disk", async () => {
    const sourceDir = await makeSourceDir(fixture.changesDir, "leakedChange1");
    await makeArchiveBundle(fixture.archiveDir, "2026-01-01", "leakedChange1");

    await sweepArchiveOrphans(fixture.changesDir, fixture.archiveDir, {
      dryRun: true,
    });

    await access(sourceDir); // throws if missing
  });

  it("ignores active changes (source dir with no archive)", async () => {
    await makeSourceDir(fixture.changesDir, "activeNoArchive");
    await makeSourceDir(fixture.changesDir, "leakedChange1");
    await makeArchiveBundle(fixture.archiveDir, "2026-01-01", "leakedChange1");

    const result = await sweepArchiveOrphans(
      fixture.changesDir,
      fixture.archiveDir,
      { dryRun: true },
    );

    expect(result.candidateCount).toBe(1);
    expect(result.candidates[0].id).toBe("leakedChange1");
    expect(result.skippedActive).toEqual(["activeNoArchive"]);
  });

  it("execute mode removes orphans and reports counts", async () => {
    const orphan1 = await makeSourceDir(fixture.changesDir, "leakedChange1");
    const orphan2 = await makeSourceDir(fixture.changesDir, "leakedChange2");
    const archive1 = await makeArchiveBundle(
      fixture.archiveDir,
      "2026-01-01",
      "leakedChange1",
    );
    await makeArchiveBundle(fixture.archiveDir, "2026-02-15", "leakedChange2");

    const result = await sweepArchiveOrphans(
      fixture.changesDir,
      fixture.archiveDir,
      { dryRun: false },
    );

    expect(result.dryRun).toBe(false);
    expect(result.removedCount).toBe(2);
    expect(result.removed?.sort()).toEqual(["leakedChange1", "leakedChange2"]);
    expect(result.removalErrors).toEqual([]);

    // Source dirs gone
    await expect(access(orphan1)).rejects.toThrow();
    await expect(access(orphan2)).rejects.toThrow();

    // Archive bundles untouched
    await access(archive1);
    await access(join(archive1, "change.json"));
  });

  it("returns empty result when changes dir does not exist", async () => {
    const fakeChanges = join(fixture.testDir, "no-such-changes");
    const result = await sweepArchiveOrphans(fakeChanges, fixture.archiveDir, {
      dryRun: true,
    });
    expect(result.candidateCount).toBe(0);
    expect(result.skippedActive).toEqual([]);
  });

  it("returns empty result when archive dir does not exist", async () => {
    await makeSourceDir(fixture.changesDir, "stillActive");
    const fakeArchive = join(fixture.testDir, "no-such-archive");
    const result = await sweepArchiveOrphans(fixture.changesDir, fakeArchive, {
      dryRun: true,
    });
    expect(result.candidateCount).toBe(0);
    expect(result.skippedActive).toEqual(["stillActive"]);
  });

  it("skips malformed archive change.json entries", async () => {
    await makeSourceDir(fixture.changesDir, "leakedChange1");
    // Build a malformed archive entry next to a valid one
    const malformedDir = join(fixture.archiveDir, "2026-01-01-malformed");
    await mkdir(malformedDir, { recursive: true });
    await writeFile(join(malformedDir, "change.json"), "{not valid json");
    await makeArchiveBundle(fixture.archiveDir, "2026-01-02", "leakedChange1");

    const result = await sweepArchiveOrphans(
      fixture.changesDir,
      fixture.archiveDir,
      { dryRun: true },
    );

    expect(result.candidateCount).toBe(1);
    expect(result.candidates[0].id).toBe("leakedChange1");
  });
});

// =============================================================================
// Tool wrapper tests
// =============================================================================

function makeStub(changesDir: string, archiveDir: string): Store {
  return {
    paths: {
      changes: changesDir,
      archive: archiveDir,
    },
  } as unknown as Store;
}

describe("adv_archive_sweep_orphans tool", () => {
  let fixture: FixtureLayout;

  beforeEach(async () => {
    fixture = await buildFixture();
  });

  afterEach(async () => {
    await cleanupTempDir(fixture.testDir);
  });

  it("dry-run is default and returns candidate listing", async () => {
    await makeSourceDir(fixture.changesDir, "leakedChange1");
    await makeArchiveBundle(fixture.archiveDir, "2026-01-01", "leakedChange1");

    const out = await archiveSweepTools.adv_archive_sweep_orphans.execute(
      {},
      makeStub(fixture.changesDir, fixture.archiveDir),
    );
    const parsed = JSON.parse(out);
    expect(parsed.success).toBe(true);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.candidateCount).toBe(1);
    expect(parsed.message).toContain("Found 1");
  });

  it("execute mode without approval refuses with error", async () => {
    await makeSourceDir(fixture.changesDir, "leakedChange1");
    await makeArchiveBundle(fixture.archiveDir, "2026-01-01", "leakedChange1");

    const out = await archiveSweepTools.adv_archive_sweep_orphans.execute(
      { dryRun: false },
      makeStub(fixture.changesDir, fixture.archiveDir),
    );
    const parsed = JSON.parse(out);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("Explicit user approval is required");
  });

  it("execute mode without approvalEvidence (only flag) also refuses", async () => {
    await makeSourceDir(fixture.changesDir, "leakedChange1");
    await makeArchiveBundle(fixture.archiveDir, "2026-01-01", "leakedChange1");

    const out = await archiveSweepTools.adv_archive_sweep_orphans.execute(
      { dryRun: false, approvedByUser: true },
      makeStub(fixture.changesDir, fixture.archiveDir),
    );
    const parsed = JSON.parse(out);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("Explicit user approval is required");
  });

  it("execute mode with approval removes orphans", async () => {
    const orphan = await makeSourceDir(fixture.changesDir, "leakedChange1");
    await makeArchiveBundle(fixture.archiveDir, "2026-01-01", "leakedChange1");

    const out = await archiveSweepTools.adv_archive_sweep_orphans.execute(
      {
        dryRun: false,
        approvedByUser: true,
        approvalEvidence: "User typed 'remove orphans' at the prompt",
      },
      makeStub(fixture.changesDir, fixture.archiveDir),
    );
    const parsed = JSON.parse(out);
    expect(parsed.success).toBe(true);
    expect(parsed.dryRun).toBe(false);
    expect(parsed.removedCount).toBe(1);
    expect(parsed.message).toContain("Removed 1");
    await expect(access(orphan)).rejects.toThrow();
  });

  it("includeClosed: true detects closed-change source dirs without archive", async () => {
    // A closed change with no archive bundle — should be a candidate
    await makeSourceDir(fixture.changesDir, "closedNoArchive", {
      "change.json": JSON.stringify({
        id: "closedNoArchive",
        status: "closed",
      }),
      "proposal.md": "x",
    });
    // An active change — should NOT be a candidate
    await makeSourceDir(fixture.changesDir, "activeNoArchive", {
      "change.json": JSON.stringify({
        id: "activeNoArchive",
        status: "active",
      }),
    });

    const result = await sweepArchiveOrphans(
      fixture.changesDir,
      fixture.archiveDir,
      { dryRun: true, includeClosed: true },
    );

    expect(result.closedCandidateCount).toBe(1);
    expect(result.candidates.map((c) => c.id)).toContain("closedNoArchive");
    expect(result.candidates.map((c) => c.id)).not.toContain("activeNoArchive");
    // Active change still in skippedActive
    expect(result.skippedActive).toContain("activeNoArchive");
  });

  it("includeClosed: true also detects archive orphans alongside closed orphans", async () => {
    // Archive orphan
    await makeSourceDir(fixture.changesDir, "archiveOrphan", {
      "proposal.md": "x",
    });
    await makeArchiveBundle(fixture.archiveDir, "2026-01-01", "archiveOrphan");

    // Closed orphan (no archive bundle)
    await makeSourceDir(fixture.changesDir, "closedOrphan", {
      "change.json": JSON.stringify({ id: "closedOrphan", status: "closed" }),
    });

    const result = await sweepArchiveOrphans(
      fixture.changesDir,
      fixture.archiveDir,
      { dryRun: true, includeClosed: true },
    );

    // 1 archive orphan + 1 closed orphan = 2 total
    expect(result.candidateCount).toBe(2);
    expect(result.closedCandidateCount).toBe(1);
    const allIds = result.candidates.map((c) => c.id);
    expect(allIds).toContain("archiveOrphan");
    expect(allIds).toContain("closedOrphan");
  });

  it("includeClosed: false (default) ignores closed changes", async () => {
    await makeSourceDir(fixture.changesDir, "closedNoArchive", {
      "change.json": JSON.stringify({
        id: "closedNoArchive",
        status: "closed",
      }),
    });
    await makeSourceDir(fixture.changesDir, "leakedChange1");
    await makeArchiveBundle(fixture.archiveDir, "2026-01-01", "leakedChange1");

    const result = await sweepArchiveOrphans(
      fixture.changesDir,
      fixture.archiveDir,
      { dryRun: true },
    );

    // Only archive orphan detected, closed change in skippedActive
    expect(result.candidateCount).toBe(1);
    expect(result.candidates[0].id).toBe("leakedChange1");
    expect(result.closedCandidateCount).toBeUndefined();
    expect(result.skippedActive).toContain("closedNoArchive");
  });
});
