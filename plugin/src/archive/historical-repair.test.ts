import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanupTempDir, createTempDir } from "../__tests__/setup";
import { reconcileHistoricalArchiveDeltas } from "./historical-repair";
import { requirementSha256 } from "./projection";
import type { Delta, Requirement } from "../types";

const exec = promisify(execFile);
const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map(cleanupTempDir));
});

async function initRepairWorktree(root: string): Promise<void> {
  await exec("git", ["init", "--initial-branch=main"], { cwd: root });
  await exec("git", ["config", "user.email", "test@example.com"], {
    cwd: root,
  });
  await exec("git", ["config", "user.name", "Test User"], { cwd: root });
  await mkdir(join(root, ".adv", "specs", "example"), { recursive: true });
  await writeFile(
    join(root, ".adv", "specs", "example", "spec.json"),
    JSON.stringify({
      name: "example",
      title: "Example",
      purpose: "Example capability",
      version: "1.0.0",
      updated_at: "2026-01-01T00:00:00.000Z",
      requirements: [],
    }),
  );
  await exec("git", ["add", "."], { cwd: root });
  await exec("git", ["commit", "-m", "seed"], { cwd: root });
  await exec("git", ["checkout", "-b", "change/repair"], { cwd: root });
}

async function writeBundle(
  archiveDir: string,
  name: string,
  changeId: string,
  body: string,
  deltas?: Delta[],
): Promise<void> {
  const bundle = join(archiveDir, name);
  await mkdir(bundle, { recursive: true });
  await writeFile(
    join(bundle, "change.json"),
    JSON.stringify({
      id: changeId,
      title: changeId,
      status: "archived",
      created_at: "2026-01-01T00:00:00.000Z",
      tasks: [{ metadata: { contract_refs: { legacy: true } } }],
      deltas: {
        example: deltas ?? [
          {
            id: `dl-${changeId}`,
            operation: "add",
            requirement: {
              id: "rq-example01",
              title: "Example law",
              body,
              priority: "must",
            },
          },
        ],
      },
    }),
  );
}

