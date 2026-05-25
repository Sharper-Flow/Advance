import { describe, expect, test } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { SpecSchema } from "./types";

const REPO_ROOT = resolve(__dirname, "../..");
const SUBAGENT_REPORTS_SPEC = join(
  REPO_ROOT,
  ".adv/specs/subagent-reports/spec.json",
);
const DELEGATION_DEFAULTS_SPEC = join(
  REPO_ROOT,
  ".adv/specs/delegation-defaults/spec.json",
);

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

describe("subagent reports spec assets", () => {
  test("subagent-reports spec exists and parses as a Spec", () => {
    expect(existsSync(SUBAGENT_REPORTS_SPEC)).toBe(true);
    const spec = SpecSchema.parse(readJson(SUBAGENT_REPORTS_SPEC));

    expect(spec.name).toBe("subagent-reports");
    expect(
      (spec as { conformance_required?: boolean }).conformance_required,
    ).toBe(false);
    expect(spec.requirements.map((req) => req.id)).toEqual([
      "rq-subagentReports01",
      "rq-subagentReports02",
      "rq-subagentReports03",
      "rq-subagentReports04",
      "rq-subagentReports05",
      "rq-subagentReports06",
      "rq-subagentReports07",
      "rq-subagentReports08",
      "rq-subagentReports09",
    ]);
  });

  test("subagent-reports law pins sidecar report persistence and legacy short-circuit", () => {
    const content = readFileSync(SUBAGENT_REPORTS_SPEC, "utf8");
    for (const anchor of [
      "adv_subagent_report_submit",
      "sidecar",
      "scope",
      "include.subagentReports",
      "ATTEMPT",
      "short-circuit",
      "conformance_required",
    ]) {
      expect(content).toContain(anchor);
    }
    expect(content).not.toContain("UNSUPPORTED_AGENT");
  });

  test("delegation-defaults rq-delDefaults05 requires typed persisted reports", () => {
    const spec = SpecSchema.parse(readJson(DELEGATION_DEFAULTS_SPEC));
    const requirement = spec.requirements.find(
      (req) => req.id === "rq-delDefaults05",
    );
    expect(requirement).toBeDefined();
    expect(requirement!.body).toContain("typed, ingest-validated, durable");
    expect(requirement!.body).toContain("adv_subagent_report_submit");
    expect(requirement!.body).toContain("sidecar");
    expect(JSON.stringify(requirement)).toContain(
      "orchestrator-submitted scanner bundle",
    );
  });

  test("subagent-reports law pins strict packet anchors and scanner lane separation", () => {
    const spec = SpecSchema.parse(readJson(SUBAGENT_REPORTS_SPEC));
    const requirement = spec.requirements.find(
      (req) => req.id === "rq-subagentReports05",
    );
    expect(requirement).toBeDefined();

    const text = JSON.stringify(requirement);
    for (const anchor of ["TASK", "PHASE", "ATTEMPT"]) {
      expect(text).toContain(anchor);
    }
    expect(text).toContain("adv-engineer");
    expect(text).toContain("adv-reviewer");
    expect(text).toContain("scanner");
    expect(text).toContain("worker");
    expect(text).toContain("INVALID_REPORT");
  });

  test("subagent-reports law defines researcher tron scanner sidecar variants", () => {
    const spec = SpecSchema.parse(readJson(SUBAGENT_REPORTS_SPEC));
    const text = JSON.stringify(spec);

    for (const anchor of [
      "adv-researcher",
      "adv-tron",
      "adv-scanner-bundle",
      "source metadata",
      "follow_ups[]",
      "agent/scope pairing",
      "Temporal replay",
    ]) {
      expect(text).toContain(anchor);
    }
  });

  test("delegation-defaults law preserves scanner isolation while allowing bundles", () => {
    const spec = SpecSchema.parse(readJson(DELEGATION_DEFAULTS_SPEC));
    const requirement = spec.requirements.find(
      (req) => req.id === "rq-delDefaults05",
    );
    const text = JSON.stringify(requirement);

    expect(text).toContain("non_persisted_scanner");
    expect(text).toContain("orchestrator-submitted scanner bundle");
    expect(text).toContain("without ADV tool access");
  });
});
