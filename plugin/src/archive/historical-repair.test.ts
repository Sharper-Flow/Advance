import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanupTempDir, createTempDir } from "../__tests__/setup";
import { reconcileHistoricalArchiveDeltas } from "./historical-repair";

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
      tasks: [],
      deltas: {
        example: [
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
});
