/**
 * T11 KD-5: workflow-start hydration from disk artifacts.
 *
 * Verifies that pre-migration changes (artifact content on disk, empty
 * state.documents) hydrate into `seedState.documents` exactly once at
 * workflow start.
 *
 * Partial-write robustness: empty/whitespace-only files are skipped;
 * missing files don't error.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { readDiskArtifactsForHydration } from "./hydrate-documents";
import { cleanupTempDir, createTempDir } from "../../__tests__/setup";

describe("readDiskArtifactsForHydration — AC9", () => {
  it("returns undefined when change dir does not exist (new change)", async () => {
    const dir = await createTempDir();
    try {
      const changesDir = join(dir, "changes");
      // No mkdir for the change dir — simulates a brand-new change.
      const result = await readDiskArtifactsForHydration(
        changesDir,
        "missing-change",
      );
      expect(result).toBeUndefined();
    } finally {
      await cleanupTempDir(dir);
    }
  });

  it("returns undefined when change dir exists but no artifact files", async () => {
    const dir = await createTempDir();
    try {
      const changesDir = join(dir, "changes");
      const changeDir = join(changesDir, "empty-change");
      await mkdir(changeDir, { recursive: true });
      // No artifact files written
      const result = await readDiskArtifactsForHydration(
        changesDir,
        "empty-change",
      );
      expect(result).toBeUndefined();
    } finally {
      await cleanupTempDir(dir);
    }
  });

  it("hydrates all six artifact kinds when all files are present", async () => {
    const dir = await createTempDir();
    try {
      const changesDir = join(dir, "changes");
      const changeDir = join(changesDir, "legacy-change");
      await mkdir(changeDir, { recursive: true });
      await writeFile(join(changeDir, "proposal.md"), "# Proposal\n\nbody");
      await writeFile(
        join(changeDir, "problem-statement.md"),
        "# Problem\n\nbody",
      );
      await writeFile(join(changeDir, "agreement.md"), "# Agreement\n\nbody");
      await writeFile(join(changeDir, "design.md"), "# Design\n\nbody");
      await writeFile(
        join(changeDir, "executive-summary.md"),
        "# Executive Summary\n\nbody",
      );
      await writeFile(join(changeDir, "acceptance.md"), "# Acceptance\n\nbody");

      const result = await readDiskArtifactsForHydration(
        changesDir,
        "legacy-change",
      );
      expect(result).toBeDefined();
      expect(result?.proposal).toBe("# Proposal\n\nbody");
      expect(result?.problemStatement).toBe("# Problem\n\nbody");
      expect(result?.agreement).toBe("# Agreement\n\nbody");
      expect(result?.design).toBe("# Design\n\nbody");
      expect(result?.executiveSummary).toBe("# Executive Summary\n\nbody");
      expect(result?.acceptance).toBe("# Acceptance\n\nbody");
    } finally {
      await cleanupTempDir(dir);
    }
  });

  it("hydrates only the present artifact kinds (partial coverage)", async () => {
    const dir = await createTempDir();
    try {
      const changesDir = join(dir, "changes");
      const changeDir = join(changesDir, "partial-change");
      await mkdir(changeDir, { recursive: true });
      await writeFile(join(changeDir, "proposal.md"), "proposal text");
      await writeFile(join(changeDir, "design.md"), "design text");
      // No problem-statement, agreement, executive-summary, acceptance

      const result = await readDiskArtifactsForHydration(
        changesDir,
        "partial-change",
      );
      expect(result).toEqual({
        proposal: "proposal text",
        design: "design text",
      });
      expect("problemStatement" in (result ?? {})).toBe(false);
    } finally {
      await cleanupTempDir(dir);
    }
  });

  it("skips empty/whitespace-only files (partial-write robustness)", async () => {
    const dir = await createTempDir();
    try {
      const changesDir = join(dir, "changes");
      const changeDir = join(changesDir, "truncated-change");
      await mkdir(changeDir, { recursive: true });
      await writeFile(join(changeDir, "proposal.md"), "valid proposal");
      await writeFile(join(changeDir, "design.md"), "   \n\t  \n"); // whitespace-only
      await writeFile(join(changeDir, "agreement.md"), ""); // empty

      const result = await readDiskArtifactsForHydration(
        changesDir,
        "truncated-change",
      );
      expect(result).toEqual({ proposal: "valid proposal" });
      expect("design" in (result ?? {})).toBe(false);
      expect("agreement" in (result ?? {})).toBe(false);
    } finally {
      await cleanupTempDir(dir);
    }
  });

  it("hydration is idempotent — running twice produces the same result", async () => {
    const dir = await createTempDir();
    try {
      const changesDir = join(dir, "changes");
      const changeDir = join(changesDir, "stable");
      await mkdir(changeDir, { recursive: true });
      await writeFile(join(changeDir, "proposal.md"), "stable content");

      const first = await readDiskArtifactsForHydration(changesDir, "stable");
      const second = await readDiskArtifactsForHydration(changesDir, "stable");
      expect(first).toEqual(second);
    } finally {
      await cleanupTempDir(dir);
    }
  });
});
