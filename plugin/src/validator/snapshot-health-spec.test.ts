import { describe, expect, test } from "vitest";
import { readFileSync } from "fs";
import { join, resolve } from "path";
import { SpecSchema } from "../types";
import { REPAIR_ACTION_ENUM } from "../tools/snapshot";

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
    expect(safe?.body).toContain("--approved-by-user true");
    expect(safe?.body).toContain("--approval-evidence");
    expect(safe?.body).toContain("--repair-actions");
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

  // AC2 / DDC6 parity: the spec whitelist and the runtime REPAIR_ACTION_ENUM
  // must name exactly the same closed repair-action set, in both directions.
  test("rq-snapshotHealthRepairWhitelist01 names exactly the runtime REPAIR_ACTION_ENUM", () => {
    const parsed = SpecSchema.parse(specRaw);
    const wl = parsed.requirements.find(
      (r) => r.id === "rq-snapshotHealthRepairWhitelist01",
    );
    expect(wl).toBeDefined();

    // Extract backtick-quoted whitelist tokens from the requirement body.
    // Prohibited ops (`gc`, `prune`, `filter-repo`, `repack`) never match the
    // delete_* naming convention shared by every whitelisted action.
    const specActions = new Set(
      [...wl!.body.matchAll(/`([^`]+)`/g)]
        .map((m) => m[1])
        .filter((token) => token.startsWith("delete_")),
    );

    expect(
      [...specActions].sort(),
      "spec whitelist body must name exactly the runtime repair actions",
    ).toEqual([...REPAIR_ACTION_ENUM].sort());

    // The acceptance scenario must also name every runtime action so the
    // closed set is pinned in scenario prose, not only the body.
    const scenario = wl!.scenarios?.find(
      (s) => s.id === "rq-snapshotHealthRepairWhitelist01.1",
    );
    expect(scenario).toBeDefined();
    const scenarioText = JSON.stringify(scenario);
    for (const action of REPAIR_ACTION_ENUM) {
      expect(scenarioText).toContain(action);
    }
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

  test("rq-snapshotHealthAuditTrail01 requires purpose-specific audit log", () => {
    const parsed = SpecSchema.parse(specRaw);
    const audit = parsed.requirements.find(
      (r) => r.id === "rq-snapshotHealthAuditTrail01",
    );
    expect(audit).toBeDefined();
    expect(audit?.body).toContain("snapshot-repair audit log");
    expect(audit?.body).toContain("append-only");
    expect(audit?.body).toContain("pattern");
    expect(audit?.body).toContain("target_path");
    expect(audit?.body).toContain("before_summary");
    expect(audit?.body).toContain("after_summary");
    expect(audit?.body).toContain("outcome");
    expect(audit?.body).toContain("recorded_at");
    expect(audit?.body).not.toContain("adv_agenda_add");
    expect(audit?.body).not.toContain("agenda");
  });
});
