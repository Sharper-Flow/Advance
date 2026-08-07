/**
 * T9 KD-6: readArtifact + readArtifacts disk-authoritative read path.
 *
 * Verifies:
 * - When the durable projection documents[kind] is populated, content returns
 *   from the projection without any active-artifact read.
 * - When projection documents[kind] is empty/missing, disk active dir is consulted.
 * - When disk is missing, archive bundle is consulted.
 * - readArtifacts reads the projection once regardless of how many kinds are
 *   requested (C9 batched-read requirement).
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { readArtifact, readArtifacts } from "./change";
import { cleanupTempDir, createTempDir } from "../__tests__/setup";
import type { Store } from "../storage/store";

function buildMockStore(overrides: {
  changesDir: string;
  rootDir: string;
}): Store {
  return {
    paths: {
      root: overrides.rootDir,
      changes: overrides.changesDir,
    },
    changes: {},
  } as unknown as Store;
}

describe("readArtifact — disk-authoritative read path", () => {
  it("returns content from the durable projection when populated", async () => {
    const dir = await createTempDir();
    try {
      const changesDir = join(dir, "changes");
      const store = buildMockStore({
        changesDir,
        rootDir: dir,
      });
      await mkdir(changesDir, { recursive: true });
      await writeFile(
        join(changesDir, "test-change.json"),
        JSON.stringify({ documents: { proposal: "from projection" } }),
      );

      const result = await readArtifact(store, "test-change", "proposal");
      expect(result).toEqual({
        content: "from projection",
        source: "active_projection",
      });
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

describe("readArtifacts — batched projection read (C9)", () => {
  it("reads the projection once regardless of kinds count", async () => {
    const dir = await createTempDir();
    try {
      const changesDir = join(dir, "changes");
      const store = buildMockStore({
        changesDir,
        rootDir: dir,
      });
      await mkdir(changesDir, { recursive: true });
      await writeFile(
        join(changesDir, "test-change.json"),
        JSON.stringify({
          documents: {
            proposal: "p",
            design: "d",
            executiveSummary: "es",
            acceptance: "ac",
          },
        }),
      );

      const result = await readArtifacts(store, "test-change", [
        "proposal",
        "problemStatement",
        "agreement",
        "design",
        "executiveSummary",
        "acceptance",
      ]);

      expect(result).toEqual({
        proposal: { content: "p", source: "active_projection" },
        design: { content: "d", source: "active_projection" },
        executiveSummary: { content: "es", source: "active_projection" },
        acceptance: { content: "ac", source: "active_projection" },
      });
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
      });
      await mkdir(changesDir, { recursive: true });
      await writeFile(
        join(changesDir, "test-change.json"),
        JSON.stringify({
          documents: { proposal: "p", design: "d", acceptance: "ac" },
        }),
      );

      const result = await readArtifacts(store, "test-change", [
        "proposal",
        "design",
      ]);
      expect(result).toEqual({
        proposal: { content: "p", source: "active_projection" },
        design: { content: "d", source: "active_projection" },
      });
      // acceptance NOT in result because not requested
      expect("acceptance" in result).toBe(false);
    } finally {
      await cleanupTempDir(dir);
    }
  });

  it("falls back to disk per-kind when projection documents are missing", async () => {
    const dir = await createTempDir();
    try {
      const changesDir = join(dir, "changes");
      const changeDir = join(changesDir, "test-change");
      await mkdir(changeDir, { recursive: true });
      await writeFile(join(changeDir, "proposal.md"), "from disk");

      const store = buildMockStore({ changesDir, rootDir: dir });
      // No projection documents — disk has proposal

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
  it("returns content from the projection even when the active artifact is deleted", async () => {
    const dir = await createTempDir();
    try {
      const changesDir = join(dir, "changes");
      const changeDir = join(changesDir, "test-change");
      await mkdir(changeDir, { recursive: true });
      await writeFile(join(changeDir, "proposal.md"), "from disk");

      // Populate the durable projection.
      const store = buildMockStore({
        changesDir,
        rootDir: dir,
      });
      await writeFile(
        join(changesDir, "test-change.json"),
        JSON.stringify({ documents: { proposal: "from projection" } }),
      );

      // Delete disk file mid-test — simulates per-session XDG isolation
      await rm(join(changeDir, "proposal.md"));

      // Content still available from the projection.
      const result = await readArtifact(store, "test-change", "proposal");
      expect(result).toEqual({
        content: "from projection",
        source: "active_projection",
      });
    } finally {
      await cleanupTempDir(dir);
    }
  });
});

describe("readArtifact — active projection fallback", () => {
  it("returns documents from the durable projection", async () => {
    const dir = await createTempDir();
    try {
      const changesDir = join(dir, "changes");
      await mkdir(changesDir, { recursive: true });
      await writeFile(
        join(changesDir, "test-change.json"),
        JSON.stringify({ documents: { proposal: "from projection" } }),
      );
      const store = buildMockStore({ changesDir, rootDir: dir });

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
      await mkdir(changesDir, { recursive: true });
      await writeFile(
        join(changesDir, "test-change.json"),
        JSON.stringify({ documents: { proposal: "after deadline" } }),
      );
      const store = buildMockStore({ changesDir, rootDir: dir });

      const result = await readArtifact(store, "test-change", "proposal");

      expect(result).toEqual({
        content: "after deadline",
        source: "active_projection",
      });
    } finally {
      await cleanupTempDir(dir);
    }
  });

  it("prefers the projection over stale active artifact content", async () => {
    const dir = await createTempDir();
    try {
      const changesDir = join(dir, "changes");
      const changeDir = join(changesDir, "test-change");
      await mkdir(changeDir, { recursive: true });
      await mkdir(changesDir, { recursive: true });
      await writeFile(
        join(changesDir, "test-change.json"),
        JSON.stringify({ documents: { proposal: "from projection" } }),
      );
      await writeFile(join(changeDir, "proposal.md"), "stale active artifact");
      const store = buildMockStore({ changesDir, rootDir: dir });

      const result = await readArtifact(store, "test-change", "proposal");

      expect(result).toEqual({
        content: "from projection",
        source: "active_projection",
      });
    } finally {
      await cleanupTempDir(dir);
    }
  });

  it("applies projection fallback and provenance to batched reads", async () => {
    const dir = await createTempDir();
    try {
      const changesDir = join(dir, "changes");
      await mkdir(changesDir, { recursive: true });
      await writeFile(
        join(changesDir, "test-change.json"),
        JSON.stringify({ documents: { proposal: "batched projection" } }),
      );
      const store = buildMockStore({ changesDir, rootDir: dir });

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

describe("readArtifact — canonical projection layout (#403 regression)", () => {
  it("reads agreement from {changeId}/change.json when no agreement.md exists", async () => {
    const dir = await createTempDir();
    try {
      const changesDir = join(dir, "changes");
      const changeDir = join(changesDir, "test-change");
      await mkdir(changeDir, { recursive: true });
      // Canonical projection: {changeId}/change.json with documents. No
      // agreement.md on disk — the #403 scenario where an update-written
      // artifact exists only in the projection. Previously readProjectionDocuments
      // read only the flat {changeId}.json (which never exists), so this missed
      // and readArtifact fell through to disk and returned null.
      await writeFile(
        join(changeDir, "change.json"),
        JSON.stringify({
          documents: { agreement: "from canonical projection" },
        }),
      );

      const store = buildMockStore({ changesDir, rootDir: dir });
      const result = await readArtifact(store, "test-change", "agreement");
      expect(result).toEqual({
        content: "from canonical projection",
        source: "active_projection",
      });
    } finally {
      await cleanupTempDir(dir);
    }
  });

  it("prefers canonical {changeId}/change.json over a stale flat envelope", async () => {
    const dir = await createTempDir();
    try {
      const changesDir = join(dir, "changes");
      const changeDir = join(changesDir, "test-change");
      await mkdir(changeDir, { recursive: true });
      await writeFile(
        join(changeDir, "change.json"),
        JSON.stringify({ documents: { agreement: "canonical" } }),
      );
      // Stale flat envelope that must NOT win over canonical.
      await writeFile(
        join(changesDir, "test-change.json"),
        JSON.stringify({ documents: { agreement: "stale flat" } }),
      );

      const store = buildMockStore({ changesDir, rootDir: dir });
      const result = await readArtifact(store, "test-change", "agreement");
      expect(result).toEqual({
        content: "canonical",
        source: "active_projection",
      });
    } finally {
      await cleanupTempDir(dir);
    }
  });
});
