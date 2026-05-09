/**
 * Roadmap Tool Tests
 *
 * Verifies file-source path: snapshot read, filtering, sorting, error
 * handling. Live-source path is exercised via integration / manual run
 * (it shells out to `gh`).
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { roadmapTools, type RoadmapSnapshot } from "./roadmap";
import { createLegacyStore, type Store } from "../storage/store";
import {
  createTempDir,
  cleanupTempDir,
  createTestProject,
} from "../__tests__/setup";

const SAMPLE_SNAPSHOT: RoadmapSnapshot = {
  version: 1,
  generated_at: "2026-05-09T02:42:00Z",
  project: { owner: "TestOrg", number: 1, title: "ADV: Test" },
  counts: { total: 8, bugs: 3, features: 4, deferred: 1 },
  bugs: [
    { number: 100, title: "Critical bug", priority: "critical", labels: [] },
    { number: 101, title: "High bug", priority: "high", labels: [] },
    { number: 102, title: "No-priority bug", priority: null, labels: [] },
  ],
  features: [
    {
      number: 51,
      title: "Top WSJF feature",
      value: 8,
      time_criticality: 3,
      rroe: 13,
      effort: 3,
      wsjf: 8.0,
      labels: [],
    },
    {
      number: 79,
      title: "Tied 8.0 with lower Value",
      value: 5,
      time_criticality: 1,
      rroe: 2,
      effort: 1,
      wsjf: 8.0,
      labels: [],
    },
    {
      number: 80,
      title: "Mid",
      value: 8,
      time_criticality: 2,
      rroe: 5,
      effort: 2,
      wsjf: 7.5,
      labels: [],
    },
    {
      number: 83,
      title: "Bottom",
      value: 5,
      time_criticality: 2,
      rroe: 5,
      effort: 5,
      wsjf: 2.4,
      labels: [],
    },
  ],
  deferred: [
    { number: 90, title: "No Value yet", reason: "user-deferred (Value)" },
  ],
};

describe("Roadmap Tool", () => {
  let tempDir: string;
  let store: Store;

  beforeEach(async () => {
    tempDir = await createTempDir();
    await createTestProject(tempDir);
    store = await createLegacyStore(tempDir);
  });

  afterEach(async () => {
    store.close();
    await cleanupTempDir(tempDir);
  });

  async function writeSnapshot(snapshot: RoadmapSnapshot): Promise<void> {
    await mkdir(join(tempDir, ".adv"), { recursive: true });
    await writeFile(
      join(tempDir, ".adv/roadmap-snapshot.json"),
      JSON.stringify(snapshot),
    );
  }

  describe("source: file (default)", () => {
    test("returns full snapshot when no filters applied", async () => {
      await writeSnapshot(SAMPLE_SNAPSHOT);
      const result = await roadmapTools.adv_roadmap.execute({}, store);
      const parsed = JSON.parse(result);

      expect(parsed.source).toBe("file");
      expect(parsed.counts).toEqual(SAMPLE_SNAPSHOT.counts);
      expect(parsed.features).toHaveLength(4);
      expect(parsed.bugs.critical).toHaveLength(1);
      expect(parsed.bugs.high).toHaveLength(1);
      expect(parsed.bugs.unprioritized).toHaveLength(1);
      expect(parsed.deferred).toHaveLength(1);
    });

    test("sorts features by WSJF descending; ties by Value desc, then issue number asc", async () => {
      await writeSnapshot(SAMPLE_SNAPSHOT);
      const result = await roadmapTools.adv_roadmap.execute({}, store);
      const parsed = JSON.parse(result);

      // 51 (WSJF 8.0, V=8) before 79 (WSJF 8.0, V=5) — tie broken by Value desc
      expect(parsed.features.map((f: { number: number }) => f.number)).toEqual([
        51, 79, 80, 83,
      ]);
    });

    test("kind=feature drops bugs from response", async () => {
      await writeSnapshot(SAMPLE_SNAPSHOT);
      const result = await roadmapTools.adv_roadmap.execute(
        { kind: "feature" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.features).toHaveLength(4);
      expect(parsed.bugs.critical).toHaveLength(0);
      expect(parsed.bugs.high).toHaveLength(0);
      expect(parsed.bugs.unprioritized).toHaveLength(0);
    });

    test("kind=bug drops features from response", async () => {
      await writeSnapshot(SAMPLE_SNAPSHOT);
      const result = await roadmapTools.adv_roadmap.execute(
        { kind: "bug" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.features).toEqual([]);
      expect(parsed.bugs.critical).toHaveLength(1);
      expect(parsed.bugs.high).toHaveLength(1);
    });

    test("top: 2 limits features to top 2 by WSJF", async () => {
      await writeSnapshot(SAMPLE_SNAPSHOT);
      const result = await roadmapTools.adv_roadmap.execute({ top: 2 }, store);
      const parsed = JSON.parse(result);

      expect(parsed.features).toHaveLength(2);
      expect(parsed.features.map((f: { number: number }) => f.number)).toEqual([
        51, 79,
      ]);
    });

    test("priority filter scopes bugs to a single tier", async () => {
      await writeSnapshot(SAMPLE_SNAPSHOT);
      const result = await roadmapTools.adv_roadmap.execute(
        { priority: "critical" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.bugs.critical).toHaveLength(1);
      expect(parsed.bugs.high).toHaveLength(0);
      expect(parsed.bugs.unprioritized).toHaveLength(0);
    });

    test("missing snapshot returns actionable error", async () => {
      const result = await roadmapTools.adv_roadmap.execute({}, store);
      const parsed = JSON.parse(result);

      expect(parsed.error).toMatch(/Roadmap snapshot not found/);
      expect(parsed.hint).toContain("/adv-triage --execute");
      expect(parsed.source).toBe("file");
    });

    test("malformed JSON returns actionable error", async () => {
      await mkdir(join(tempDir, ".adv"), { recursive: true });
      await writeFile(
        join(tempDir, ".adv/roadmap-snapshot.json"),
        "{not valid json",
      );

      const result = await roadmapTools.adv_roadmap.execute({}, store);
      const parsed = JSON.parse(result);

      expect(parsed.error).toMatch(/not valid JSON/);
      expect(parsed.hint).toContain("Re-run /adv-triage");
    });

    test("wrong-version snapshot returns shape error", async () => {
      await mkdir(join(tempDir, ".adv"), { recursive: true });
      await writeFile(
        join(tempDir, ".adv/roadmap-snapshot.json"),
        JSON.stringify({ version: 999, bugs: [], features: [], deferred: [] }),
      );

      const result = await roadmapTools.adv_roadmap.execute({}, store);
      const parsed = JSON.parse(result);

      expect(parsed.error).toMatch(/unexpected shape/);
    });
  });

  describe("argument validation", () => {
    test("kind=all behaves the same as omitting kind", async () => {
      await writeSnapshot(SAMPLE_SNAPSHOT);
      const omitted = JSON.parse(
        await roadmapTools.adv_roadmap.execute({}, store),
      );
      const explicit = JSON.parse(
        await roadmapTools.adv_roadmap.execute({ kind: "all" }, store),
      );

      expect(
        explicit.features.map((f: { number: number }) => f.number),
      ).toEqual(omitted.features.map((f: { number: number }) => f.number));
      expect(explicit.counts).toEqual(omitted.counts);
    });
  });

  describe("source: live metadata resolution", () => {
    test("reads github_project metadata from store.paths.projectMetadata (not the .adv/ default)", async () => {
      // Reproduces the bug: adv_project_metadata writes to
      // store.paths.projectMetadata, but readProjectMetadata's default path
      // computation appends `.adv/` and silently returns {} for projects
      // whose metadata lives at <external>/project-metadata.json.
      const { writeProjectMetadataEntry } = await import(
        "../storage/project-metadata"
      );
      await writeProjectMetadataEntry(
        store.paths.root,
        {
          key: "github_project",
          timestamp: new Date().toISOString(),
          count: 1,
          summary: JSON.stringify({
            owner: "TestOrg",
            project_number: 1,
            project_id: "PVT_test",
            title: "ADV: Test",
          }),
          written_by: "agent",
        },
        store.paths.projectMetadata,
      );

      const result = await roadmapTools.adv_roadmap.execute(
        { source: "live" },
        store,
      );
      const parsed = JSON.parse(result);

      // Must NOT be the "metadata not persisted" error — that means we
      // failed to find the entry on disk despite it existing.
      expect(parsed.error).not.toMatch(/metadata not persisted/);
      // Downstream errors are acceptable (gh CLI not available in test env);
      // only the metadata-resolution path is what we're guarding here.
    });
  });

  describe("active-change cross-reference", () => {
    test("annotates roadmap items that have an active change via origin.issue_number", async () => {
      await writeSnapshot(SAMPLE_SNAPSHOT);

      // Create an active change linked to roadmap issue #51
      const { changeTools } = await import("./change");
      const createOutput = await changeTools.adv_change_create.execute(
        {
          summary: "Implement top WSJF feature",
          origin_kind: "roadmap",
          origin_issue_number: 51,
        },
        store,
      );
      const createParsed = JSON.parse(createOutput);
      const createdChangeId = createParsed.changeId;
      expect(typeof createdChangeId).toBe("string");

      const result = await roadmapTools.adv_roadmap.execute({}, store);
      const parsed = JSON.parse(result);

      expect(parsed.active_changes_indexed).toBe(1);
      const top = parsed.features.find(
        (f: { number: number }) => f.number === 51,
      );
      expect(top.active_change).toBe(createdChangeId);

      // Issues without an active change have no active_change field
      const without = parsed.features.find(
        (f: { number: number }) => f.number === 79,
      );
      expect(without.active_change).toBeUndefined();
    });

    test("does not surface origin links from changes pointing at other issues", async () => {
      await writeSnapshot(SAMPLE_SNAPSHOT);

      const { changeTools } = await import("./change");
      await changeTools.adv_change_create.execute(
        {
          summary: "Different issue",
          origin_kind: "roadmap",
          origin_issue_number: 999, // not in snapshot
        },
        store,
      );

      const result = await roadmapTools.adv_roadmap.execute({}, store);
      const parsed = JSON.parse(result);

      expect(parsed.active_changes_indexed).toBe(1);
      // None of the snapshot features should be annotated
      for (const f of parsed.features) {
        expect(f.active_change).toBeUndefined();
      }
    });
  });
});
