import { describe, expect, test } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { assessRoadmapFreshness } from "./tools/roadmap";

const REPO_ROOT = resolve(__dirname, "../..");
const BIN_ROADMAP_TS = resolve(REPO_ROOT, "bin/lib/roadmap.ts");
const PLUGIN_ROADMAP_TS = resolve(REPO_ROOT, "plugin/src/tools/roadmap.ts");

describe("Roadmap freshness threshold parity", () => {
  test("plugin assessRoadmapFreshness returns stale_after_hours === 2", () => {
    const freshness = assessRoadmapFreshness("file", "2024-06-01T12:00:00Z");
    expect(freshness.stale_after_hours).toBe(2);
  });

  test("bin/lib/roadmap.ts contains the 2h threshold literal", () => {
    const source = readFileSync(BIN_ROADMAP_TS, "utf8");
    expect(source).toContain("2 * 60 * 60 * 1000");
  });
});

describe("Roadmap snapshot shape parity", () => {
  test("CLI RoadmapBug fields are present in both plugin and bin modules", () => {
    const binSource = readFileSync(BIN_ROADMAP_TS, "utf8");
    const pluginSource = readFileSync(PLUGIN_ROADMAP_TS, "utf8");

    const bugFields = ["number", "title", "priority", "labels"];
    for (const field of bugFields) {
      expect(
        binSource.includes(field),
        `bin/lib/roadmap.ts missing RoadmapBug field: ${field}`,
      ).toBe(true);
      expect(
        pluginSource.includes(field),
        `plugin/src/tools/roadmap.ts missing RoadmapBug field: ${field}`,
      ).toBe(true);
    }
  });

  test("CLI RoadmapFeature fields are present in both plugin and bin modules", () => {
    const binSource = readFileSync(BIN_ROADMAP_TS, "utf8");
    const pluginSource = readFileSync(PLUGIN_ROADMAP_TS, "utf8");

    const featureFields = [
      "number",
      "title",
      "value",
      "time_criticality",
      "rroe",
      "effort",
      "wsjf",
      "labels",
    ];
    for (const field of featureFields) {
      expect(
        binSource.includes(field),
        `bin/lib/roadmap.ts missing RoadmapFeature field: ${field}`,
      ).toBe(true);
      expect(
        pluginSource.includes(field),
        `plugin/src/tools/roadmap.ts missing RoadmapFeature field: ${field}`,
      ).toBe(true);
    }
  });
});
