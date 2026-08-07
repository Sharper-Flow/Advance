import { afterEach, describe, expect, it } from "vitest";
import { mkdir, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { readChangeProjectionState } from "./read-change-projection";

describe("readChangeProjectionState", () => {
  let testDir: string | undefined;

  afterEach(async () => {
    if (testDir) {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  async function makeChangesDir(): Promise<string> {
    testDir = join(
      tmpdir(),
      `read-change-projection-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await mkdir(testDir, { recursive: true });
    return testDir;
  }

  it("reads the canonical per-change projection written by mutation transactions", async () => {
    const changesDir = await makeChangesDir();
    const changeId = "checkpointed-change";
    await mkdir(join(changesDir, changeId), { recursive: true });
    await writeFile(
      join(changesDir, changeId, "change.json"),
      JSON.stringify({ state: { tasks: [{ id: "tk-1", status: "done" }] } }),
    );

    expect(readChangeProjectionState(changesDir, changeId)).toEqual({
      tasks: [{ id: "tk-1", status: "done" }],
    });
  });

  it("retains the legacy flat-file projection fallback", async () => {
    const changesDir = await makeChangesDir();
    await writeFile(
      join(changesDir, "legacy-change.json"),
      JSON.stringify({ state: { tasks: [{ id: "tk-legacy" }] } }),
    );

    expect(readChangeProjectionState(changesDir, "legacy-change")).toEqual({
      tasks: [{ id: "tk-legacy" }],
    });
  });
});
