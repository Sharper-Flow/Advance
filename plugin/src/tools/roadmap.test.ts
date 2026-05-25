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
import {
  buildProjectItemListArgs,
  roadmapTools,
  type RoadmapSnapshot,
  filterOpenItemsOnly,
  assessRoadmapFreshness,
  assessAnnotationFreshness,
  buildRefreshMetadata,
  type LiveProjectItem,
} from "./roadmap";
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

    test("surfaces repository_filter from snapshot metadata when present", async () => {
      await writeSnapshot({
        ...SAMPLE_SNAPSHOT,
        repository_filter: "Example-Web",
      });
      const result = await roadmapTools.adv_roadmap.execute({}, store);
      const parsed = JSON.parse(result);

      expect(parsed.repository_filter).toBe("Example-Web");
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
      expect(parsed.hint).toContain("/adv-triage");
      expect(parsed.source).toBe("file");
    });

    test("reports stale file freshness and closure-drift warning", async () => {
      await writeSnapshot({
        ...SAMPLE_SNAPSHOT,
        generated_at: "2026-01-01T00:00:00.000Z",
      });
      const result = await roadmapTools.adv_roadmap.execute({}, store);
      const parsed = JSON.parse(result);

      expect(parsed.freshness.status).toBe("stale");
      expect(parsed.freshness.needs_refresh).toBe(true);
      expect(parsed.warnings).toContainEqual(
        expect.stringContaining("run /adv-roadmap --live"),
      );
      expect(parsed.warnings).toContainEqual(
        expect.stringContaining("recent ATC/archive closures"),
      );
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

  describe("assessRoadmapFreshness", () => {
    test("marks file snapshots older than two hours stale", () => {
      const freshness = assessRoadmapFreshness(
        "file",
        "2026-05-10T00:00:00.000Z",
        new Date("2026-05-10T02:00:01.000Z"),
      );

      expect(freshness.status).toBe("stale");
      expect(freshness.stale_after_hours).toBe(2);
      expect(freshness.needs_refresh).toBe(true);
    });

    test("marks live results as fresh regardless of generated_at", () => {
      const freshness = assessRoadmapFreshness(
        "live",
        "2026-01-01T00:00:00.000Z",
        new Date("2026-05-10T02:00:01.000Z"),
      );

      expect(freshness.status).toBe("live");
      expect(freshness.needs_refresh).toBe(false);
      expect(freshness.age_hours).toBe(0);
    });
  });

  describe("assessAnnotationFreshness (rq-backlogCoord01 TTL contract)", () => {
    test("marks snapshot fresh when last_refreshed within ttl_ms window", () => {
      const snapshot: RoadmapSnapshot = {
        ...SAMPLE_SNAPSHOT,
        last_refreshed: "2026-05-11T00:00:00.000Z",
        ttl_ms: 300_000, // 5 min
        next_refresh_after: "2026-05-11T00:05:00.000Z",
      };

      const result = assessAnnotationFreshness(
        snapshot,
        new Date("2026-05-11T00:02:00.000Z"),
      );

      expect(result.needs_refresh).toBe(false);
      expect(result.age_ms).toBeGreaterThanOrEqual(120_000); // 2 min
      expect(result.age_ms).toBeLessThan(180_000); // < 3 min
      expect(result.ttl_ms).toBe(300_000);
    });

    test("marks snapshot stale when last_refreshed exceeds ttl_ms window", () => {
      const snapshot: RoadmapSnapshot = {
        ...SAMPLE_SNAPSHOT,
        last_refreshed: "2026-05-11T00:00:00.000Z",
        ttl_ms: 300_000,
      };

      const result = assessAnnotationFreshness(
        snapshot,
        new Date("2026-05-11T00:06:00.000Z"), // 6 min later — past TTL
      );

      expect(result.needs_refresh).toBe(true);
      expect(result.age_ms).toBeGreaterThanOrEqual(360_000);
    });

    test("treats snapshot without last_refreshed as stale (backward-compat trigger)", () => {
      // Legacy snapshot missing the new fields entirely.
      const snapshot: RoadmapSnapshot = { ...SAMPLE_SNAPSHOT };

      const result = assessAnnotationFreshness(
        snapshot,
        new Date("2026-05-11T00:00:00.000Z"),
      );

      expect(result.needs_refresh).toBe(true);
      expect(result.age_ms).toBeNull();
    });

    test("uses default ttl_ms (300_000 = 5 min) when last_refreshed present but ttl_ms missing", () => {
      const snapshot: RoadmapSnapshot = {
        ...SAMPLE_SNAPSHOT,
        last_refreshed: "2026-05-11T00:00:00.000Z",
        // ttl_ms intentionally missing
      };

      const result = assessAnnotationFreshness(
        snapshot,
        new Date("2026-05-11T00:04:00.000Z"), // 4 min — within default 5-min TTL
      );

      expect(result.ttl_ms).toBe(300_000);
      expect(result.needs_refresh).toBe(false);
    });

    test("RoadmapSnapshot type accepts the new TTL fields (rq-backlogCoord01 schema)", () => {
      // Type-level check: this snapshot literal must compile when the new
      // optional fields are added to RoadmapSnapshot.
      const snapshot: RoadmapSnapshot = {
        ...SAMPLE_SNAPSHOT,
        last_refreshed: "2026-05-11T00:00:00.000Z",
        ttl_ms: 300_000,
        next_refresh_after: "2026-05-11T00:05:00.000Z",
      };
      expect(snapshot.last_refreshed).toBe("2026-05-11T00:00:00.000Z");
      expect(snapshot.ttl_ms).toBe(300_000);
      expect(snapshot.next_refresh_after).toBe("2026-05-11T00:05:00.000Z");
    });

    test("buildRefreshMetadata helper produces consistent last_refreshed + next_refresh_after pair", () => {
      const metadata = buildRefreshMetadata({
        now: new Date("2026-05-11T00:00:00.000Z"),
        ttl_ms: 300_000,
      });

      expect(metadata.last_refreshed).toBe("2026-05-11T00:00:00.000Z");
      expect(metadata.ttl_ms).toBe(300_000);
      expect(metadata.next_refresh_after).toBe("2026-05-11T00:05:00.000Z");
    });

    test("buildRefreshMetadata defaults ttl_ms to 300_000 when not provided", () => {
      const metadata = buildRefreshMetadata({
        now: new Date("2026-05-11T00:00:00.000Z"),
      });

      expect(metadata.ttl_ms).toBe(300_000);
    });
  });

  describe("source: live config resolution", () => {
    test("resolves github_project config via readGitHubProjectConfig (rq-issueChangeLinkage03)", async () => {
      // After rq-issueChangeLinkage03 the live-source path reads typed
      // config via `.adv/github-project.json` (preferred) with legacy
      // fallback. Verify the live source no longer trips the
      // "config not persisted" error when a valid config exists.
      const { writeGitHubProjectConfig } =
        await import("../storage/github-project-config");
      await writeGitHubProjectConfig(store.paths.root, {
        owner: "TestOrg",
        project_number: 1,
        project_id: "PVT_test",
        title: "ADV: Test",
        fields: {
          adv_type: "PVTSSF_advtype",
          priority: "PVTSSF_priority",
          value: "PVTF_value",
          time_criticality: "PVTF_tc",
          rroe: "PVTF_rroe",
          effort: "PVTF_effort",
          wsjf: "PVTF_wsjf",
        },
        adv_type_options: { bug: "opt_b", feature: "opt_f" },
        priority_options: {
          critical: "opt_c",
          high: "opt_h",
          medium: "opt_m",
          low: "opt_l",
        },
      });

      const result = await roadmapTools.adv_roadmap.execute(
        { source: "live" },
        store,
      );
      const parsed = JSON.parse(result);

      // Must NOT be the "config not persisted" error — config exists on disk.
      expect(parsed.error).not.toMatch(/config not persisted/);
      // Downstream errors are acceptable (gh CLI not available in test env);
      // only the config-resolution path is what we're guarding here.
    });
  });

  describe("buildProjectItemListArgs", () => {
    test("omits --query when repository_filter is absent", () => {
      expect(buildProjectItemListArgs({ owner: "TestOrg", number: 1 })).toEqual(
        [
          "project",
          "item-list",
          "1",
          "--owner",
          "TestOrg",
          "--format",
          "json",
          "--limit",
          "500",
        ],
      );
    });

    test("adds server-side repo query when repository_filter is present", () => {
      expect(
        buildProjectItemListArgs({
          owner: "Sharper-Flow",
          number: 1,
          repository_filter: "Example-Web",
        }),
      ).toContain("repo:Sharper-Flow/Example-Web");
    });
  });

  describe("filterOpenItemsOnly (live source closed-issue filter)", () => {
    test("removes items whose issue number is in the closed set", () => {
      const items: LiveProjectItem[] = [
        { content: { type: "Issue", number: 100, title: "open bug" } },
        { content: { type: "Issue", number: 101, title: "closed bug" } },
        { content: { type: "Issue", number: 102, title: "another open" } },
      ];
      const closed = new Set([101]);
      const filtered = filterOpenItemsOnly(items, closed);
      expect(filtered.map((i) => i.content?.number)).toEqual([100, 102]);
    });

    test("keeps items missing a number (defensive)", () => {
      const items: LiveProjectItem[] = [
        { content: { type: "Issue" } as { number?: number; title?: string } },
        { content: { type: "Issue", number: 200, title: "ok" } },
      ];
      const filtered = filterOpenItemsOnly(items, new Set([200]));
      expect(filtered).toHaveLength(1);
      expect(filtered[0].content?.number).toBeUndefined();
    });

    test("returns all items when closed set is empty", () => {
      const items: LiveProjectItem[] = [
        { content: { type: "Issue", number: 1, title: "a" } },
        { content: { type: "Issue", number: 2, title: "b" } },
      ];
      expect(filterOpenItemsOnly(items, new Set())).toEqual(items);
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
