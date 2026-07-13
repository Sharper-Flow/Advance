/**
 * Typed project-identity resolution guard tests (rq-projectIdentityStability01).
 *
 * A shallow clone's `rev-list --max-parents=0 HEAD` returns the moving
 * shallow graft boundary, not the true root. These tests pin the typed
 * guard: shallow/grafted repos refuse identity minting with actionable
 * guidance; full clones, partial clones, and multi-root repos resolve
 * exactly as before.
 */

import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { resolveProjectIdentity, UnstableIdentityError } from "./project-id";

const run = promisify(execFile);

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await run("git", args, { cwd });
  return stdout.trim();
}

let base: string;
let originDir: string;
let fullClone: string;
let shallowClone: string;
let partialClone: string;
let multiRootRepo: string;
let trueRoot: string;

beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), "adv-identity-guard-"));

  // Origin with 3 commits so --depth 1 grafts a non-root boundary.
  originDir = join(base, "origin");
  await run("git", ["init", "-b", "main", originDir]);
  await git(originDir, "config", "user.email", "t@t");
  await git(originDir, "config", "user.name", "t");
  await git(originDir, "config", "uploadpack.allowFilter", "true");
  for (const n of [1, 2, 3]) {
    await writeFile(join(originDir, `f${n}.txt`), `${n}\n`);
    await git(originDir, "add", ".");
    await git(originDir, "commit", "-m", `c${n}`);
  }
  trueRoot = (await git(originDir, "rev-list", "--max-parents=0", "HEAD"))
    .split("\n")[0]!
    .trim();

  fullClone = join(base, "full");
  await run("git", ["clone", `file://${originDir}`, fullClone]);

  shallowClone = join(base, "shallow");
  await run("git", [
    "clone",
    "--depth",
    "1",
    `file://${originDir}`,
    shallowClone,
  ]);

  partialClone = join(base, "partial");
  await run("git", [
    "clone",
    "--filter=blob:none",
    `file://${originDir}`,
    partialClone,
  ]);

  // Multi-root: full clone plus an orphan branch merged in.
  multiRootRepo = join(base, "multiroot");
  await run("git", ["clone", `file://${originDir}`, multiRootRepo]);
  await git(multiRootRepo, "config", "user.email", "t@t");
  await git(multiRootRepo, "config", "user.name", "t");
  await git(multiRootRepo, "checkout", "--orphan", "second-root");
  await writeFile(join(multiRootRepo, "other.txt"), "x\n");
  await git(multiRootRepo, "add", ".");
  await git(multiRootRepo, "commit", "-m", "second root");
  await git(multiRootRepo, "checkout", "main");
  await git(
    multiRootRepo,
    "merge",
    "--allow-unrelated-histories",
    "-m",
    "merge roots",
    "second-root",
  );
}, 60_000);

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

describe("resolveProjectIdentity", () => {
  test("full clone resolves ok with the true root commit", async () => {
    const res = await resolveProjectIdentity(fullClone);
    expect(res).toEqual({ kind: "ok", projectId: trueRoot });
  });

  test("shallow clone refuses with unshallow guidance and mints nothing", async () => {
    const res = await resolveProjectIdentity(shallowClone);
    expect(res.kind).toBe("unstable");
    if (res.kind !== "unstable") return;
    expect(res.reason).toBe("shallow");
    expect(res.guidance).toContain("git fetch --unshallow");
    expect(res.guidance).toContain(shallowClone);
  });

  test("partial clone (--filter=blob:none) resolves the true root (no false trip)", async () => {
    const res = await resolveProjectIdentity(partialClone);
    expect(res).toEqual({ kind: "ok", projectId: trueRoot });
  });

  test("multi-root repo resolves deterministically to first sorted root", async () => {
    const res = await resolveProjectIdentity(multiRootRepo);
    expect(res.kind).toBe("ok");
    if (res.kind !== "ok") return;
    const roots = (
      await git(multiRootRepo, "rev-list", "--max-parents=0", "HEAD")
    )
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    expect(res.projectId).toBe(roots[0]);
  });

  test("non-git directory resolves not_git (legacy fallback preserved)", async () => {
    const res = await resolveProjectIdentity(base);
    expect(res).toEqual({ kind: "not_git" });
  });

  test("grafted repo (info/grafts) refuses as unstable", async () => {
    const graftRepo = join(base, "grafted");
    await run("git", ["clone", `file://${originDir}`, graftRepo]);
    const gitDir = await git(graftRepo, "rev-parse", "--absolute-git-dir");
    await run("mkdir", ["-p", join(gitDir, "info")]);
    const head = await git(graftRepo, "rev-parse", "HEAD");
    await writeFile(join(gitDir, "info", "grafts"), `${head}\n`);
    const res = await resolveProjectIdentity(graftRepo);
    expect(res.kind).toBe("unstable");
    if (res.kind !== "unstable") return;
    expect(res.reason).toBe("graft");
  });
});

describe("UnstableIdentityError", () => {
  test("carries repo path, reason, and remediation command (DDC1)", () => {
    const err = new UnstableIdentityError("/repo/x", "shallow");
    expect(err.repoPath).toBe("/repo/x");
    expect(err.reason).toBe("shallow");
    expect(err.message).toContain("/repo/x");
    expect(err.message).toContain("git fetch --unshallow");
    expect(err.name).toBe("UnstableIdentityError");
  });
});
