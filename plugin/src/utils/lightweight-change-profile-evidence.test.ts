/**
 * Lightweight Change Profile — host-side evidence collection tests.
 *
 * Uses real git repositories in temp directories to exercise the complete
 * baseline-to-current range, rename/delete/untracked detection, fingerprint
 * sensitivity, dependency/spec-law detection, and public-root reachability.
 */
import { execSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTempDir, cleanupTempDir } from "../__tests__/setup";
import { getProjectPaths } from "../storage/json";
import {
  collectLightweightProfileEvidence,
  type CollectLightweightProfileEvidenceInput,
  type PublicRootPolicy,
} from "./lightweight-change-profile-evidence";
import { evaluateLightweightProfile } from "../types/lightweight-change-profile";

const TIMESTAMP = "2026-07-16T18:00:00.000Z";
const PROJECT_ID = "bdf259aa162ae192af5b18899ccdc653b085528d";

function git(workdir: string, args: string): string {
  return execSync(`git ${args}`, { cwd: workdir, encoding: "utf-8" });
}

async function createGitRepo(workdir: string): Promise<void> {
  await mkdir(workdir, { recursive: true });
  git(workdir, "init -q");
  git(workdir, "config user.email 'test@example.com'");
  git(workdir, "config user.name 'Test User'");
}

async function writeChangeJson(
  changesDir: string,
  changeId: string,
  change: object,
): Promise<void> {
  const dir = join(changesDir, changeId);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "change.json"), JSON.stringify(change, null, 2));
}

function makeInput(
  workdir: string,
  changesDir: string,
  overrides: Partial<CollectLightweightProfileEvidenceInput> = {},
): CollectLightweightProfileEvidenceInput {
  return {
    workdir,
    projectId: PROJECT_ID,
    changeId: "lightweight-change",
    baselineRevision: "HEAD~1",
    projectPaths: {
      ...getProjectPaths(workdir, undefined, { externalRoot: changesDir }),
      changes: changesDir,
    },
    ...overrides,
  };
}

