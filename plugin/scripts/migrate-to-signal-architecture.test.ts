import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, afterEach } from "vitest";

import { createDefaultGates } from "../src/types";
import { dryRunChange, loadChangeDir } from "./migrate-to-signal-architecture";

const tempDirs: string[] = [];

async function makeFixtureDir(): Promise<string> {
  const dir = join(
    tmpdir(),
    `cleanupzombierunningworkflows-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  tempDirs.push(dir);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "change.json"),
    JSON.stringify(
      {
        id: "cleanupzombierunningworkflows",
        title: "Clean up zombie running workflows",
        status: "active",
        created_at: "2026-05-05T00:00:00.000Z",
        tasks: [
          {
            id: "tk-one",
            title: "Verify cleanup",
            type: "code",
            status: "done",
            priority: 1,
            created_at: "2026-05-05T00:00:00.000Z",
            verification: "migration fixture verified",
          },
        ],
        gates: createDefaultGates(),
        deltas: {},
        wisdom: [],
      },
      null,
      2,
    ),
  );
  await writeFile(join(dir, "proposal.md"), "# Cleanup proposal");
  return dir;
}

describe("migrate-to-signal-architecture script", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("dry-runs the cleanupzombierunningworkflows fixture into a signal replay plan", async () => {
    const loaded = await loadChangeDir(await makeFixtureDir());
    const report = await dryRunChange(loaded);

    expect(report).toMatchObject({
      changeId: "cleanupzombierunningworkflows",
      mode: "dry-run",
      signalSteps: expect.any(Number),
      markerSteps: expect.any(Number),
    });
    expect(report.signalSteps).toBeGreaterThan(0);
    expect(report.markerSteps).toBeGreaterThan(0);
  });
});
