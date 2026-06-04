import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { execSync } from "child_process";
import { rmSync, writeFileSync } from "fs";
import { join } from "path";
import { createLegacyStore, type Store } from "../storage/store";
import {
  getExternalRoot,
  getExternalRootForProject,
  getProjectId,
} from "../utils/project-id";
import {
  cleanupTempDir,
  createTempDir,
  createTestProject,
  parseToolOutput,
} from "../__tests__/setup";
import { changeTools } from "./change";
import { statusTools } from "./status";

function makeRealGitRepo(root: string): void {
  rmSync(join(root, ".git"), { recursive: true, force: true });
  execSync("git init -b main", { cwd: root, stdio: "ignore" });
  writeFileSync(join(root, ".adv-git-root"), "fixture\n");
  execSync("git add .adv-git-root", { cwd: root, stdio: "ignore" });
  execSync(
    "git -c user.name='ADV Test' -c user.email='adv-test@example.invalid' commit -m 'init'",
    { cwd: root, stdio: "ignore" },
  );
}

describe("cross-project coordination metadata", () => {
  let sourceDir: string;
  let targetDir: string;
  let sourceStore: Store;
  let targetStore: Store;

  beforeEach(async () => {
    sourceDir = await createTempDir("adv-source-project-");
    targetDir = await createTempDir("adv-target-project-");
    await createTestProject(sourceDir);
    await createTestProject(targetDir);
    sourceStore = await createLegacyStore(sourceDir);
    targetStore = await createLegacyStore(targetDir);
    await sourceStore.init();
    await targetStore.init();
  });

  afterEach(async () => {
    sourceStore.close();
    targetStore.close();
    await cleanupTempDir(sourceDir);
    await cleanupTempDir(targetDir);
  });

  test("cross-project create writes a source-side outbound link", async () => {
    const output = await changeTools.adv_change_create.execute(
      {
        summary: "Add target followup",
        capability: "test-capability",
        target_path: targetDir,
        source_project: "source-project",
        source_change_id: "addFeature",
      },
      sourceStore,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.changeId).toBe("addTargetFollowup");

    const sourceChange = await sourceStore.changes.get("addFeature");
    expect(sourceChange.success).toBe(true);
    expect(sourceChange.data?.cross_project_links).toEqual([
      expect.objectContaining({
        target_path: targetDir,
        changeId: "addTargetFollowup",
        relationship: "follow_up",
      }),
    ]);
  });

  test("cross-project create writes target change under target canonical shard", async () => {
    const originalXdgDataHome = process.env.XDG_DATA_HOME;
    const shardRoot = await createTempDir("adv-cross-project-shards-");
    makeRealGitRepo(sourceDir);
    makeRealGitRepo(targetDir);
    const sourceProjectId = await getProjectId(sourceDir);
    const targetProjectId = await getProjectId(targetDir);
    expect(sourceProjectId).toBeTruthy();
    expect(targetProjectId).toBeTruthy();
    process.env.XDG_DATA_HOME = `${shardRoot}/opencode-projects/${sourceProjectId}`;

    try {
      const output = await changeTools.adv_change_create.execute(
        {
          summary: "Add sharded followup",
          capability: "test-capability",
          target_path: targetDir,
          source_project: "source-project",
          source_change_id: "addFeature",
        },
        sourceStore,
      );
      const parsed = parseToolOutput(output);
      expect(parsed.changeId).toBe("addShardedFollowup");

      const canonicalTargetStore = await createLegacyStore(targetDir, {
        externalRoot: getExternalRootForProject(targetProjectId!),
      });
      const callerShardTargetStore = await createLegacyStore(targetDir, {
        externalRoot: getExternalRoot(targetProjectId!),
      });
      try {
        await canonicalTargetStore.init();
        await callerShardTargetStore.init();

        const canonicalChange =
          await canonicalTargetStore.changes.get("addShardedFollowup");
        expect(canonicalChange.success).toBe(true);

        const callerShardChange =
          await callerShardTargetStore.changes.get("addShardedFollowup");
        expect(callerShardChange.success).toBe(false);
      } finally {
        canonicalTargetStore.close();
        callerShardTargetStore.close();
      }
    } finally {
      if (originalXdgDataHome !== undefined)
        process.env.XDG_DATA_HOME = originalXdgDataHome;
      else delete process.env.XDG_DATA_HOME;
      await cleanupTempDir(shardRoot);
    }
  });

  test("product-linked create defaults scope_repos to current repo", async () => {
    sourceStore.productContext = {
      currentRoot: sourceDir,
      currentRepoId: "web",
      repoProjectId: "w".repeat(40),
      productId: "example-product",
      productProjectId: "b".repeat(40),
      primaryRoot: targetDir,
      primaryRepoId: "backend",
      repos: {
        web: { id: "web", root: sourceDir, repoProjectId: "w".repeat(40) },
        backend: {
          id: "backend",
          root: targetDir,
          repoProjectId: "b".repeat(40),
        },
      },
      mode: "secondary",
      missingPrimaryPolicy: "block",
    };

    const output = await changeTools.adv_change_create.execute(
      { summary: "Add scoped change", capability: "test-capability" },
      sourceStore,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.scope_repos).toEqual([
      expect.objectContaining({ repo_id: "web" }),
    ]);

    expect(parsed.scope_repos).toEqual([
      expect.objectContaining({
        repo_id: "web",
        repo_project_id: "w".repeat(40),
      }),
    ]);
  });

  test("product-linked create validates explicit scope_repos", async () => {
    sourceStore.productContext = {
      currentRoot: sourceDir,
      currentRepoId: "web",
      repoProjectId: "w".repeat(40),
      productId: "example-product",
      productProjectId: "b".repeat(40),
      primaryRoot: targetDir,
      primaryRepoId: "backend",
      repos: {
        web: { id: "web", root: sourceDir, repoProjectId: "w".repeat(40) },
      },
      mode: "secondary",
      missingPrimaryPolicy: "block",
    };

    const output = await changeTools.adv_change_create.execute(
      {
        summary: "Add bad scoped change",
        capability: "test-capability",
        scope_repos: [{ repo_id: "backend" }],
      },
      sourceStore,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.error).toContain("Unknown scope_repos repo_id");
  });

  test("product-linked change list defaults to current repo scope", async () => {
    sourceStore.productContext = {
      currentRoot: sourceDir,
      currentRepoId: "web",
      repoProjectId: "w".repeat(40),
      productId: "example-product",
      productProjectId: "b".repeat(40),
      primaryRoot: targetDir,
      primaryRepoId: "backend",
      repos: {
        web: { id: "web", root: sourceDir, repoProjectId: "w".repeat(40) },
        backend: {
          id: "backend",
          root: targetDir,
          repoProjectId: "b".repeat(40),
        },
      },
      mode: "secondary",
      missingPrimaryPolicy: "block",
    };

    await sourceStore.changes.save({
      id: "addWebScoped",
      title: "Add web scoped",
      status: "draft",
      created_at: "2026-05-10T00:00:00.000Z",
      tasks: [],
      deltas: {},
      scope_repos: [{ repo_id: "web", required: true }],
    } as never);
    await sourceStore.changes.save({
      id: "addBackendScoped",
      title: "Add backend scoped",
      status: "draft",
      created_at: "2026-05-10T00:00:01.000Z",
      tasks: [],
      deltas: {},
      scope_repos: [{ repo_id: "backend", required: true }],
    } as never);

    const repoScoped = parseToolOutput(
      await changeTools.adv_change_list.execute({}, sourceStore),
    );
    expect(repoScoped.changes.map((c: { id: string }) => c.id)).toContain(
      "addWebScoped",
    );
    expect(repoScoped.changes.map((c: { id: string }) => c.id)).not.toContain(
      "addBackendScoped",
    );

    const productWide = parseToolOutput(
      await changeTools.adv_change_list.execute(
        { scope: "product" },
        sourceStore,
      ),
    );
    expect(productWide.changes.map((c: { id: string }) => c.id)).toEqual(
      expect.arrayContaining(["addWebScoped", "addBackendScoped"]),
    );
    expect(productWide._productContext).toMatchObject({
      productId: "example-product",
      currentRepoId: "web",
      scope: "product",
    });
  });

  test("change show summarizes advisory external dependency status", async () => {
    const sourceChange = await sourceStore.changes.get("addFeature");
    expect(sourceChange.success).toBe(true);
    sourceChange.data!.external_dependencies = [
      {
        target_path: targetDir,
        changeId: "missingTargetChange",
        relationship: "requires",
        advisory: true,
      },
      {
        target_path: targetDir,
        changeId: "addFeature",
        relationship: "coordinates_with",
        advisory: true,
      },
    ];
    await sourceStore.changes.save(sourceChange.data!);

    const output = await changeTools.adv_change_show.execute(
      { changeId: "addFeature" },
      sourceStore,
    );
    const parsed = parseToolOutput(output);

    expect(parsed.external_dependencies).toHaveLength(2);
    expect(parsed._externalDependencyStatus.summary).toMatchObject({
      total: 2,
      satisfied: 1,
      warning: 1,
      blocking: 0,
      advisoryOnly: true,
    });
    expect(parsed._externalDependencyStatus.dependencies).toEqual([
      expect.objectContaining({ status: "warning" }),
      expect.objectContaining({ status: "satisfied" }),
    ]);
    expect(parsed._externalDependencyStatus.note).toContain("advisory");
    expect(parsed._externalDependencyStatus.dependencies[0].message).toContain(
      "missingTargetChange",
    );
  });

  test("status overview includes concise advisory dependency summary", async () => {
    const sourceChange = await sourceStore.changes.get("addFeature");
    expect(sourceChange.success).toBe(true);
    sourceChange.data!.external_dependencies = [
      {
        target_path: targetDir,
        changeId: "missingTargetChange",
        relationship: "requires",
        advisory: true,
      },
      {
        target_path: targetDir,
        changeId: "addFeature",
        taskId: "tk-task0001",
        relationship: "coordinates_with",
        advisory: true,
      },
    ];
    await sourceStore.changes.save(sourceChange.data!);

    const targetChange = await targetStore.changes.get("addFeature");
    expect(targetChange.success).toBe(true);
    targetChange.data!.tasks[0]!.status = "done";
    await targetStore.changes.save(targetChange.data!);

    const output = await statusTools.adv_status.execute(
      { view: "changes" },
      sourceStore,
    );
    const parsed = parseToolOutput(output);
    const recent = parsed.changes.recent.find(
      (change: { id: string }) => change.id === "addFeature",
    );

    expect(recent._externalDependencyStatus).toEqual({
      total: 2,
      satisfied: 1,
      warning: 1,
      blocking: 0,
      advisoryOnly: true,
    });
  });

  test("local-only change show remains free of target project context", async () => {
    const output = await changeTools.adv_change_show.execute(
      { changeId: "addFeature" },
      sourceStore,
    );
    const parsed = parseToolOutput(output);

    expect(parsed.id).toBe("addFeature");
    expect(parsed._projectContext).toBeUndefined();
  });
});
