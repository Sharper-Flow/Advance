import { describe, expect, test } from "vitest";
import { readFileSync } from "fs";
import { join, resolve } from "path";
import { SpecSchema } from "../types";

const REPO_ROOT = resolve(__dirname, "../../..");
const SPEC_PATH = join(
  REPO_ROOT,
  ".adv",
  "specs",
  "snapshot-health",
  "spec.json",
);

describe("snapshot-health spec", () => {
  const specRaw = JSON.parse(readFileSync(SPEC_PATH, "utf8"));

  test("parses against SpecSchema", () => {
    const parsed = SpecSchema.parse(specRaw);
    expect(parsed.name).toBe("snapshot-health");
    expect(parsed.title).toBe("Snapshot Store Health Diagnostics");
  });

  test("has at least 6 requirements", () => {
    const parsed = SpecSchema.parse(specRaw);
    expect(parsed.requirements.length).toBeGreaterThanOrEqual(6);
  });

  test("all rq- IDs are unique within the spec", () => {
    const parsed = SpecSchema.parse(specRaw);
    const ids = parsed.requirements.map((r) => r.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  test("every must requirement has at least one scenario", () => {
    const parsed = SpecSchema.parse(specRaw);
    const mustRequirements = parsed.requirements.filter(
      (r) => r.priority === "must",
    );
    expect(mustRequirements.length).toBeGreaterThan(0);
    for (const rq of mustRequirements) {
      expect(
        rq.scenarios?.length ?? 0,
        `Requirement ${rq.id} (${rq.title}) must have at least one scenario`,
      ).toBeGreaterThanOrEqual(1);
    }
  });

  test("contains all required rq- IDs", () => {
    const parsed = SpecSchema.parse(specRaw);
    const ids = parsed.requirements.map((r) => r.id);
    expect(ids).toContain("rq-snapshotHealthProbe01");
    expect(ids).toContain("rq-snapshotHealthSafeDefault01");
    expect(ids).toContain("rq-snapshotHealthRepairWhitelist01");
    expect(ids).toContain("rq-snapshotHealthAuditTrail01");
    expect(ids).toContain("rq-snapshotHealthScopeBoundary01");
    expect(ids).toContain("rq-snapshotHealthSchemaVersion01");
    expect(ids).toContain("rq-snapshotHealthLayoutDetect01");
    expect(ids).toContain("rq-snapshotHealthRaceGuard01");
  });

  test("rq-snapshotHealthProbe01 detects 7 patterns in body", () => {
    const parsed = SpecSchema.parse(specRaw);
    const probe = parsed.requirements.find(
      (r) => r.id === "rq-snapshotHealthProbe01",
    );
    expect(probe).toBeDefined();
    expect(probe?.body).toContain("stale_lock");
    expect(probe?.body).toContain("zero_byte_object");
    expect(probe?.body).toContain("fsck_error");
    expect(probe?.body).toContain("orphan_bare_repo");
    expect(probe?.body).toContain("oversized_dir");
    expect(probe?.body).toContain("legacy_layout");
    expect(probe?.body).toContain("no_snapshot_dirs");
    expect(probe?.body).toContain("schema_version: 1");
  });

  test("rq-snapshotHealthSafeDefault01 requires explicit approval", () => {
    const parsed = SpecSchema.parse(specRaw);
    const safe = parsed.requirements.find(
      (r) => r.id === "rq-snapshotHealthSafeDefault01",
    );
    expect(safe).toBeDefined();
    expect(safe?.body).toContain("approvedByUser: true");
    expect(safe?.body).toContain("approvalEvidence");
    expect(safe?.body).toContain("repair_actions");
  });

  test("rq-snapshotHealthRepairWhitelist01 prohibits history-altering ops", () => {
    const parsed = SpecSchema.parse(specRaw);
    const wl = parsed.requirements.find(
      (r) => r.id === "rq-snapshotHealthRepairWhitelist01",
    );
    expect(wl).toBeDefined();
    expect(wl?.body).toContain("gc");
    expect(wl?.body).toContain("prune");
    expect(wl?.body).toContain("filter-repo");
  });

  test("rq-snapshotHealthRaceGuard01 requires re-check before deletion", () => {
    const parsed = SpecSchema.parse(specRaw);
    const race = parsed.requirements.find(
      (r) => r.id === "rq-snapshotHealthRaceGuard01",
    );
    expect(race).toBeDefined();
    expect(race?.body).toContain("lsof");
    expect(race?.body).toContain("re-resolve");
    expect(race?.body).toContain("TOCTOU");
  });
});
