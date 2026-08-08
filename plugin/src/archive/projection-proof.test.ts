import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { cleanupTempDir, createTempDir } from "../__tests__/setup";
import { generateSpecDoc } from "./docs";
import {
  canonicalSha256,
  requirementSha256,
  specSha256,
  type SpecProjectionManifest,
} from "./projection";
import {
  projectionFailureRoutesToReconcile,
  readGitPathBounded,
  verifyProjectionAtGitCommit,
  verifyProjectionAtPaths,
} from "./projection-proof";

const exec = promisify(execFile);

const dirs: string[] = [];

// Shared manifest fixture for the absent/invalid classification tests.
const manifestFixture: SpecProjectionManifest = {
  schema_version: 1,
  change_id: "change-absent",
  delta_set_sha256: "c".repeat(64),
  capabilities: [],
};

async function initGitRepo(root: string): Promise<void> {
  await exec("git", ["init", "--initial-branch=main"], { cwd: root });
  await exec("git", ["config", "user.email", "test@example.com"], {
    cwd: root,
  });
  await exec("git", ["config", "user.name", "Test User"], { cwd: root });
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map(cleanupTempDir));
});

describe("archive projection proof", () => {
  it("proves spec, version, requirements, and generated docs together", async () => {
    const root = await createTempDir();
    dirs.push(root);
    const spec = {
      name: "example",
      title: "Example",
      purpose: "Example capability",
      version: "1.1.0",
      updated_at: "2026-07-20T00:00:00.000Z",
      requirements: [
        {
          id: "rq-example01",
          title: "Example law",
          body: "Proof binds all projections.",
          priority: "must" as const,
        },
      ],
    };
    const doc = generateSpecDoc(spec);
    await mkdir(join(root, ".adv", "specs", "example"), { recursive: true });
    await mkdir(join(root, "docs", "specs"), { recursive: true });
    await writeFile(
      join(root, ".adv", "specs", "example", "spec.json"),
      JSON.stringify(spec),
    );
    await writeFile(join(root, "docs", "specs", "example.md"), doc);

    const manifest: SpecProjectionManifest = {
      schema_version: 1,
      change_id: "change-one",
      delta_set_sha256: "a".repeat(64),
      capabilities: [
        {
          capability: "example",
          base_version: "1.0.0",
          target_version: "1.1.0",
          spec_sha256: specSha256(spec),
          document_sha256: canonicalSha256(doc),
          requirement_sha256: {
            "rq-example01": requirementSha256(spec.requirements[0]),
          },
          dispositions: [
            {
              deltaId: "dl-example",
              operation: "add",
              status: "missing",
            },
          ],
        },
      ],
    };

    const result = await verifyProjectionAtPaths({
      manifest,
      root,
      releasedCommitSha: "b".repeat(40),
      expectedChangeId: "change-one",
      expectedDeltaSetSha256: "a".repeat(64),
      expectedDeltaIdsByCapability: { example: ["dl-example"] },
    });
    expect(result).toMatchObject({
      ok: true,
      receipt: {
        change_id: "change-one",
        released_commit_sha: "b".repeat(40),
        status: "verified",
      },
    });

    await writeFile(
      join(root, "docs", "specs", "example.md"),
      `${await readFile(join(root, "docs", "specs", "example.md"), "utf8")}drift`,
    );
    const drift = await verifyProjectionAtPaths({
      manifest,
      root,
      releasedCommitSha: "b".repeat(40),
      expectedChangeId: "change-one",
      expectedDeltaSetSha256: "a".repeat(64),
      expectedDeltaIdsByCapability: { example: ["dl-example"] },
    });
    expect(drift).toMatchObject({ ok: false, code: "DOCUMENT_MISMATCH" });
  });

  it("rejects a manifest that omits an accepted delta", async () => {
    const root = await createTempDir();
    dirs.push(root);
    const result = await verifyProjectionAtPaths({
      manifest: {
        schema_version: 1,
        change_id: "change-one",
        delta_set_sha256: "a".repeat(64),
        capabilities: [],
      },
      root,
      releasedCommitSha: "b".repeat(40),
      expectedChangeId: "change-one",
      expectedDeltaSetSha256: "a".repeat(64),
      expectedDeltaIdsByCapability: { example: ["dl-example"] },
    });
    expect(result).toMatchObject({ ok: false, code: "MANIFEST_MISMATCH" });
  });

  it("rejects external archive evidence that differs from the released manifest", async () => {
    const root = await createTempDir();
    dirs.push(root);
    const spec = {
      name: "example",
      title: "Example",
      purpose: "Example capability",
      version: "1.1.0",
      updated_at: "2026-07-20T00:00:00.000Z",
      requirements: [
        {
          id: "rq-example01",
          title: "Example law",
          body: "Released manifest owns proof.",
          priority: "must" as const,
        },
      ],
    };
    const doc = generateSpecDoc(spec);
    const manifest: SpecProjectionManifest = {
      schema_version: 1,
      change_id: "change-one",
      delta_set_sha256: "a".repeat(64),
      capabilities: [
        {
          capability: "example",
          base_version: "1.0.0",
          target_version: "1.1.0",
          spec_sha256: specSha256(spec),
          document_sha256: canonicalSha256(doc),
          requirement_sha256: {
            "rq-example01": requirementSha256(spec.requirements[0]),
          },
          dispositions: [
            {
              deltaId: "dl-example",
              operation: "add",
              status: "missing",
            },
          ],
        },
      ],
    };
    await mkdir(join(root, ".adv", "specs", "example"), { recursive: true });
    await mkdir(join(root, ".adv", "archive", "bundle"), { recursive: true });
    await mkdir(join(root, "docs", "specs"), { recursive: true });
    await writeFile(
      join(root, ".adv", "specs", "example", "spec.json"),
      JSON.stringify(spec),
    );
    await writeFile(join(root, "docs", "specs", "example.md"), doc);
    await writeFile(
      join(root, ".adv", "archive", "bundle", "spec-projection.json"),
      JSON.stringify(manifest),
    );
    await exec("git", ["init", "--initial-branch=main"], { cwd: root });
    await exec("git", ["config", "user.email", "test@example.com"], {
      cwd: root,
    });
    await exec("git", ["config", "user.name", "Test User"], { cwd: root });
    await exec("git", ["add", "."], { cwd: root });
    await exec("git", ["commit", "-m", "released projection"], { cwd: root });
    const releasedCommitSha = (
      await exec("git", ["rev-parse", "HEAD"], { cwd: root })
    ).stdout.trim();

    const tampered: SpecProjectionManifest = {
      ...manifest,
      capabilities: manifest.capabilities.map((capability) => ({
        ...capability,
        target_version: "1.2.0",
      })),
    };
    const result = await verifyProjectionAtGitCommit({
      manifest: tampered,
      repo: root,
      releasedCommitSha,
      manifestGitPath: ".adv/archive/bundle/spec-projection.json",
      expectedChangeId: "change-one",
      expectedDeltaSetSha256: "a".repeat(64),
      expectedDeltaIdsByCapability: { example: ["dl-example"] },
    });
    expect(result).toMatchObject({ ok: false, code: "MANIFEST_MISMATCH" });
  });

  it("streams git show and rejects output exceeding the byte limit", async () => {
    const root = await createTempDir();
    dirs.push(root);
    await exec("git", ["init", "--initial-branch=main"], { cwd: root });
    await exec("git", ["config", "user.email", "test@example.com"], {
      cwd: root,
    });
    await exec("git", ["config", "user.name", "Test User"], { cwd: root });
    await writeFile(join(root, "big.txt"), "x".repeat(1000));
    await exec("git", ["add", "."], { cwd: root });
    await exec("git", ["commit", "-m", "add big"], { cwd: root });
    const sha = (
      await exec("git", ["rev-parse", "HEAD"], { cwd: root })
    ).stdout.trim();

    await expect(readGitPathBounded(root, sha, "big.txt", 500)).rejects.toThrow(
      "exceeds bounded projection limit",
    );
  });

  it("returns small git show output within the limit", async () => {
    const root = await createTempDir();
    dirs.push(root);
    await exec("git", ["init", "--initial-branch=main"], { cwd: root });
    await exec("git", ["config", "user.email", "test@example.com"], {
      cwd: root,
    });
    await exec("git", ["config", "user.name", "Test User"], { cwd: root });
    await writeFile(join(root, "small.txt"), "hello");
    await exec("git", ["add", "."], { cwd: root });
    await exec("git", ["commit", "-m", "add small"], { cwd: root });
    const sha = (
      await exec("git", ["rev-parse", "HEAD"], { cwd: root })
    ).stdout.trim();

    await expect(readGitPathBounded(root, sha, "small.txt", 500)).resolves.toBe(
      "hello",
    );
  });

  // Shared manifest fixture and initGitRepo are hoisted to module scope.

  it("classifies a missing in-repo manifest as MANIFEST_ABSENT, not corruption", async () => {
    const root = await createTempDir();
    dirs.push(root);
    await initGitRepo(root);
    // Commit an unrelated file — the manifest path is never committed.
    await mkdir(join(root, ".adv", "archive", "bundle"), { recursive: true });
    await writeFile(join(root, ".adv", "archive", "bundle", "README"), "none");
    await exec("git", ["add", "."], { cwd: root });
    await exec("git", ["commit", "-m", "no manifest"], { cwd: root });
    const releasedCommitSha = (
      await exec("git", ["rev-parse", "HEAD"], { cwd: root })
    ).stdout.trim();

    const result = await verifyProjectionAtGitCommit({
      manifest: manifestFixture,
      repo: root,
      releasedCommitSha,
      manifestGitPath: ".adv/archive/bundle/spec-projection.json",
      expectedChangeId: "change-absent",
      expectedDeltaSetSha256: "c".repeat(64),
      expectedDeltaIdsByCapability: {},
    });
    expect(result).toMatchObject({ ok: false, code: "MANIFEST_ABSENT" });
  });

  it("classifies a corrupt-but-present manifest as MANIFEST_INVALID", async () => {
    const root = await createTempDir();
    dirs.push(root);
    await initGitRepo(root);
    await mkdir(join(root, ".adv", "archive", "bundle"), { recursive: true });
    await writeFile(
      join(root, ".adv", "archive", "bundle", "spec-projection.json"),
      "{not valid json",
    );
    await exec("git", ["add", "."], { cwd: root });
    await exec("git", ["commit", "-m", "corrupt manifest"], { cwd: root });
    const releasedCommitSha = (
      await exec("git", ["rev-parse", "HEAD"], { cwd: root })
    ).stdout.trim();

    const result = await verifyProjectionAtGitCommit({
      manifest: manifestFixture,
      repo: root,
      releasedCommitSha,
      manifestGitPath: ".adv/archive/bundle/spec-projection.json",
      expectedChangeId: "change-absent",
      expectedDeltaSetSha256: "c".repeat(64),
      expectedDeltaIdsByCapability: {},
    });
    expect(result).toMatchObject({ ok: false, code: "MANIFEST_INVALID" });
  });

  it("classifies an unresolvable released commit as REPO_ERROR, not absence", async () => {
    const root = await createTempDir();
    dirs.push(root);
    await initGitRepo(root);
    await writeFile(join(root, "placeholder"), "x");
    await exec("git", ["add", "."], { cwd: root });
    await exec("git", ["commit", "-m", "init"], { cwd: root });

    const result = await verifyProjectionAtGitCommit({
      manifest: manifestFixture,
      repo: root,
      releasedCommitSha: "0".repeat(40),
      manifestGitPath: ".adv/archive/bundle/spec-projection.json",
      expectedChangeId: "change-absent",
      expectedDeltaSetSha256: "c".repeat(64),
      expectedDeltaIdsByCapability: {},
    });
    expect(result).toMatchObject({ ok: false, code: "REPO_ERROR" });
  });
});

