import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { createTempDir, cleanupTempDir } from "../__tests__/setup";
import { normalizeArtifactMetadataForReadback } from "../tools/change/artifacts";
import { createDiskStore } from "./store-disk";
import { migrateArtifactMetadataProjections } from "./artifact-metadata-migration";

function changeFixture(
  id: string,
  status: "draft" | "archived",
): Record<string, unknown> {
  return {
    id,
    title: id,
    status,
    created_at: "2026-08-07T00:00:00.000Z",
    tasks: [],
    deltas: {},
    documents: { proposal: "artifact content must remain unchanged" },
    artifacts: {
      proposal: {
        path: `/legacy/${id}/proposal.md`,
        updatedAt: "2026-08-07T00:00:00.000Z",
        source: "temporal",
        readable: true,
      },
    },
  };
}

function markerPath(root: string): string {
  return join(root, ".adv", "artifact-metadata-migration-complete.json");
}

async function writeProjection(
  directory: string,
  id: string,
  change: Record<string, unknown>,
): Promise<string> {
  const changeDir = join(directory, id);
  await mkdir(changeDir, { recursive: true });
  const path = join(changeDir, "change.json");
  await writeFile(path, JSON.stringify(change, null, 2));
  return path;
}

describe("artifact metadata migration", () => {
  test("migrates active projection metadata without changing artifact content", async () => {
    const root = await createTempDir();
    try {
      const activePath = await writeProjection(
        join(root, ".adv", "changes"),
        "active-legacy",
        changeFixture("active-legacy", "draft"),
      );

      await createDiskStore(root);

      const migrated = JSON.parse(await readFile(activePath, "utf8"));
      expect(migrated.artifacts.proposal.source).toBe("disk");
      expect(migrated.documents.proposal).toBe(
        "artifact content must remain unchanged",
      );
    } finally {
      await cleanupTempDir(root);
    }
  });

  test("migrates archived projection metadata", async () => {
    const root = await createTempDir();
    try {
      const archivePath = await writeProjection(
        join(root, ".adv", "archive"),
        "2026-08-07-archived-legacy",
        changeFixture("archived-legacy", "archived"),
      );

      await createDiskStore(root);

      const migrated = JSON.parse(await readFile(archivePath, "utf8"));
      expect(migrated.artifacts.proposal.source).toBe("disk");
      expect(migrated.documents.proposal).toBe(
        "artifact content must remain unchanged",
      );
    } finally {
      await cleanupTempDir(root);
    }
  });

  test("preserves archive and recovery provenance", async () => {
    const root = await createTempDir();
    try {
      const change = changeFixture("preserve-provenance", "draft");
      change.artifacts = {
        proposal: {
          path: "/legacy/proposal.md",
          updatedAt: "2026-08-07T00:00:00.000Z",
          source: "temporal",
          readable: true,
        },
        design: {
          path: "/archive/design.md",
          updatedAt: "2026-08-07T00:00:00.000Z",
          source: "archive",
          readable: true,
        },
        acceptance: {
          path: "/recovery/acceptance.md",
          updatedAt: "2026-08-07T00:00:00.000Z",
          source: "recovery",
          readable: true,
        },
      };
      const path = await writeProjection(
        join(root, ".adv", "changes"),
        "preserve-provenance",
        change,
      );

      await createDiskStore(root);

      const migrated = JSON.parse(await readFile(path, "utf8"));
      expect(migrated.artifacts).toMatchObject({
        proposal: { source: "disk" },
        design: { source: "archive" },
        acceptance: { source: "recovery" },
      });
    } finally {
      await cleanupTempDir(root);
    }
  });

  test("is idempotent", async () => {
    const root = await createTempDir();
    try {
      await writeProjection(
        join(root, ".adv", "changes"),
        "idempotent-legacy",
        changeFixture("idempotent-legacy", "draft"),
      );

      const store = await createDiskStore(root);
      const before = await readFile(
        join(store.paths.changes, "idempotent-legacy", "change.json"),
        "utf8",
      );
      const report = await migrateArtifactMetadataProjections(
        store.paths.changes,
        store.paths.archive,
      );
      const after = await readFile(
        join(store.paths.changes, "idempotent-legacy", "change.json"),
        "utf8",
      );

      expect(report.migrated).toBe(0);
      expect(after).toBe(before);
    } finally {
      await cleanupTempDir(root);
    }
  });

  test("reports malformed projections without overwriting them", async () => {
    const root = await createTempDir();
    try {
      const path = await writeProjection(
        join(root, ".adv", "changes"),
        "malformed",
        changeFixture("malformed", "draft"),
      );
      await writeFile(path, "{ malformed json\n");

      const report = await migrateArtifactMetadataProjections(
        join(root, ".adv", "changes"),
        join(root, ".adv", "archive"),
      );

      expect(report.failed).toHaveLength(1);
      expect(await readFile(path, "utf8")).toBe("{ malformed json\n");
      await expect(readFile(markerPath(root), "utf8")).rejects.toMatchObject({
        code: "ENOENT",
      });
    } finally {
      await cleanupTempDir(root);
    }
  });

  test("writes a completion marker only after success and skips later scans", async () => {
    const root = await createTempDir();
    try {
      const path = await writeProjection(
        join(root, ".adv", "changes"),
        "marker-skip",
        changeFixture("marker-skip", "draft"),
      );

      await createDiskStore(root);
      await expect(readFile(markerPath(root), "utf8")).resolves.toContain(
        '"version":1',
      );
      const migrated = JSON.parse(await readFile(path, "utf8"));
      migrated.artifacts.proposal.source = "temporal";
      await writeFile(path, JSON.stringify(migrated, null, 2));

      await createDiskStore(root);

      const skipped = JSON.parse(await readFile(path, "utf8"));
      expect(skipped.artifacts.proposal.source).toBe("temporal");
    } finally {
      await cleanupTempDir(root);
    }
  });

  test("retries after malformed projections are repaired", async () => {
    const root = await createTempDir();
    try {
      const path = await writeProjection(
        join(root, ".adv", "changes"),
        "marker-retry",
        changeFixture("marker-retry", "draft"),
      );
      await writeFile(path, "{ malformed json\n");

      await createDiskStore(root);
      await expect(readFile(markerPath(root), "utf8")).rejects.toMatchObject({
        code: "ENOENT",
      });

      await writeFile(
        path,
        JSON.stringify(changeFixture("marker-retry", "draft"), null, 2),
      );
      await createDiskStore(root);

      const migrated = JSON.parse(await readFile(path, "utf8"));
      expect(migrated.artifacts.proposal.source).toBe("disk");
      await expect(readFile(markerPath(root), "utf8")).resolves.toContain(
        '"version":1',
      );
    } finally {
      await cleanupTempDir(root);
    }
  });
});

