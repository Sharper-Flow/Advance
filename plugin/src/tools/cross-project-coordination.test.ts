import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createLegacyStore, type Store } from "../storage/store";
import {
  cleanupTempDir,
  createTempDir,
  createTestProject,
  parseToolOutput,
} from "../__tests__/setup";
import { changeTools } from "./change";

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
});
