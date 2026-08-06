/**
 * Change Projection Quarantine Tool Tests
 *
 * Covers: unauthorized refusal, healthy/missing refusal, corrupt/oversized
 * quarantine, retained original bytes + audit, idempotence, and no synthetic
 * reconstruction path.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdir, rm, writeFile, stat } from "node:fs/promises";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { createTempDir, cleanupTempDir } from "../__tests__/setup";
import { changeProjectionQuarantineTools } from "./change-projection-quarantine";
import {
  listChangeProjectionQuarantineAudits,
  type ChangeProjectionQuarantineAuditEntry,
} from "../storage/change-projection-quarantine-audit";
import { PROJECTION_DOCUMENT_BYTE_LIMIT } from "../storage/change-projection-reader";
import type { Store } from "../storage/store";

// =============================================================================
// Mocks
// =============================================================================

const mocks = vi.hoisted(() => ({
  acquireFileLock: vi.fn(),
  appendChangeProjectionQuarantineAudit: vi.fn(),
  getProjectId: vi.fn(async () => "test-project-id"),
}));

vi.mock("../utils/fs", async () => {
  const actual =
    await vi.importActual<typeof import("../utils/fs")>("../utils/fs");
  return {
    ...actual,
    acquireFileLock: async (
      filePath: string,
      timeoutMs?: number,
    ): Promise<() => Promise<void>> => {
      const result = await mocks.acquireFileLock(filePath, timeoutMs);
      if (result !== undefined) {
        return result as () => Promise<void>;
      }
      return actual.acquireFileLock(filePath, timeoutMs);
    },
  };
});

vi.mock("../utils/project-id", async () => {
  const actual = await vi.importActual<typeof import("../utils/project-id")>(
    "../utils/project-id",
  );
  return {
    ...actual,
    getProjectId: mocks.getProjectId,
  };
});

vi.mock("../storage/change-projection-quarantine-audit", async () => {
  const actual = await vi.importActual<
    typeof import("../storage/change-projection-quarantine-audit")
  >("../storage/change-projection-quarantine-audit");
  return {
    ...actual,
    appendChangeProjectionQuarantineAudit: async (
      ...args: Parameters<typeof actual.appendChangeProjectionQuarantineAudit>
    ): Promise<
      ReturnType<typeof actual.appendChangeProjectionQuarantineAudit>
    > => {
      const result = await mocks.appendChangeProjectionQuarantineAudit(...args);
      if (result !== undefined) {
        return result as ReturnType<
          typeof actual.appendChangeProjectionQuarantineAudit
        >;
      }
      return actual.appendChangeProjectionQuarantineAudit(...args);
    },
  };
});

// =============================================================================
// Helpers
// =============================================================================

function createMockStore(root: string, changesDir: string): Store {
  return {
    paths: {
      root,
      changes: changesDir,
    } as Store["paths"],
    config: null,
    init: vi.fn(),
    sync: vi.fn(),
    close: vi.fn(),
    flush: vi.fn(),
    specs: {} as Store["specs"],
    changes: {} as Store["changes"],
    tasks: {} as Store["tasks"],
    wisdom: {} as Store["wisdom"],
    gates: {} as Store["gates"],
    status: vi.fn(),
  } as unknown as Store;
}

async function writeChangeJson(
  changesDir: string,
  changeId: string,
  content: string,
): Promise<string> {
  const dir = join(changesDir, changeId);
  await mkdir(dir, { recursive: true });
  const path = join(dir, "change.json");
  await writeFile(path, content);
  return path;
}

function parseResult(result: string): Record<string, unknown> {
  return JSON.parse(result) as Record<string, unknown>;
}

// =============================================================================
// Tests
// =============================================================================

describe("adv_change_projection_quarantine", () => {
  let tempDir: string;
  let changesDir: string;
  let store: Store;

  beforeEach(async () => {
    tempDir = await createTempDir("adv-change-projection-quarantine-");
    changesDir = join(tempDir, "changes");
    store = createMockStore(tempDir, changesDir);
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
    vi.clearAllMocks();
  });

  test("refuses when approvedByUser is false", async () => {
    const path = await writeChangeJson(
      changesDir,
      "oversized",
      "x".repeat(PROJECTION_DOCUMENT_BYTE_LIMIT + 1),
    );

    const result = parseResult(
      await changeProjectionQuarantineTools.adv_change_projection_quarantine.execute(
        {
          changeId: "oversized",
          approvedByUser: false,
          approvalEvidence: "operator approved",
        },
        store,
      ),
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe("UNAPPROVED");
    await expect(stat(path)).resolves.toBeDefined();
  });

  test("refuses when approvalEvidence is blank", async () => {
    const path = await writeChangeJson(
      changesDir,
      "oversized",
      "x".repeat(PROJECTION_DOCUMENT_BYTE_LIMIT + 1),
    );

    const result = parseResult(
      await changeProjectionQuarantineTools.adv_change_projection_quarantine.execute(
        {
          changeId: "oversized",
          approvedByUser: true,
          approvalEvidence: "   ",
        },
        store,
      ),
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe("MISSING_EVIDENCE");
    await expect(stat(path)).resolves.toBeDefined();
  });

  test("refuses a healthy projection", async () => {
    await writeChangeJson(
      changesDir,
      "healthy",
      JSON.stringify({
        id: "healthy",
        title: "Healthy",
        status: "draft",
        created_at: "2026-01-01T00:00:00Z",
      }),
    );

    const result = parseResult(
      await changeProjectionQuarantineTools.adv_change_projection_quarantine.execute(
        {
          changeId: "healthy",
          approvedByUser: true,
          approvalEvidence: "operator approved",
        },
        store,
      ),
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe("HEALTHY_REFUSAL");
  });

  test("refuses a missing projection", async () => {
    const result = parseResult(
      await changeProjectionQuarantineTools.adv_change_projection_quarantine.execute(
        {
          changeId: "missing",
          approvedByUser: true,
          approvalEvidence: "operator approved",
        },
        store,
      ),
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe("NOT_FOUND_REFUSAL");
  });

  test("quarantines an oversized projection and records audit", async () => {
    const content = "x".repeat(PROJECTION_DOCUMENT_BYTE_LIMIT + 1);
    const sourcePath = await writeChangeJson(changesDir, "oversized", content);
    const sourceStats = await stat(sourcePath);

    const result = parseResult(
      await changeProjectionQuarantineTools.adv_change_projection_quarantine.execute(
        {
          changeId: "oversized",
          approvedByUser: true,
          approvalEvidence: "operator approved",
        },
        store,
      ),
    );

    expect(result.success).toBe(true);
    expect(result.code).toBe("QUARANTINED");
    expect(result.reason).toBe("oversized");
    expect(result.change_id).toBe("oversized");
    expect(result.source_path).toBe(sourcePath);
    expect(result.size_bytes).toBe(sourceStats.size);
    expect(typeof result.quarantine_path).toBe("string");
    expect(typeof result.audit_id).toBe("string");
    expect(typeof result.recorded_at).toBe("string");

    // Active read path no longer sees the file.
    await expect(stat(sourcePath)).rejects.toThrow();

    // Retained original bytes.
    const quarantineStats = await stat(result.quarantine_path as string);
    expect(quarantineStats.size).toBe(sourceStats.size);

    // Audit entry recorded.
    const audits = await listChangeProjectionQuarantineAudits(tempDir);
    expect(audits).toHaveLength(1);
    const audit = audits[0] as ChangeProjectionQuarantineAuditEntry;
    expect(audit.change_id).toBe("oversized");
    expect(audit.reason).toBe("oversized");
    expect(audit.action).toBe("quarantine");
    expect(audit.source_path).toBe(sourcePath);
    expect(audit.quarantine_path).toBe(result.quarantine_path);
    expect(audit.size_bytes).toBe(sourceStats.size);
    expect(audit.outcome).toBe("success");
  });

  test("quarantines a corrupt projection", async () => {
    const sourcePath = await writeChangeJson(
      changesDir,
      "corrupt",
      "{ not json ",
    );
    const sourceStats = await stat(sourcePath);

    const result = parseResult(
      await changeProjectionQuarantineTools.adv_change_projection_quarantine.execute(
        {
          changeId: "corrupt",
          approvedByUser: true,
          approvalEvidence: "operator approved",
        },
        store,
      ),
    );

    expect(result.success).toBe(true);
    expect(result.code).toBe("QUARANTINED");
    expect(result.reason).toBe("corrupt");
    expect(result.size_bytes).toBe(sourceStats.size);
    await expect(stat(sourcePath)).rejects.toThrow();

    const audits = await listChangeProjectionQuarantineAudits(tempDir);
    expect(audits).toHaveLength(1);
    expect(audits[0]?.reason).toBe("corrupt");
  });

  test("dryRun previews without moving or auditing", async () => {
    const sourcePath = await writeChangeJson(
      changesDir,
      "oversized",
      "x".repeat(PROJECTION_DOCUMENT_BYTE_LIMIT + 1),
    );

    const result = parseResult(
      await changeProjectionQuarantineTools.adv_change_projection_quarantine.execute(
        {
          changeId: "oversized",
          dryRun: true,
        },
        store,
      ),
    );

    expect(result.success).toBe(true);
    expect(result.code).toBe("QUARANTINED");
    expect(result.dry_run).toBe(true);
    expect(result.audit_id).toBe("dry-run");
    await expect(stat(sourcePath)).resolves.toBeDefined();
    const audits = await listChangeProjectionQuarantineAudits(tempDir);
    expect(audits).toHaveLength(0);
  });

  test("idempotent after quarantine: second call sees not_found", async () => {
    await writeChangeJson(
      changesDir,
      "oversized",
      "x".repeat(PROJECTION_DOCUMENT_BYTE_LIMIT + 1),
    );

    const first = parseResult(
      await changeProjectionQuarantineTools.adv_change_projection_quarantine.execute(
        {
          changeId: "oversized",
          approvedByUser: true,
          approvalEvidence: "operator approved",
        },
        store,
      ),
    );
    expect(first.success).toBe(true);

    const second = parseResult(
      await changeProjectionQuarantineTools.adv_change_projection_quarantine.execute(
        {
          changeId: "oversized",
          approvedByUser: true,
          approvalEvidence: "operator approved again",
        },
        store,
      ),
    );
    expect(second.success).toBe(false);
    expect(second.code).toBe("NOT_FOUND_REFUSAL");
  });

  test("does not synthesize state or mutate outside the projection", async () => {
    await writeChangeJson(
      changesDir,
      "oversized",
      "x".repeat(PROJECTION_DOCUMENT_BYTE_LIMIT + 1),
    );

    await changeProjectionQuarantineTools.adv_change_projection_quarantine.execute(
      {
        changeId: "oversized",
        approvedByUser: true,
        approvalEvidence: "operator approved",
      },
      store,
    );

    // Store lifecycle methods are not used.
    expect(store.init).not.toHaveBeenCalled();
    expect(store.sync).not.toHaveBeenCalled();
    expect(store.close).not.toHaveBeenCalled();
    expect(store.flush).not.toHaveBeenCalled();
  });

  test("refuses invalid changeId with path traversal", async () => {
    const result = parseResult(
      await changeProjectionQuarantineTools.adv_change_projection_quarantine.execute(
        {
          changeId: "../foo",
          approvedByUser: true,
          approvalEvidence: "operator approved",
        },
        store,
      ),
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe("INVALID_CHANGE_ID");
  });

  test("refuses when lock acquisition fails", async () => {
    await writeChangeJson(
      changesDir,
      "oversized",
      "x".repeat(PROJECTION_DOCUMENT_BYTE_LIMIT + 1),
    );

    mocks.acquireFileLock.mockRejectedValueOnce(new Error("lock busy"));

    const result = parseResult(
      await changeProjectionQuarantineTools.adv_change_projection_quarantine.execute(
        {
          changeId: "oversized",
          approvedByUser: true,
          approvalEvidence: "operator approved",
        },
        store,
      ),
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe("LOCK_FAILED");
    expect(result.error).toContain("lock busy");
  });

  test("refuses when source projection changes after diagnosis", async () => {
    const sourcePath = await writeChangeJson(
      changesDir,
      "changing",
      "{ not json ",
    );

    mocks.acquireFileLock.mockImplementationOnce(async () => {
      // Simulate a concurrent repair that flips the projection to healthy
      // while the quarantine is acquiring its lock.
      await writeFile(
        sourcePath,
        JSON.stringify({
          id: "changing",
          title: "Now healthy",
          status: "draft",
          created_at: "2026-01-01T00:00:00Z",
        }),
      );
      return async () => {};
    });

    const result = parseResult(
      await changeProjectionQuarantineTools.adv_change_projection_quarantine.execute(
        {
          changeId: "changing",
          approvedByUser: true,
          approvalEvidence: "operator approved",
        },
        store,
      ),
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe("SOURCE_CHANGED");
    expect(result.details).toContain("changed between diagnosis");
  });

  test("rolls back the move when audit append fails", async () => {
    const content = "x".repeat(PROJECTION_DOCUMENT_BYTE_LIMIT + 1);
    const sourcePath = await writeChangeJson(changesDir, "oversized", content);

    mocks.appendChangeProjectionQuarantineAudit.mockRejectedValueOnce(
      new Error("audit disk full"),
    );

    const result = parseResult(
      await changeProjectionQuarantineTools.adv_change_projection_quarantine.execute(
        {
          changeId: "oversized",
          approvedByUser: true,
          approvalEvidence: "operator approved",
        },
        store,
      ),
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe("AUDIT_FAILED");
    expect(result.rolled_back).toBe(true);
    expect(result.recovery_action).toContain("Investigate");

    // Active read path restored.
    await expect(stat(sourcePath)).resolves.toBeDefined();
    const restoredStats = await stat(sourcePath);
    expect(restoredStats.size).toBe(content.length);

    // No audit entry was recorded.
    const audits = await listChangeProjectionQuarantineAudits(tempDir);
    expect(audits).toHaveLength(0);
  });

  test("returns severe result when audit append and rollback both fail", async () => {
    const content = "x".repeat(PROJECTION_DOCUMENT_BYTE_LIMIT + 1);
    const sourcePath = await writeChangeJson(changesDir, "oversized", content);

    mocks.appendChangeProjectionQuarantineAudit.mockImplementationOnce(
      async () => {
        // Wipe the source directory so the rollback rename fails.
        await rm(join(changesDir, "oversized"), {
          recursive: true,
          force: true,
        });
        throw new Error("audit broke");
      },
    );

    const result = parseResult(
      await changeProjectionQuarantineTools.adv_change_projection_quarantine.execute(
        {
          changeId: "oversized",
          approvedByUser: true,
          approvalEvidence: "operator approved",
        },
        store,
      ),
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe("AUDIT_ROLLBACK_FAILED");
    expect(result.rolled_back).toBe(false);
    expect(result.error).toContain("audit broke");
    expect(result.rollback_error).toBeTruthy();
    expect(result.recovery_action).toContain("retained bytes");

    // Active read path is gone; retained bytes are in quarantine.
    await expect(stat(sourcePath)).rejects.toThrow();
    await expect(stat(result.quarantine_path as string)).resolves.toBeDefined();
  });

  test("resolves project identity from git root when external state root is non-git", async () => {
    const gitRoot = await createTempDir("adv-quarantine-git-root-");
    const externalDir = await createTempDir("adv-quarantine-external-");

    try {
      // Real committed Git fixture for identity resolution.
      execSync("git init -b main", { cwd: gitRoot, stdio: "ignore" });
      execSync("git config user.email test@test.com", {
        cwd: gitRoot,
        stdio: "ignore",
      });
      execSync("git config user.name Test", { cwd: gitRoot, stdio: "ignore" });
      await writeFile(join(gitRoot, "README.md"), "# test");
      execSync("git add README.md && git commit -m initial", {
        cwd: gitRoot,
        stdio: "ignore",
      });

      // External state is intentionally outside the git repo (non-git).
      const extChangesDir = join(externalDir, "changes");
      const content = "x".repeat(PROJECTION_DOCUMENT_BYTE_LIMIT + 1);
      const sourcePath = await writeChangeJson(
        extChangesDir,
        "oversized",
        content,
      );

      const extStore = createMockStore(gitRoot, extChangesDir);
      extStore.paths.external = externalDir;

      // Identity resolution must not receive the non-git external path.
      mocks.getProjectId.mockImplementation(async (dir: string) => {
        if (dir === externalDir) return null;
        return "test-project-id";
      });

      const result = parseResult(
        await changeProjectionQuarantineTools.adv_change_projection_quarantine.execute(
          {
            changeId: "oversized",
            approvedByUser: true,
            approvalEvidence: "operator approved",
          },
          extStore,
        ),
      );

      expect(result.success).toBe(true);
      expect(result.code).toBe("QUARANTINED");
      expect(result.change_id).toBe("oversized");
      expect(mocks.getProjectId).toHaveBeenCalledWith(gitRoot);
      expect(mocks.getProjectId).not.toHaveBeenCalledWith(externalDir);

      // Quarantine and audit land in external state, not in-repo.
      expect((result.quarantine_path as string).startsWith(externalDir)).toBe(
        true,
      );
      const audits = await listChangeProjectionQuarantineAudits(externalDir);
      expect(audits).toHaveLength(1);
      expect(audits[0]?.change_id).toBe("oversized");
      await expect(stat(sourcePath)).rejects.toThrow();
    } finally {
      await cleanupTempDir(gitRoot);
      await cleanupTempDir(externalDir);
    }
  });
});
