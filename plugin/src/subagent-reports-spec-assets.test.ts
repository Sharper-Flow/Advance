import { describe, expect, test } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { SpecSchema, SUBAGENT_WARN_FIRST_PACKET_ANCHORS } from "./types";

const REPO_ROOT = resolve(__dirname, "../..");
const SUBAGENT_REPORTS_SPEC = join(
  REPO_ROOT,
  ".adv/specs/subagent-reports/spec.json",
);
const DELEGATION_DEFAULTS_SPEC = join(
  REPO_ROOT,
  ".adv/specs/delegation-defaults/spec.json",
);
const AGENT_PATHS = [
  ".opencode/agents/adv.md",
  ".opencode/agents/adv-engineer.md",
  ".opencode/agents/adv-reviewer.md",
  ".opencode/agents/adv-designer.md",
  ".opencode/agents/adv-researcher.md",
  ".opencode/agents/adv-temporal-repair.md",
  ".opencode/agents/build.md",
].map((path) => join(REPO_ROOT, path));
const ARTIFACT_ACCESS_COMMANDS = [
  ".opencode/command/adv-design.md",
  ".opencode/command/adv-research.md",
  ".opencode/command/adv-refactor.md",
].map((path) => join(REPO_ROOT, path));

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
      "rq-subagentReports10",
      "rq-subagentReports11",
      "rq-subagentReports12",
      "rq-subagentReports13",
      "rq-subagentReports14",
      "rq-subagentArtifactAccess01",
      "rq-opsFollowPromotion01",
    ]);
  });

  test("worker agent policies cover artifact-wide ADV state access", () => {
    for (const agentPath of AGENT_PATHS) {
      const content = readFileSync(agentPath, "utf8");
      for (const anchor of [
        "ADV State Access Policy",
        "change.json",
        "proposal",
        "problem-statement",
        "agreement",
        "design",
        "executive-summary",
        "acceptance",
        "agenda",
        "wisdom",
        "conformance",
        "adv_change_show",
      ]) {
        expect(content, `${agentPath} missing ${anchor}`).toContain(anchor);
      }
      expect(content, `${agentPath} missing include guidance`).toMatch(
        /include:?.*(proposal|problemStatement).*agreement.*design/s,
      );
      expect(content, `${agentPath} must warn about artifact paths`).toContain(
        "artifacts.*.path",
      );
      expect(
        content,
        `${agentPath} must require readable path metadata`,
      ).toContain("readable");
    }
  });

  test("research/design/refactor command packets use included content, not artifact paths", () => {
    for (const commandPath of ARTIFACT_ACCESS_COMMANDS) {
      const content = readFileSync(commandPath, "utf8");
      expect(content, `${commandPath} missing adv_change_show`).toContain(
        "adv_change_show",
      );
      expect(content, `${commandPath} missing include guidance`).toContain(
        "include",
      );
      expect(content, `${commandPath} missing artifact path warning`).toContain(
        "artifacts.*.path",
      );
    }
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
    expect(text).toContain("adv-designer");
    expect(text).toContain("scanner");
    expect(text).toContain("worker");
    expect(text).toContain("INVALID_REPORT");
  });

  test("subagent-reports rq01 and rq06 include adv-designer as supported task-scoped variant", () => {
    const spec = SpecSchema.parse(readJson(SUBAGENT_REPORTS_SPEC));
    const rq01 = spec.requirements.find(
      (req) => req.id === "rq-subagentReports01",
    );
    const rq06 = spec.requirements.find(
      (req) => req.id === "rq-subagentReports06",
    );
    expect(rq01).toBeDefined();
    expect(rq06).toBeDefined();
    expect(rq01!.body).toContain("adv-designer");
    expect(rq06!.body).toContain("adv-designer");
    expect(rq06!.body).toContain("task-scoped");
  });

  test("subagent-reports law pins reviewer change-scope and structural-scope compatibility", () => {
    const spec = SpecSchema.parse(readJson(SUBAGENT_REPORTS_SPEC));
    const rq06 = spec.requirements.find(
      (req) => req.id === "rq-subagentReports06",
    );
    const text = JSON.stringify(rq06);

    expect(text).toContain("adv-reviewer");
    expect(text).toContain("task-scoped for remediation");
    expect(text).toContain("change-scoped for independent review and harden");
    expect(text).toContain("adv-engineer");
    expect(text).toContain("adv-designer");
    expect(text).toContain("task-scoped only");
    expect(text).toContain("adv-researcher");
    expect(text).toContain("adv-tron");
    expect(text).toContain("adv-scanner-bundle");
    expect(text).toContain("change-scoped");
  });

  test("subagent-reports law defines report-contract drift requirements", () => {
    const spec = SpecSchema.parse(readJson(SUBAGENT_REPORTS_SPEC));
    const byId = new Map(spec.requirements.map((req) => [req.id, req]));

    for (const id of [
      "rq-subagentReports10",
      "rq-subagentReports11",
      "rq-subagentReports12",
      "rq-subagentReports13",
    ]) {
      expect(byId.get(id), `${id} missing`).toBeDefined();
    }

    expect(JSON.stringify(byId.get("rq-subagentReports10"))).toContain(
      "scope_drift",
    );
    expect(JSON.stringify(byId.get("rq-subagentReports10"))).toContain(
      "required_main_agent_actions",
    );
    expect(JSON.stringify(byId.get("rq-subagentReports11"))).toContain(
      "review:acceptance",
    );
    expect(JSON.stringify(byId.get("rq-subagentReports11"))).toContain(
      "harden:release",
    );
    expect(JSON.stringify(byId.get("rq-subagentReports11"))).toContain(
      "synthetic task IDs",
    );
    expect(JSON.stringify(byId.get("rq-subagentReports12"))).toContain(
      "INVALID_TASK_ANCHOR",
    );
    expect(JSON.stringify(byId.get("rq-subagentReports13"))).toContain(
      "structural `scope`",
    );
    expect(JSON.stringify(byId.get("rq-subagentReports13"))).toContain(
      "compatibility-only",
    );
  });

  test("subagent-reports law pins warn-first scope/done/stop/verification anchors", () => {
    const spec = SpecSchema.parse(readJson(SUBAGENT_REPORTS_SPEC));
    const requirement = spec.requirements.find(
      (req) => req.id === "rq-subagentReports05",
    );
    expect(requirement).toBeDefined();

    const text = JSON.stringify(requirement);
    for (const anchor of SUBAGENT_WARN_FIRST_PACKET_ANCHORS) {
      expect(text).toContain(anchor);
    }
    expect(text).toContain("warn-first");
    expect(text).toContain("identity anchors");
    expect(text).toContain("finish owned scope if safe");
    expect(text).toContain("contract/security/release blockers");
    expect(text).toContain("Verification commands are required when possible");
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

  test("delegation-defaults apply step lists Frontend Implementation with adv-designer typed_persisted_worker contract", () => {
    const spec = readJson(DELEGATION_DEFAULTS_SPEC) as {
      delegation_matrix: Array<{
        step: string;
        allowed_subagents?: string[];
        delegated_substeps?: Array<{
          name: string;
          allowed_subagents?: string[];
          packet_contracts?: Array<{
            agent: string;
            report_transport: string;
            required_packet_anchors: string[];
            warn_packet_anchors?: string[];
          }>;
        }>;
      }>;
    };
    const apply = spec.delegation_matrix.find((row) => row.step === "apply");
    expect(apply).toBeDefined();
    expect(apply!.allowed_subagents).toContain("adv-designer");

    const frontend = (apply!.delegated_substeps ?? []).find(
      (substep) => substep.name === "Frontend Implementation",
    );
    expect(
      frontend,
      "apply step missing Frontend Implementation substep",
    ).toBeDefined();
    expect(frontend!.allowed_subagents).toEqual(["adv-designer"]);

    const designerContract = (frontend!.packet_contracts ?? []).find(
      (contract) => contract.agent === "adv-designer",
    );
    expect(designerContract).toBeDefined();
    expect(designerContract!.report_transport).toBe("typed_persisted_worker");
    expect(designerContract!.required_packet_anchors).toEqual([
      "WORKING DIRECTORY",
      "CHANGE",
      "TASK",
      "ATTEMPT",
    ]);
    expect(designerContract!.warn_packet_anchors).toEqual([
      "TASK_SCOPE",
      "IN_SCOPE",
      "OUT_OF_SCOPE",
      "DONE_WHEN",
      "STOP_WHEN",
      "VERIFICATION",
    ]);
  });

  test("delegation-defaults matrix separates strict identity anchors from warn-first contract anchors", () => {
    const spec = readJson(DELEGATION_DEFAULTS_SPEC) as {
      delegation_matrix?: Array<{
        delegated_substeps?: Array<{
          packet_contracts?: Array<{
            report_transport: string;
            required_packet_anchors: string[];
            warn_packet_anchors?: string[];
          }>;
        }>;
      }>;
    };
    const contracts = (spec.delegation_matrix ?? []).flatMap((row) =>
      (row.delegated_substeps ?? []).flatMap(
        (substep) => substep.packet_contracts ?? [],
      ),
    );

    for (const contract of contracts.filter(
      (entry) => entry.report_transport === "typed_persisted_worker",
    )) {
      expect(contract.required_packet_anchors).not.toEqual(
        expect.arrayContaining([...SUBAGENT_WARN_FIRST_PACKET_ANCHORS]),
      );
      expect(contract.warn_packet_anchors).toEqual(
        SUBAGENT_WARN_FIRST_PACKET_ANCHORS,
      );
    }

    for (const contract of contracts.filter(
      (entry) => entry.report_transport === "non_persisted_scanner",
    )) {
      expect(contract.warn_packet_anchors ?? []).toEqual([]);
    }
  });
});
