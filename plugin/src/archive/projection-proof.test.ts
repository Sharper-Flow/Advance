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
  verifyProjectionAtGitCommit,
  verifyProjectionAtPaths,
} from "./projection-proof";

const exec = promisify(execFile);

const dirs: string[] = [];

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
});
