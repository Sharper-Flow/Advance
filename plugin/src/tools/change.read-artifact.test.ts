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
import { TemporalQueryTimeoutError } from "../temporal/retry-wrapper";

function buildMockStore(overrides: {
  changesDir: string;
  rootDir: string;
  documents?: Change["documents"];
  get?: ReturnType<typeof vi.fn>;
}): Store {
  const get =
    overrides.get ??
    vi.fn().mockResolvedValue({
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

      const result = await readArtifact(store, "test-change", "proposal");
      expect(result).toEqual({ content: "from temporal", source: "workflow" });
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

      const result = await readArtifact(store, "test-change", "proposal");
      expect(result).toEqual({ content: "from disk", source: "disk" });
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
      await writeFile(join(bundleDir, "executive-summary.md"), "from archive");

      const store = buildMockStore({ changesDir, rootDir: dir });

      const result = await readArtifact(
        store,
        "test-change",
        "executiveSummary",
      );
      expect(result).toEqual({ content: "from archive", source: "archive" });
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

      const result = await readArtifact(store, "missing-change", "proposal");
      expect(result).toBeNull();
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
      const result = await readArtifact(
        store,
        "test-change",
        "problemStatement",
      );
      expect(result).toEqual({ content: "problem text", source: "disk" });
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
        proposal: { content: "p", source: "workflow" },
        design: { content: "d", source: "workflow" },
        executiveSummary: { content: "es", source: "workflow" },
        acceptance: { content: "ac", source: "workflow" },
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
      expect(result).toEqual({
        proposal: { content: "p", source: "workflow" },
        design: { content: "d", source: "workflow" },
      });
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
      expect(result).toEqual({
        proposal: { content: "from disk", source: "disk" },
      });
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
      const result = await readArtifact(store, "test-change", "proposal");
      expect(result).toEqual({ content: "from temporal", source: "workflow" });
    } finally {
      await cleanupTempDir(dir);
    }
  });
});

describe("readArtifact — active projection fallback", () => {
  it("returns documents from change.json when the workflow query is unavailable", async () => {
    const dir = await createTempDir();
    try {
      const changesDir = join(dir, "changes");
      const changeDir = join(changesDir, "test-change");
      await mkdir(changeDir, { recursive: true });
      await writeFile(
        join(changeDir, "change.json"),
        JSON.stringify({ documents: { proposal: "from projection" } }),
      );
      const get = vi
        .fn()
        .mockRejectedValue(new TemporalQueryTimeoutError(1_500));
      const store = buildMockStore({ changesDir, rootDir: dir, get });

      const result = await readArtifact(store, "test-change", "proposal");

      expect(result).toEqual({
        content: "from projection",
        source: "active_projection",
      });
    } finally {
      await cleanupTempDir(dir);
    }
  });

  it("still reads the local projection after the aggregate deadline is exhausted", async () => {
    const dir = await createTempDir();
    try {
      const changesDir = join(dir, "changes");
      const changeDir = join(changesDir, "test-change");
      await mkdir(changeDir, { recursive: true });
      await writeFile(
        join(changeDir, "change.json"),
        JSON.stringify({ documents: { proposal: "after deadline" } }),
      );
      const get = vi.fn();
      const store = buildMockStore({ changesDir, rootDir: dir, get });

      const result = await readArtifact(store, "test-change", "proposal", {
        deadline: { budgetMs: 8_000, deadlineAt: Date.now() - 1 },
      });

      expect(get).not.toHaveBeenCalled();
      expect(result).toEqual({
        content: "after deadline",
        source: "active_projection",
      });
    } finally {
      await cleanupTempDir(dir);
    }
  });

  it("does not consult the projection when the workflow query resolves content", async () => {
    const dir = await createTempDir();
    try {
      const changesDir = join(dir, "changes");
      const changeDir = join(changesDir, "test-change");
      await mkdir(changeDir, { recursive: true });
      await writeFile(
        join(changeDir, "change.json"),
        "not valid projection JSON",
      );
      const store = buildMockStore({
        changesDir,
        rootDir: dir,
        documents: { proposal: "from workflow" },
      });

      const result = await readArtifact(store, "test-change", "proposal");

      expect(result).toEqual({ content: "from workflow", source: "workflow" });
    } finally {
      await cleanupTempDir(dir);
    }
  });

  it("applies projection fallback and provenance to batched reads", async () => {
    const dir = await createTempDir();
    try {
      const changesDir = join(dir, "changes");
      const changeDir = join(changesDir, "test-change");
      await mkdir(changeDir, { recursive: true });
      await writeFile(
        join(changeDir, "change.json"),
        JSON.stringify({ documents: { proposal: "batched projection" } }),
      );
      const get = vi
        .fn()
        .mockRejectedValue(new TemporalQueryTimeoutError(1_500));
      const store = buildMockStore({ changesDir, rootDir: dir, get });

      const result = await readArtifacts(store, "test-change", ["proposal"]);

      expect(result).toEqual({
        proposal: {
          content: "batched projection",
          source: "active_projection",
        },
      });
    } finally {
      await cleanupTempDir(dir);
    }
  });
});
