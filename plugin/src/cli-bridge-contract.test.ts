import { describe, expect, test } from "vitest";
import { readFileSync } from "fs";
import { join, resolve } from "path";
import { ADV_TOOL_NAMES } from "./tool-registry";

const REPO_ROOT = resolve(__dirname, "../..");
const ADVANCE_META_SPEC = join(REPO_ROOT, ".adv/specs/advance-meta/spec.json");
const ADV_CLI = join(REPO_ROOT, "bin/adv");
const ADV_STATUS_LIVE = join(REPO_ROOT, "bin/lib/live-status.ts");
const ADV_ROADMAP = join(REPO_ROOT, "bin/lib/roadmap.ts");
const ADV_EPIC_LIST = join(REPO_ROOT, "bin/lib/epic-list.ts");

function readAdvanceMetaSpec(): {
  requirements?: Array<{
    id?: string;
    priority?: string;
    body?: string;
    scenarios?: Array<{ id?: string }>;
  }>;
} {
  return JSON.parse(readFileSync(ADVANCE_META_SPEC, "utf8"));
}

interface BridgeCase {
  command: string;
  token: string;
  specId: string;
}

const BRIDGES: BridgeCase[] = [
  {
    command: ".opencode/command/adv-status.md",
    token: "!`adv status --no-color`",
    specId: "rq-statusCliBridge01",
  },
  {
    command: ".opencode/command/adv-roadmap.md",
    token: "!`adv roadmap --no-color`",
    specId: "rq-roadmapCliBridge01",
  },
];

const FORBIDDEN_FANOUT_TOKENS = [
  "adv_status",
  "adv_roadmap",
  "adv_backlog_state",
  "adv_change_list",
  "adv_change_show",
  "adv_gate_status",
  "adv_spec",
  "Recommendations:",
  "active_change",
];

describe("CLI bridge command contracts", () => {
  for (const bridge of BRIDGES) {
    const absPath = join(REPO_ROOT, bridge.command);
    const name = bridge.command.split("/").pop() ?? bridge.command;

    describe(name, () => {
      test("bridge token is present", () => {
        const content = readFileSync(absPath, "utf8");
        expect(content).toContain(bridge.token);
      });

      test("requires verbatim output and forbids analysis", () => {
        const content = readFileSync(absPath, "utf8");
        expect(content).toMatch(/return this command output verbatim/i);
        expect(content).toMatch(/do not analyze/i);
        expect(content).toMatch(/do not .*recommendations/i);
      });

      test("does not instruct ADV MCP fanout", () => {
        const content = readFileSync(absPath, "utf8");
        const found = FORBIDDEN_FANOUT_TOKENS.filter((token) =>
          content.includes(token),
        );
        expect(
          found,
          `${name} must stay a CLI bridge, not a prompt-driven workflow`,
        ).toEqual([]);
      });

      test(`advance-meta spec pins ${bridge.specId}`, () => {
        const spec = readAdvanceMetaSpec();
        const requirement = spec.requirements?.find(
          (item) => item.id === bridge.specId,
        );
        expect(requirement).toMatchObject({
          id: bridge.specId,
          priority: "must",
        });
        expect(requirement?.scenarios?.map((s) => s.id)).toEqual([
          `${bridge.specId}.1`,
          `${bridge.specId}.2`,
          `${bridge.specId}.3`,
        ]);
      });
    });
  }

  test("status bridge law requires live-default status with no silent stale fallback", () => {
    const spec = readAdvanceMetaSpec();
    const requirement = spec.requirements?.find(
      (item) => item.id === "rq-statusCliBridge01",
    );
    const body = requirement?.body ?? "";
    const scenarioText = JSON.stringify(requirement?.scenarios ?? []);
    const lawText = `${body}\n${scenarioText}`;

    expect(lawText).toMatch(/live Temporal-backed/i);
    expect(lawText).toMatch(/fail(?:s)? closed/i);
    expect(lawText).toMatch(/no silent stale|silently render stale/i);
    expect(lawText).toMatch(/disk projections? .*not .*active/i);
    expect(lawText).not.toMatch(
      /Detailed operational diagnostics remain available only/i,
    );
  });
});

