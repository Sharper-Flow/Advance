/**
 * T9 KD-6: readArtifact + readArtifacts Temporal-first read path.
 *
 * Verifies:
 * - When state.documents[kind] is populated, content returns from Temporal
 *   without any disk read.
 * - When state.documents[kind] is empty/missing, disk active dir is consulted.
 * - When disk is missing, archive bundle is consulted.
 * - readArtifacts issues exactly ONE store.changes.get() call regardless of
 *   how many kinds are requested (C9 batched-query requirement).
 *
 * Tests use an in-memory mock Store; full integration with real Temporal is
 * covered by AC5/AC6 in T16 (cross-session smoke).
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { readArtifact, readArtifacts } from "./change";
import { cleanupTempDir, createTempDir } from "../__tests__/setup";
import type { Store } from "../storage/store";
import type { Change } from "../types";

function buildMockStore(overrides: {
  changesDir: string;
  rootDir: string;
  documents?: Change["documents"];
}): Store {
  const get = vi.fn().mockResolvedValue({
    success: true,
    data: {
      id: "test-change",
      documents: overrides.documents,
    } as Change,
  });

  return {
    paths: {
      root: overrides.rootDir,
      changes: overrides.changesDir,
    },
    changes: {
      get,
    },
  } as unknown as Store;
}

describe("readArtifact — Temporal-first read path", () => {
  it("returns content from state.documents when populated", async () => {
    const dir = await createTempDir();
    try {
      const changesDir = join(dir, "changes");
      const store = buildMockStore({
        changesDir,
        rootDir: dir,
        documents: { proposal: "from temporal" },
      });

      const content = await readArtifact(store, "test-change", "proposal");
      expect(content).toBe("from temporal");
      // Verify store.changes.get was called (Temporal-first)
      expect(store.changes.get).toHaveBeenCalledWith("test-change");
    } finally {
      await cleanupTempDir(dir);
    }
  });

  it("falls back to disk active dir when state.documents is empty", async () => {
    const dir = await createTempDir();
    try {
      const changesDir = join(dir, "changes");
      const changeDir = join(changesDir, "test-change");
      await mkdir(changeDir, { recursive: true });
      await writeFile(join(changeDir, "proposal.md"), "from disk");

      const store = buildMockStore({ changesDir, rootDir: dir });
      // No documents → falls through to disk

      const content = await readArtifact(store, "test-change", "proposal");
      expect(content).toBe("from disk");
    } finally {
      await cleanupTempDir(dir);
    }
  });

  it("falls back to archive bundle when active dir is missing", async () => {
    const dir = await createTempDir();
    try {
      const changesDir = join(dir, "changes");
      const archiveDir = join(dir, ".adv", "archive");
      // Bundle naming: `YYYY-MM-DD-{changeId}` per findArchiveBundle scan;
      // manifest (change.json) must exist for the candidate to qualify.
      const bundleDir = join(archiveDir, "2026-05-28-test-change");
      await mkdir(bundleDir, { recursive: true });
      await writeFile(join(bundleDir, "change.json"), "{}");
      await writeFile(
        join(bundleDir, "executive-summary.md"),
        "from archive",
      );

      const store = buildMockStore({ changesDir, rootDir: dir });

      const content = await readArtifact(
        store,
        "test-change",
        "executiveSummary",
      );
      expect(content).toBe("from archive");
    } finally {
      await cleanupTempDir(dir);
    }
  });

  it("returns null when content is unavailable from all sources", async () => {
    const dir = await createTempDir();
    try {
      const store = buildMockStore({
        changesDir: join(dir, "changes"),
        rootDir: dir,
      });

      const content = await readArtifact(store, "missing-change", "proposal");
      expect(content).toBeNull();
    } finally {
      await cleanupTempDir(dir);
    }
  });

  it("resolves canonical kebab-case filename for problemStatement", async () => {
    const dir = await createTempDir();
    try {
      const changesDir = join(dir, "changes");
      const changeDir = join(changesDir, "test-change");
      await mkdir(changeDir, { recursive: true });
      await writeFile(join(changeDir, "problem-statement.md"), "problem text");

      const store = buildMockStore({ changesDir, rootDir: dir });
      const content = await readArtifact(
        store,
        "test-change",
        "problemStatement",
      );
      expect(content).toBe("problem text");
    } finally {
      await cleanupTempDir(dir);
    }
  });
});

describe("readArtifacts — batched query (C9)", () => {
  it("issues exactly ONE store.changes.get() call regardless of kinds count", async () => {
    const dir = await createTempDir();
    try {
      const changesDir = join(dir, "changes");
      const store = buildMockStore({
        changesDir,
        rootDir: dir,
        documents: {
          proposal: "p",
          design: "d",
          executiveSummary: "es",
          acceptance: "ac",
        },
      });

      const result = await readArtifacts(store, "test-change", [
        "proposal",
        "problemStatement",
        "agreement",
        "design",
        "executiveSummary",
        "acceptance",
      ]);

      expect(result).toEqual({
        proposal: "p",
        design: "d",
        executiveSummary: "es",
        acceptance: "ac",
      });
      // C9: single batched query
      expect(store.changes.get).toHaveBeenCalledTimes(1);
    } finally {
      await cleanupTempDir(dir);
    }
  });

  it("returns partial record with only the requested kinds", async () => {
    const dir = await createTempDir();
    try {
      const changesDir = join(dir, "changes");
      const store = buildMockStore({
        changesDir,
        rootDir: dir,
        documents: { proposal: "p", design: "d", acceptance: "ac" },
      });

      const result = await readArtifacts(store, "test-change", [
        "proposal",
        "design",
      ]);
      expect(result).toEqual({ proposal: "p", design: "d" });
      // acceptance NOT in result because not requested
      expect("acceptance" in result).toBe(false);
    } finally {
      await cleanupTempDir(dir);
    }
  });

  it("falls back to disk per-kind when Temporal documents are missing", async () => {
    const dir = await createTempDir();
    try {
      const changesDir = join(dir, "changes");
      const changeDir = join(changesDir, "test-change");
      await mkdir(changeDir, { recursive: true });
      await writeFile(join(changeDir, "proposal.md"), "from disk");

      const store = buildMockStore({ changesDir, rootDir: dir });
      // No documents — Temporal returns empty, disk has proposal

      const result = await readArtifacts(store, "test-change", [
        "proposal",
        "agreement",
      ]);
      expect(result).toEqual({ proposal: "from disk" });
      expect("agreement" in result).toBe(false);
    } finally {
      await cleanupTempDir(dir);
    }
  });
});

describe("readArtifact — XDG-independence smoke check (AC2)", () => {
  it("returns content from Temporal even when disk has been deleted", async () => {
    const dir = await createTempDir();
    try {
      const changesDir = join(dir, "changes");
      const changeDir = join(changesDir, "test-change");
      await mkdir(changeDir, { recursive: true });
      await writeFile(join(changeDir, "proposal.md"), "from disk");

      // Populate Temporal documents (simulates content-in-state)
      const store = buildMockStore({
        changesDir,
        rootDir: dir,
        documents: { proposal: "from temporal" },
      });

      // Delete disk file mid-test — simulates per-session XDG isolation
      await rm(join(changeDir, "proposal.md"));

      // Content still available from Temporal
      const content = await readArtifact(store, "test-change", "proposal");
      expect(content).toBe("from temporal");
    } finally {
      await cleanupTempDir(dir);
    }
  });
});
