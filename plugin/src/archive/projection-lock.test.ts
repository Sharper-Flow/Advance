import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { cleanupTempDir, createTempDir } from "../__tests__/setup";
import { withArchiveProjectionLock } from "./projection-lock";

const exec = promisify(execFile);
const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map(cleanupTempDir));
});

describe("archive projection lock", () => {
  it("serializes cooperative writers and releases after failure", async () => {
    const root = await createTempDir();
    dirs.push(root);
    await exec("git", ["init", "--initial-branch=main"], { cwd: root });

    let releaseFirst!: () => void;
    const firstMayExit = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let firstEntered = false;
    let secondEntered = false;
    const first = withArchiveProjectionLock(root, async () => {
      firstEntered = true;
      await firstMayExit;
    });
    while (!firstEntered) await new Promise((resolve) => setImmediate(resolve));
    const second = withArchiveProjectionLock(root, async () => {
      secondEntered = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(secondEntered).toBe(false);
    releaseFirst();
    await Promise.all([first, second]);
    expect(secondEntered).toBe(true);

    await expect(
      withArchiveProjectionLock(root, async () => {
        throw new Error("injected failure");
      }),
    ).rejects.toThrow("injected failure");
    await expect(
      withArchiveProjectionLock(root, async () => "reacquired"),
    ).resolves.toBe("reacquired");
  });
});