describe("REGISTRY NO-REMOVAL GUARD (AC6/DONT1)", () => {
  test("ADV_TOOL_NAMES matches frozen snapshot", () => {
    const frozen: readonly string[] = [
      "adv_spec",
      "adv_roadmap",
      "adv_backlog_state",
      "adv_wip_state",
      "adv_change_list",
      "adv_change_show",
      "adv_change_create",
      "adv_change_update",
      "adv_change_close",
      "adv_change_bulk_close",
      "adv_change_validate",
      "adv_change_archive",
      "adv_archive_repair",
      "adv_change_status_repair",
      "adv_change_update_issues",
      "adv_change_reenter",
      "adv_change_forget",
      "adv_epic_create",
      "adv_epic_show",
      "adv_epic_list",
      "adv_epic_update",
      "adv_epic_add_shell",
      "adv_epic_promote_shell",
      "adv_epic_link_change",
      "adv_epic_unlink_change",
      "adv_epic_move_change",
      "adv_epic_repair_membership",
      "adv_epic_reorder",
      "adv_followup_promote",
      "adv_ops_evidence_add",
      "adv_contract_mint",
      "adv_contract_review_matrix_set",
      "adv_design_concern_disposition",
      "adv_task_show",
      "adv_task_list",
      "adv_task_ready",
      "adv_task_update",
      "adv_task_add",
      "adv_task_cancel",
      "adv_task_reclassify_tdd",
      "adv_subagent_report_submit",
      "adv_wisdom_add",
      "adv_wisdom_list",
      "adv_project_wisdom_list",
      "adv_status",
      "adv_agenda_list",
      "adv_agenda_add",
      "adv_agenda_start",
      "adv_agenda_complete",
      "adv_agenda_cancel",
      "adv_agenda_prioritize",
      "adv_project_context",
      "adv_project_metadata",
      "adv_gate_status",
      "adv_gate_complete",
      "adv_run_test",
      "adv_temporal_diagnose",
      "adv_temporal_register_search_attributes",
      "adv_temporal_reconnect",
      "adv_temporal_worker_restart",
      "adv_task_checkpoint",
      "adv_reflection_list",
      "adv_reflect",
      "adv_conformance",
      "adv_worktree_create",
      "adv_worktree_resume",
      "adv_worktree_delete",
      "adv_worktree_cleanup",
      "adv_worktree_triage",
      "adv_session_list",
      "adv_session_show",
      "adv_snapshot_health",
    ];
    expect(ADV_TOOL_NAMES).toEqual(frozen);
  });
});

describe("NO-CLI-MUTATION GUARD (AC9/DONT3)", () => {
  test("bin/adv dispatch only recognizes safe subcommands", () => {
    const content = readFileSync(ADV_CLI, "utf8");

    const allowedDispatch = ["status", "roadmap"];
    const allowedGlobalFlags = ["help", "version"];
    const forbidden = [
      "create",
      "update",
      "close",
      "archive",
      "gate",
      "task",
      "delete",
      "reenter",
      "mint",
      "lock",
      "unlock",
    ];

    // Sanity: allowed subcommand dispatch strings are present
    for (const sub of allowedDispatch) {
      expect(content).toContain(`"${sub}"`);
    }

    // Sanity: global flags / functions are present
    for (const sub of allowedGlobalFlags) {
      expect(
        content.includes(`run${sub.charAt(0).toUpperCase() + sub.slice(1)}`) ||
          content.includes(`"${sub}"`),
      ).toBe(true);
    }

    // Forbidden mutation verbs must not appear as subcommand dispatch strings.
    // We look for the exact dispatch pattern (=== "verb") to avoid false
    // positives from variable names like archiveDir.
    const found = forbidden.filter((verb) => content.includes(`=== "${verb}"`));
    expect(
      found,
      "bin/adv must not contain mutation subcommand dispatch",
    ).toEqual([]);
  });

  test("epic CLI namespace only exposes read-only list dispatch", () => {
    const content = readFileSync(ADV_CLI, "utf8");
    const epicList = readFileSync(ADV_EPIC_LIST, "utf8");

    expect(content).toContain("EPIC_READ_ONLY_SUBCOMMANDS");
    expect(content).toContain('"list"');

    const forbidden = [
      "create",
      "update",
      "delete",
      "archive",
      "close",
      "gate",
      "task",
    ];
    const nestedDispatch = forbidden.filter(
      (verb) =>
        content.includes(`nested === "${verb}"`) ||
        content.includes(`EPIC_READ_ONLY_SUBCOMMANDS.has("${verb}")`),
    );
    expect(nestedDispatch, "epic namespace must remain read-only").toEqual([]);

    expect(epicList).toContain("listEpicWorkflowIds");
    expect(epicList).not.toContain("getHandle(");
    expect(epicList).not.toContain("readFile");
  });
});