describe("normalizeArtifactMetadataForReadback", () => {
  test("normalizes an existing historical path to disk", async () => {
    const root = await createTempDir();
    try {
      const path = join(root, "proposal.md");
      await writeFile(path, "proposal");

      const result = await normalizeArtifactMetadataForReadback({
        proposal: {
          path,
          updatedAt: "2026-08-07T00:00:00.000Z",
          source: "temporal",
          readable: true,
        },
      });

      expect(result.proposal).toMatchObject({
        path,
        source: "disk",
        readable: true,
      });
    } finally {
      await cleanupTempDir(root);
    }
  });

  test("preserves missing-path behavior", async () => {
    const result = await normalizeArtifactMetadataForReadback({
      proposal: {
        path: "/does/not/exist.md",
        updatedAt: "2026-08-07T00:00:00.000Z",
        source: "temporal",
        readable: true,
      },
    });

    expect(result.proposal).toMatchObject({
      source: "temporal",
      readable: false,
    });
    expect(result.proposal).not.toHaveProperty("path");
  });

  test("preserves rejected and unreadable artifacts", async () => {
    const root = await createTempDir();
    try {
      const path = join(root, "proposal.md");
      await writeFile(path, "proposal");
      const rejection = {
        reason: "ARTIFACT_OVERSIZED" as const,
        attempted_size: 10,
        cap: 5,
        rejected_at: "2026-08-07T00:00:00.000Z",
      };

      const result = await normalizeArtifactMetadataForReadback({
        proposal: {
          path,
          updatedAt: "2026-08-07T00:00:00.000Z",
          source: "temporal",
          readable: true,
          rejection,
        },
        design: {
          path,
          updatedAt: "2026-08-07T00:00:00.000Z",
          source: "temporal",
          readable: false,
        },
      });

      expect(result.proposal).toMatchObject({
        source: "temporal",
        readable: false,
        rejection,
      });
      expect(result.design).toMatchObject({
        source: "temporal",
        readable: false,
      });
      expect(result.proposal).not.toHaveProperty("path");
      expect(result.design).not.toHaveProperty("path");
    } finally {
      await cleanupTempDir(root);
    }
  });

  test("preserves readable archive and recovery provenance", async () => {
    const root = await createTempDir();
    try {
      const path = join(root, "proposal.md");
      await writeFile(path, "proposal");

      const result = await normalizeArtifactMetadataForReadback({
        proposal: {
          path,
          updatedAt: "2026-08-07T00:00:00.000Z",
          source: "archive",
          readable: true,
        },
        design: {
          path,
          updatedAt: "2026-08-07T00:00:00.000Z",
          source: "recovery",
          readable: true,
        },
      });

      expect(result).toMatchObject({
        proposal: { path, source: "archive", readable: true },
        design: { path, source: "recovery", readable: true },
      });
    } finally {
      await cleanupTempDir(root);
    }
  });
});