describe("historical archive delta reconciliation", () => {
  it("dry-runs then applies safe cumulative state without overwriting conflict", async () => {
    const root = await createTempDir();
    dirs.push(root);
    const archiveDir = join(root, "external-archive");
    await initRepairWorktree(root);
    await writeBundle(
      archiveDir,
      "2026-01-01-safe-change",
      "safe-change",
      "Expected body",
    );
    await writeBundle(
      archiveDir,
      "2026-01-02-conflict-change",
      "conflict-change",
      "Conflicting body",
    );
    await writeFile(join(archiveDir, "summary.md"), "Not an archive bundle");

    const dryRun = await reconcileHistoricalArchiveDeltas({
      archiveDir,
      repairWorktree: root,
      dryRun: true,
    });
    expect(dryRun.rows.map((row) => row.disposition)).toEqual([
      "repaired",
      "conflict",
    ]);
    expect(
      JSON.parse(
        await readFile(
          join(root, ".adv", "specs", "example", "spec.json"),
          "utf8",
        ),
      ).requirements,
    ).toEqual([]);

    const applied = await reconcileHistoricalArchiveDeltas({
      archiveDir,
      repairWorktree: root,
      dryRun: false,
      expectedSeedHeadSha: dryRun.seedHeadSha,
      expectedSeedProjectionSha256: dryRun.seedProjectionSha256,
    });
    expect(applied.rows.map((row) => row.disposition)).toEqual([
      "repaired",
      "conflict",
    ]);
    const spec = JSON.parse(
      await readFile(
        join(root, ".adv", "specs", "example", "spec.json"),
        "utf8",
      ),
    );
    expect(spec.requirements).toHaveLength(1);
    expect(spec.requirements[0].body).toBe("Expected body");
    expect(spec.version).toBe("1.1.0");
    expect(
      await readFile(join(root, "docs", "specs", "example.md"), "utf8"),
    ).toContain("Expected body");
  });

  it("preserves an exact conflicting add and repairs safe siblings", async () => {
    const root = await createTempDir();
    dirs.push(root);
    const archiveDir = join(root, "external-archive");
    await initRepairWorktree(root);
    const current: Requirement = {
      id: "rq-example01",
      title: "Current law",
      body: "Current shipped body",
      priority: "must",
    };
    const rejected: Requirement = {
      id: "rq-example01",
      title: "Archived law",
      body: "Rejected archived body",
      priority: "must",
    };
    const specPath = join(root, ".adv", "specs", "example", "spec.json");
    const seedSpec = JSON.parse(await readFile(specPath, "utf8"));
    seedSpec.requirements = [current];
    await writeFile(specPath, JSON.stringify(seedSpec));
    await exec("git", ["add", "."], { cwd: root });
    await exec("git", ["commit", "-m", "seed current law"], { cwd: root });
    await writeBundle(archiveDir, "2026-01-01-parent", "parent", "unused", [
      {
        id: "dl-conflict",
        operation: "add",
        requirement: rejected,
      },
      {
        id: "dl-safe",
        operation: "add",
        requirement: {
          id: "rq-example02",
          title: "Safe law",
          body: "Safe sibling body",
          priority: "must",
        },
      },
    ]);

    const initial = await reconcileHistoricalArchiveDeltas({
      archiveDir,
      repairWorktree: root,
      dryRun: true,
    });
    expect(initial.rows[0]).toMatchObject({
      disposition: "conflict",
      conflictBindings: [
        {
          changeId: "parent",
          deltaId: "dl-conflict",
          operation: "add",
          currentRequirementSha256: requirementSha256(current),
          rejectedPostimageSha256: requirementSha256(rejected),
        },
      ],
    });

    const disposition = {
      changeId: "parent",
      deltaId: "dl-conflict",
      resolution: "preserve_current" as const,
      currentRequirementSha256: requirementSha256(current),
      rejectedPostimageSha256: requirementSha256(rejected),
      evidence: "User approved preserving shipped current law",
    };
    const preview = await reconcileHistoricalArchiveDeltas({
      archiveDir,
      repairWorktree: root,
      dryRun: true,
      conflictDispositions: [disposition],
    });
    expect(preview.rows[0]).toMatchObject({
      disposition: "repaired",
      appliedConflictDispositions: [disposition],
    });

    await expect(
      reconcileHistoricalArchiveDeltas({
        archiveDir,
        repairWorktree: root,
        dryRun: false,
        expectedSeedHeadSha: "0".repeat(40),
        expectedSeedProjectionSha256: preview.seedProjectionSha256,
        conflictDispositions: [disposition],
      }),
    ).rejects.toThrow("seed changed after dry-run");
    await expect(
      reconcileHistoricalArchiveDeltas({
        archiveDir,
        repairWorktree: root,
        dryRun: true,
        conflictDispositions: [
          { ...disposition, currentRequirementSha256: "0".repeat(64) },
        ],
      }),
    ).rejects.toThrow("did not bind an exact conflicting add");
    await expect(
      reconcileHistoricalArchiveDeltas({
        archiveDir,
        repairWorktree: root,
        dryRun: true,
        conflictDispositions: [disposition, { ...disposition }],
      }),
    ).rejects.toThrow("duplicate conflict disposition");
    expect(JSON.parse(await readFile(specPath, "utf8")).requirements).toEqual([
      current,
    ]);

    await reconcileHistoricalArchiveDeltas({
      archiveDir,
      repairWorktree: root,
      dryRun: false,
      expectedSeedHeadSha: preview.seedHeadSha,
      expectedSeedProjectionSha256: preview.seedProjectionSha256,
      conflictDispositions: [disposition],
    });
    const persisted = JSON.parse(await readFile(specPath, "utf8"));
    expect(persisted.requirements).toHaveLength(2);
    expect(persisted.requirements[0]).toEqual(current);
    expect(persisted.requirements[1].id).toBe("rq-example02");
  });

  it("rejects preserve-current disposition for non-add operations", async () => {
    const root = await createTempDir();
    dirs.push(root);
    const archiveDir = join(root, "external-archive");
    await initRepairWorktree(root);
    const specPath = join(root, ".adv", "specs", "example", "spec.json");
    const seedSpec = JSON.parse(await readFile(specPath, "utf8"));
    seedSpec.requirements = [
      {
        id: "rq-example01",
        title: "Current law",
        body: "Current body",
        priority: "must",
      },
    ];
    await writeFile(specPath, JSON.stringify(seedSpec));
    await exec("git", ["add", "."], { cwd: root });
    await exec("git", ["commit", "-m", "seed removable law"], { cwd: root });
    await writeBundle(
      archiveDir,
      "2026-01-01-remove",
      "remove-parent",
      "unused",
      [{ id: "dl-remove", operation: "remove", target_id: "rq-example01" }],
    );

    await expect(
      reconcileHistoricalArchiveDeltas({
        archiveDir,
        repairWorktree: root,
        dryRun: true,
        conflictDispositions: [
          {
            changeId: "remove-parent",
            deltaId: "dl-remove",
            resolution: "preserve_current",
            currentRequirementSha256: "a".repeat(64),
            rejectedPostimageSha256: "b".repeat(64),
            evidence: "unsupported operation probe",
          },
        ],
      }),
    ).rejects.toThrow("did not bind an exact conflicting add");
  });
});