describe("projectionFailureRoutesToReconcile", () => {
  it("routes MANIFEST_ABSENT to reconcile (unstarted work)", () => {
    expect(projectionFailureRoutesToReconcile("MANIFEST_ABSENT")).toBe(true);
  });

  it("refuses MANIFEST_INVALID (corrupt manifest)", () => {
    expect(projectionFailureRoutesToReconcile("MANIFEST_INVALID")).toBe(false);
  });

  it("refuses MANIFEST_MISMATCH (content drift)", () => {
    expect(projectionFailureRoutesToReconcile("MANIFEST_MISMATCH")).toBe(false);
  });

  it("refuses REPO_ERROR (repository failure)", () => {
    expect(projectionFailureRoutesToReconcile("REPO_ERROR")).toBe(false);
  });

  it("refuses spec/doc/version drift codes", () => {
    expect(projectionFailureRoutesToReconcile("SPEC_UNREADABLE")).toBe(false);
    expect(projectionFailureRoutesToReconcile("SPEC_MISMATCH")).toBe(false);
    expect(projectionFailureRoutesToReconcile("VERSION_MISMATCH")).toBe(false);
    expect(projectionFailureRoutesToReconcile("REQUIREMENT_MISMATCH")).toBe(
      false,
    );
    expect(projectionFailureRoutesToReconcile("DOCUMENT_UNREADABLE")).toBe(
      false,
    );
    expect(projectionFailureRoutesToReconcile("DOCUMENT_MISMATCH")).toBe(false);
  });
});