describe("STATUS LIVE DEFAULT GUARDS (AC8/AC9/AC10)", () => {
  test("status live client does not import workflow sandbox modules", () => {
    const content = readFileSync(ADV_STATUS_LIVE, "utf8");
    const forbidden = [
      "@temporalio/workflow",
      "temporal/messages",
      "temporal/workflows",
      "./messages",
      "./workflows",
    ];

    expect(forbidden.filter((token) => content.includes(token))).toEqual([]);
  });

  test("advance-meta pins the worker-free Visibility status read law", () => {
    const spec = readAdvanceMetaSpec();
    const requirement = spec.requirements?.find(
      (item) => item.id === "rq-statusCliWorkerFree01",
    );
    expect(requirement).toMatchObject({
      id: "rq-statusCliWorkerFree01",
      priority: "must",
    });
    expect(requirement?.scenarios?.map((s) => s.id)).toEqual([
      "rq-statusCliWorkerFree01.1",
      "rq-statusCliWorkerFree01.2",
    ]);
  });

  test("default status table reads Visibility search attributes, not per-workflow query", () => {
    const cli = readFileSync(ADV_CLI, "utf8");
    const liveStatus = readFileSync(ADV_STATUS_LIVE, "utf8");

    // The CLI default status path must use the worker-free Visibility
    // search-attribute reader, not the per-change getState workflow query
    // (which depends on a live per-project worker).
    expect(cli).toContain("loadLiveSummaries");
    expect(cli).not.toContain("loadLiveStatus(");

    // The Visibility reader builds rows from upserted change search
    // attributes and synthesizes gate progress from AdvCurrentGate.
    expect(liveStatus).toContain("summariesFromVisibility");
    expect(liveStatus).toContain("buildSummaryFromSearchAttributes");
    expect(liveStatus).toContain("AdvCurrentGate");
    expect(liveStatus).toContain("AdvAffectedProjects");
  });

  test("advance-meta pins dashboard worker-free routine refresh law", () => {
    const spec = readAdvanceMetaSpec();
    const requirement = spec.requirements?.find(
      (item) => item.id === "rq-dashboardWorkerFree01",
    );
    expect(requirement).toMatchObject({
      id: "rq-dashboardWorkerFree01",
      priority: "must",
    });
    expect(requirement?.body).toContain("/api/state");
    expect(requirement?.body).toContain(
      "per-change `getState` workflow queries",
    );
    expect(requirement?.scenarios?.map((s) => s.id)).toEqual([
      "rq-dashboardWorkerFree01.1",
      "rq-dashboardWorkerFree01.2",
      "rq-dashboardWorkerFree01.3",
      "rq-dashboardWorkerFree01.4",
    ]);
  });

  test("default status active rows are not loaded from disk changes directory", () => {
    const content = readFileSync(ADV_CLI, "utf8");

    expect(content).not.toContain('join(root, "changes")');
    expect(content).not.toContain("isDashboardActiveStatus");
  });

  test("roadmap file-snapshot bridge behavior remains unchanged", () => {
    const roadmapCommand = readFileSync(
      join(REPO_ROOT, ".opencode/command/adv-roadmap.md"),
      "utf8",
    );
    const roadmapCli = readFileSync(ADV_ROADMAP, "utf8");

    expect(roadmapCommand).toContain("!`adv roadmap --no-color`");
    expect(roadmapCli).toContain("unavailable_cli_file_mode");
  });

  test("status live implementation has no mutation authority", () => {
    const content = `${readFileSync(ADV_CLI, "utf8")}\n${readFileSync(
      ADV_STATUS_LIVE,
      "utf8",
    )}`;
    const forbidden = [
      ".signal(",
      ".start(",
      "executeUpdate",
      "taskAdded",
      "taskUpdated",
      "gateCompleted",
      '=== "archive"',
      '=== "cancel"',
      "temporal_worker_restart",
      "worker_restart",
    ];

    expect(forbidden.filter((token) => content.includes(token))).toEqual([]);
  });
});