describe("collectLightweightProfileEvidence", () => {
  let tempDir: string;
  let workdir: string;
  let changesDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("lwp-evidence-");
    workdir = join(tempDir, "repo");
    changesDir = join(tempDir, "changes");
    await createGitRepo(workdir);
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it("collects multi-commit baseline-to-current range", async () => {
    await writeFile(join(workdir, "a.ts"), "export const a = 1;");
    await writeFile(join(workdir, "b.ts"), "export const b = 2;");
    git(workdir, "add .");
    git(workdir, "commit -q -m 'initial'");

    await writeFile(join(workdir, "c.ts"), "export const c = 3;");
    git(workdir, "add c.ts");
    git(workdir, "commit -q -m 'second'");

    await writeFile(join(workdir, "d.ts"), "export const d = 4;");
    git(workdir, "add d.ts");
    git(workdir, "commit -q -m 'third'");

    await writeChangeJson(changesDir, "lightweight-change", {
      id: "lightweight-change",
      title: "Lightweight change",
      status: "draft",
      created_at: TIMESTAMP,
      tasks: [
        {
          id: "tk-1",
          title: "Implement",
          type: "code",
          status: "pending",
          created_at: TIMESTAMP,
        },
      ],
      deltas: {},
    });

    const { snapshot } = await collectLightweightProfileEvidence(
      makeInput(workdir, changesDir, { baselineRevision: "HEAD~2" }),
    );

    expect(snapshot.changedPaths.paths).toContain("c.ts");
    expect(snapshot.changedPaths.paths).toContain("d.ts");
    expect(snapshot.changedPaths.paths).not.toContain("a.ts");
    expect(snapshot.changedPaths.paths).not.toContain("b.ts");
    expect(snapshot.changedPaths.count).toBe(2);
    expect(snapshot.observedRevision).toMatch(/^[0-9a-f]{40}$/);
  });

  it("counts renames toward changed-file threshold", async () => {
    await writeFile(join(workdir, "old.ts"), "export const old = 1;");
    git(workdir, "add .");
    git(workdir, "commit -q -m 'initial'");

    git(workdir, "mv old.ts new.ts");
    git(workdir, "commit -q -m 'rename'");

    await writeChangeJson(changesDir, "lightweight-change", {
      id: "lightweight-change",
      title: "Lightweight change",
      status: "draft",
      created_at: TIMESTAMP,
      tasks: [],
      deltas: {},
    });

    const { snapshot } = await collectLightweightProfileEvidence(
      makeInput(workdir, changesDir),
    );

    expect(snapshot.changedPaths.renames).toBeGreaterThanOrEqual(1);
    expect(snapshot.changedPaths.paths).toContain("new.ts");
    expect(snapshot.changedPaths.deletions).toBe(0);
  });

  it("counts deletes toward changed-file threshold", async () => {
    await writeFile(join(workdir, "gone.ts"), "export const gone = 1;");
    git(workdir, "add .");
    git(workdir, "commit -q -m 'initial'");

    git(workdir, "rm gone.ts");
    git(workdir, "commit -q -m 'delete'");

    await writeChangeJson(changesDir, "lightweight-change", {
      id: "lightweight-change",
      title: "Lightweight change",
      status: "draft",
      created_at: TIMESTAMP,
      tasks: [],
      deltas: {},
    });

    const { snapshot } = await collectLightweightProfileEvidence(
      makeInput(workdir, changesDir),
    );

    expect(snapshot.changedPaths.deletions).toBe(1);
    expect(snapshot.changedPaths.paths).toContain("gone.ts");
  });

  it("detects untracked working-tree paths", async () => {
    await writeFile(join(workdir, "base.ts"), "export const base = 1;");
    git(workdir, "add .");
    git(workdir, "commit -q -m 'initial'");

    await writeFile(join(workdir, "untracked.ts"), "export const u = 1;");

    await writeChangeJson(changesDir, "lightweight-change", {
      id: "lightweight-change",
      title: "Lightweight change",
      status: "draft",
      created_at: TIMESTAMP,
      tasks: [],
      deltas: {},
    });

    const { snapshot } = await collectLightweightProfileEvidence(
      makeInput(workdir, changesDir),
    );

    expect(snapshot.changedPaths.untrackedCount).toBe(1);
    expect(snapshot.changedPaths.paths).toContain("untracked.ts");
  });

  it("produces a content-sensitive fingerprint that changes with content", async () => {
    await writeFile(join(workdir, "x.ts"), "export const x = 1;");
    git(workdir, "add .");
    git(workdir, "commit -q -m 'initial'");

    await writeFile(join(workdir, "x.ts"), "export const x = 2;");
    git(workdir, "add x.ts");
    git(workdir, "commit -q -m 'edit'");

    await writeChangeJson(changesDir, "lightweight-change", {
      id: "lightweight-change",
      title: "Lightweight change",
      status: "draft",
      created_at: TIMESTAMP,
      tasks: [],
      deltas: {},
    });

    const first = await collectLightweightProfileEvidence(
      makeInput(workdir, changesDir),
    );

    await writeFile(join(workdir, "x.ts"), "export const x = 3;");

    const second = await collectLightweightProfileEvidence(
      makeInput(workdir, changesDir),
    );

    expect(first.snapshot.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(second.snapshot.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(first.snapshot.fingerprint).not.toBe(second.snapshot.fingerprint);
  });

  it("detects dependency manifest/lockfile changes", async () => {
    await writeFile(join(workdir, "package.json"), "{}");
    git(workdir, "add .");
    git(workdir, "commit -q -m 'initial'");

    await writeFile(join(workdir, "pnpm-lock.yaml"), "lockfile: v1");
    git(workdir, "add pnpm-lock.yaml");
    git(workdir, "commit -q -m 'lock'");

    await writeChangeJson(changesDir, "lightweight-change", {
      id: "lightweight-change",
      title: "Lightweight change",
      status: "draft",
      created_at: TIMESTAMP,
      tasks: [],
      deltas: {},
    });

    const { snapshot } = await collectLightweightProfileEvidence(
      makeInput(workdir, changesDir),
    );

    expect(snapshot.dependencyChange.hasDependencyChange).toBe(true);
    expect(snapshot.dependencyChange.manifests).toContain("pnpm-lock.yaml");
  });

  it("detects spec-law path changes", async () => {
    await mkdir(join(workdir, ".adv/specs/test-cap"), { recursive: true });
    await writeFile(
      join(workdir, ".adv/specs/test-cap/spec.json"),
      JSON.stringify({ name: "test-cap" }),
    );
    git(workdir, "add .");
    git(workdir, "commit -q -m 'initial'");

    await writeFile(
      join(workdir, ".adv/specs/test-cap/spec.json"),
      JSON.stringify({ name: "test-cap", version: "2" }),
    );
    git(workdir, "add .");
    git(workdir, "commit -q -m 'spec change'");

    await writeChangeJson(changesDir, "lightweight-change", {
      id: "lightweight-change",
      title: "Lightweight change",
      status: "draft",
      created_at: TIMESTAMP,
      tasks: [],
      deltas: {},
    });

    const { snapshot } = await collectLightweightProfileEvidence(
      makeInput(workdir, changesDir),
    );

    expect(snapshot.specDelta.hasDelta).toBe(true);
    expect(snapshot.specDelta.capabilities).toContain("test-cap");
  });

  it("reports policy_absent when no API compatibility policy is given", async () => {
    await writeFile(join(workdir, "internal.ts"), "export const i = 1;");
    git(workdir, "add .");
    git(workdir, "commit -q -m 'initial'");

    await writeFile(join(workdir, "internal.ts"), "export const i = 2;");
    git(workdir, "add internal.ts");
    git(workdir, "commit -q -m 'edit'");

    await writeChangeJson(changesDir, "lightweight-change", {
      id: "lightweight-change",
      title: "Lightweight change",
      status: "draft",
      created_at: TIMESTAMP,
      tasks: [],
      deltas: {},
    });

    const { snapshot } = await collectLightweightProfileEvidence(
      makeInput(workdir, changesDir),
    );

    expect(snapshot.apiCompatibility.publicSurface).toBe("policy_absent");
  });

  it("proves private when changed paths are not reachable from public roots", async () => {
    await mkdir(join(workdir, "src"), { recursive: true });
    await writeFile(
      join(workdir, "src/index.ts"),
      "export { publicFn } from './public';",
    );
    await writeFile(
      join(workdir, "src/public.ts"),
      "export function publicFn() {}",
    );
    await writeFile(
      join(workdir, "src/internal.ts"),
      "export function internalFn() {}",
    );
    git(workdir, "add .");
    git(workdir, "commit -q -m 'initial'");

    await writeFile(
      join(workdir, "src/internal.ts"),
      "export function internalFn() { return 2; }",
    );
    git(workdir, "add src/internal.ts");
    git(workdir, "commit -q -m 'edit internal'");

    await writeChangeJson(changesDir, "lightweight-change", {
      id: "lightweight-change",
      title: "Lightweight change",
      status: "draft",
      created_at: TIMESTAMP,
      tasks: [],
      deltas: {},
    });

    const policy: PublicRootPolicy = { roots: ["src/index.ts"] };
    const { snapshot } = await collectLightweightProfileEvidence(
      makeInput(workdir, changesDir, { apiCompatibilityPolicy: policy }),
    );

    expect(snapshot.apiCompatibility.publicSurface).toBe("proven_private");
    expect(snapshot.apiCompatibility.publicRoots).toContain("src/index.ts");
  });

  it("reports public_impact when a changed path is reachable from public roots", async () => {
    await mkdir(join(workdir, "src"), { recursive: true });
    await writeFile(
      join(workdir, "src/index.ts"),
      "export { publicFn } from './public';",
    );
    await writeFile(
      join(workdir, "src/public.ts"),
      "export { helper } from './helper';\nexport function publicFn() {}",
    );
    await writeFile(
      join(workdir, "src/helper.ts"),
      "export function helper() {}",
    );
    git(workdir, "add .");
    git(workdir, "commit -q -m 'initial'");

    await writeFile(
      join(workdir, "src/helper.ts"),
      "export function helper() { return 2; }",
    );
    git(workdir, "add src/helper.ts");
    git(workdir, "commit -q -m 'edit helper'");

    await writeChangeJson(changesDir, "lightweight-change", {
      id: "lightweight-change",
      title: "Lightweight change",
      status: "draft",
      created_at: TIMESTAMP,
      tasks: [],
      deltas: {},
    });

    const policy: PublicRootPolicy = { roots: ["src/index.ts"] };
    const { snapshot } = await collectLightweightProfileEvidence(
      makeInput(workdir, changesDir, { apiCompatibilityPolicy: policy }),
    );

    expect(snapshot.apiCompatibility.publicSurface).toBe("public_impact");
  });

  it("reports public_impact when a changed path is itself a public root", async () => {
    await mkdir(join(workdir, "src"), { recursive: true });
    await writeFile(join(workdir, "src/index.ts"), "export function api() {}");
    git(workdir, "add .");
    git(workdir, "commit -q -m 'initial'");

    await writeFile(
      join(workdir, "src/index.ts"),
      "export function api() { return 1; }",
    );
    git(workdir, "add src/index.ts");
    git(workdir, "commit -q -m 'edit root'");

    await writeChangeJson(changesDir, "lightweight-change", {
      id: "lightweight-change",
      title: "Lightweight change",
      status: "draft",
      created_at: TIMESTAMP,
      tasks: [],
      deltas: {},
    });

    const policy: PublicRootPolicy = { roots: ["src/index.ts"] };
    const { snapshot } = await collectLightweightProfileEvidence(
      makeInput(workdir, changesDir, { apiCompatibilityPolicy: policy }),
    );

    expect(snapshot.apiCompatibility.publicSurface).toBe("public_impact");
  });

  it("reports graph_failure when public-root graph evaluation fails", async () => {
    await mkdir(join(workdir, "src"), { recursive: true });
    await writeFile(
      join(workdir, "src/index.ts"),
      "export { publicFn } from './public';",
    );
    await writeFile(
      join(workdir, "src/public.ts"),
      "export function publicFn() {}",
    );
    git(workdir, "add .");
    git(workdir, "commit -q -m 'initial'");

    await writeFile(join(workdir, "src/bad.ts"), "export const x = 1;");
    git(workdir, "add src/bad.ts");
    git(workdir, "commit -q -m 'edit'");

    await writeChangeJson(changesDir, "lightweight-change", {
      id: "lightweight-change",
      title: "Lightweight change",
      status: "draft",
      created_at: TIMESTAMP,
      tasks: [],
      deltas: {},
    });

    // Force a graph failure by passing a public root that does not exist.
    const policy: PublicRootPolicy = { roots: ["src/nonexistent.ts"] };
    const { snapshot } = await collectLightweightProfileEvidence(
      makeInput(workdir, changesDir, { apiCompatibilityPolicy: policy }),
    );

    expect(snapshot.apiCompatibility.publicSurface).toBe("graph_failure");
  });

  it("loads durable task/delta/scope facts from storage projection", async () => {
    await writeFile(join(workdir, "a.ts"), "export const a = 1;");
    git(workdir, "add .");
    git(workdir, "commit -q -m 'initial'");

    await writeFile(join(workdir, "a.ts"), "export const a = 2;");
    git(workdir, "add a.ts");
    git(workdir, "commit -q -m 'edit'");

    await writeChangeJson(changesDir, "lightweight-change", {
      id: "lightweight-change",
      title: "Lightweight change",
      status: "draft",
      created_at: TIMESTAMP,
      tasks: [
        {
          id: "tk-1",
          title: "Implement",
          type: "code",
          status: "pending",
          created_at: TIMESTAMP,
        },
        {
          id: "tk-2",
          title: "Review docs",
          type: "docs",
          status: "pending",
          created_at: TIMESTAMP,
        },
      ],
      deltas: {
        "capability-a": [
          {
            id: "dl-1",
            operation: "add",
            requirement: {
              id: "rq-1",
              title: "New requirement",
              body: "Body",
              priority: "must",
              scenarios: [],
            },
          },
        ],
      },
      scope_repos: [{ repo_id: "primary" }],
    });

    const { snapshot } = await collectLightweightProfileEvidence(
      makeInput(workdir, changesDir),
    );

    expect(snapshot.taskCount).toEqual({ total: 2, implementation: 1 });
    expect(snapshot.specDelta.hasDelta).toBe(true);
    expect(snapshot.specDelta.capabilities).toContain("capability-a");
    expect(snapshot.repoScope).toEqual({
      currentProjectOnly: true,
      scopeRepos: 1,
    });
  });

  it("produces a snapshot that the pure evaluator accepts as qualified", async () => {
    await mkdir(join(workdir, "src"), { recursive: true });
    await writeFile(join(workdir, "src/index.ts"), "export function api() {}");
    await writeFile(join(workdir, "a.ts"), "export const a = 1;");
    git(workdir, "add .");
    git(workdir, "commit -q -m 'initial'");

    await writeFile(join(workdir, "a.ts"), "export const a = 2;");
    git(workdir, "add a.ts");
    git(workdir, "commit -q -m 'edit'");

    await writeChangeJson(changesDir, "lightweight-change", {
      id: "lightweight-change",
      title: "Lightweight change",
      status: "draft",
      created_at: TIMESTAMP,
      tasks: [
        {
          id: "tk-1",
          title: "Implement",
          type: "code",
          status: "pending",
          created_at: TIMESTAMP,
        },
      ],
      deltas: {},
    });

    const { snapshot } = await collectLightweightProfileEvidence(
      makeInput(workdir, changesDir, {
        apiCompatibilityPolicy: { roots: ["src/index.ts"] },
      }),
    );

    const evaluation = evaluateLightweightProfile({
      snapshot,
      requestId: "req-1",
      phase: "initial",
      evaluatedAt: TIMESTAMP,
    });

    expect(evaluation.result).toBe("qualified");
  });

  it("fails closed with incomplete evidence when baseline revision is invalid", async () => {
    await writeFile(join(workdir, "a.ts"), "export const a = 1;");
    git(workdir, "add .");
    git(workdir, "commit -q -m 'initial'");

    await writeChangeJson(changesDir, "lightweight-change", {
      id: "lightweight-change",
      title: "Lightweight change",
      status: "draft",
      created_at: TIMESTAMP,
      tasks: [
        {
          id: "tk-1",
          title: "Implement",
          type: "code",
          status: "pending",
          created_at: TIMESTAMP,
        },
      ],
      deltas: {},
    });

    const { snapshot, diagnostics } = await collectLightweightProfileEvidence(
      makeInput(workdir, changesDir, {
        baselineRevision: "nonexistent-baseline",
      }),
    );

    expect(snapshot.observedRevision).toMatch(/^[0-9a-f]{40}$/);
    expect(snapshot.changedPaths.rangeStatus).toBe("incomplete_diff");
    expect(
      diagnostics.some((d) => d.includes("Failed to collect committed diff")),
    ).toBe(true);

    const evaluation = evaluateLightweightProfile({
      snapshot,
      requestId: "req-1",
      phase: "initial",
      evaluatedAt: TIMESTAMP,
    });

    expect(evaluation.result).toBe("ineligible");
    const fileCriterion = evaluation.criteria.find(
      (c) => c.criterion === "changed_file_count",
    );
    expect(fileCriterion?.status).toBe("failed");
    expect(fileCriterion?.reason).toContain("incomplete_diff");
  });

  it("fails closed with incomplete evidence when revision/status collection fails", async () => {
    const nonGitWorkdir = join(tempDir, "not-a-repo");
    await mkdir(nonGitWorkdir, { recursive: true });

    await writeChangeJson(changesDir, "lightweight-change", {
      id: "lightweight-change",
      title: "Lightweight change",
      status: "draft",
      created_at: TIMESTAMP,
      tasks: [
        {
          id: "tk-1",
          title: "Implement",
          type: "code",
          status: "pending",
          created_at: TIMESTAMP,
        },
      ],
      deltas: {},
    });

    const { snapshot, diagnostics } = await collectLightweightProfileEvidence(
      makeInput(nonGitWorkdir, changesDir),
    );

    expect(snapshot.observedRevision).toBe("unknown");
    expect(snapshot.changedPaths.rangeStatus).toBe("incomplete_rev_parse");
    expect(
      diagnostics.some((d) => d.includes("Failed to read observed revision")),
    ).toBe(true);
    expect(
      diagnostics.some((d) =>
        d.includes("Failed to collect working-tree status"),
      ),
    ).toBe(true);

    const evaluation = evaluateLightweightProfile({
      snapshot,
      requestId: "req-1",
      phase: "initial",
      evaluatedAt: TIMESTAMP,
    });

    expect(evaluation.result).toBe("ineligible");
    const fileCriterion = evaluation.criteria.find(
      (c) => c.criterion === "changed_file_count",
    );
    expect(fileCriterion?.status).toBe("failed");
    expect(fileCriterion?.reason).toContain("incomplete_rev_parse");
  });
});