describe("AC1 composition: verifyProjectionAtGitCommit + projectionFailureRoutesToReconcile", () => {
  // These tests chain the two functions the handler uses in sequence:
  // 1. verifyProjectionAtGitCommit classifies the git state
  // 2. projectionFailureRoutesToReconcile decides reconcile vs refuse
  // The handler's retry branch (handlers-archive.ts:326) uses exactly this
  // composition: proof = verifyProjectionAtGitCommit(...); if (!proof.ok)
  // { if (projectionFailureRoutesToReconcile(proof.code)) reconcile; else refuse; }

  it("absent in-repo projection → MANIFEST_ABSENT → routes to reconcile (AC1)", async () => {
    const root = await createTempDir();
    dirs.push(root);
    await initGitRepo(root);
    await mkdir(join(root, ".adv", "archive", "bundle"), { recursive: true });
    await writeFile(join(root, ".adv", "archive", "bundle", "README"), "none");
    await exec("git", ["add", "."], { cwd: root });
    await exec("git", ["commit", "-m", "no manifest"], { cwd: root });
    const releasedCommitSha = (
      await exec("git", ["rev-parse", "HEAD"], { cwd: root })
    ).stdout.trim();

    const proof = await verifyProjectionAtGitCommit({
      manifest: manifestFixture,
      repo: root,
      releasedCommitSha,
      manifestGitPath: ".adv/archive/bundle/spec-projection.json",
      expectedChangeId: "change-absent",
      expectedDeltaSetSha256: "c".repeat(64),
      expectedDeltaIdsByCapability: {},
    });
    // The handler would set projectionNeedsReconcile=true and fall through.
    expect(proof.ok).toBe(false);
    if (!proof.ok) {
      expect(projectionFailureRoutesToReconcile(proof.code)).toBe(true);
    }
  });

  it("corrupt in-repo manifest → MANIFEST_INVALID → routes to refuse (AC2)", async () => {
    const root = await createTempDir();
    dirs.push(root);
    await initGitRepo(root);
    await mkdir(join(root, ".adv", "archive", "bundle"), { recursive: true });
    await writeFile(
      join(root, ".adv", "archive", "bundle", "spec-projection.json"),
      "{corrupt",
    );
    await exec("git", ["add", "."], { cwd: root });
    await exec("git", ["commit", "-m", "corrupt"], { cwd: root });
    const releasedCommitSha = (
      await exec("git", ["rev-parse", "HEAD"], { cwd: root })
    ).stdout.trim();

    const proof = await verifyProjectionAtGitCommit({
      manifest: manifestFixture,
      repo: root,
      releasedCommitSha,
      manifestGitPath: ".adv/archive/bundle/spec-projection.json",
      expectedChangeId: "change-absent",
      expectedDeltaSetSha256: "c".repeat(64),
      expectedDeltaIdsByCapability: {},
    });
    // The handler would return a hard refusal.
    expect(proof.ok).toBe(false);
    if (!proof.ok) {
      expect(projectionFailureRoutesToReconcile(proof.code)).toBe(false);
    }
  });

  it("bad revision → REPO_ERROR → routes to refuse (fail closed)", async () => {
    const root = await createTempDir();
    dirs.push(root);
    await initGitRepo(root);
    await writeFile(join(root, "placeholder"), "x");
    await exec("git", ["add", "."], { cwd: root });
    await exec("git", ["commit", "-m", "init"], { cwd: root });

    const proof = await verifyProjectionAtGitCommit({
      manifest: manifestFixture,
      repo: root,
      releasedCommitSha: "0".repeat(40),
      manifestGitPath: ".adv/archive/bundle/spec-projection.json",
      expectedChangeId: "change-absent",
      expectedDeltaSetSha256: "c".repeat(64),
      expectedDeltaIdsByCapability: {},
    });
    expect(proof.ok).toBe(false);
    if (!proof.ok) {
      expect(projectionFailureRoutesToReconcile(proof.code)).toBe(false);
    }
  });
});
