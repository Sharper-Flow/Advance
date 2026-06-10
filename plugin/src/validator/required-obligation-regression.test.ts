/**
 * Required-Obligation Regression Tests
 *
 * End-to-end integration tests for the required-obligation enforcement pipeline
 * across contract typing, prep readiness, report ingestion, and release safety.
 *
 * Coverage:
 * - Typed model: requiredCritical field on ContractItem
 * - Prep readiness: checkCriticalOpsCoverage blocks planning for uncovered items
 * - Report ingestion: consumeRequiredFollowUps preserves obligation_class/severity
 * - Release safety: checkRequiredObligationReleaseBlockers + checkRequiredObligationRouting
 * - Backward compatibility: contracts without requiredCritical work as before
 */

import { beforeEach, describe, expect, test, vi } from "vitest";
import { createDefaultGates } from "../types";
import type {
  Change,
  ChangeWorkflowState,
  EngineerSubagentReport,
} from "../types";
import type { Store } from "../storage/store-types";
import {
  checkCriticalOpsCoverage,
  runPrepReadinessChecks,
} from "./prep-readiness";
import {
  checkRequiredObligationReleaseBlockers,
  checkRequiredObligationRouting,
  evaluateGateReadiness,
} from "../temporal/gate-readiness";

// =============================================================================
// Mocks (mirrors subagent-report.test.ts pattern for tool-layer ingestion)
// =============================================================================

const mocks = vi.hoisted(() => {
  const fireSignalAndRefresh = vi.fn(async () => undefined);
  const workflowHandle = { signal: vi.fn(), query: vi.fn() };
  const addAgendaItem = vi.fn(async (_root: string, title: string) => ({
    id: `ag-${title.length}`,
    title,
    status: "pending",
  }));

  return {
    fireSignalAndRefresh,
    workflowHandle,
    addAgendaItem,
  };
});

vi.mock("../tools/_adapters", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../tools/_adapters")>()),
  fireSignalAndRefresh: mocks.fireSignalAndRefresh,
  getChangeHandle: () => mocks.workflowHandle,
}));

vi.mock("../temporal/service", () => ({
  getService: () => ({ client: { workflow: { getHandle: vi.fn() } } }),
}));

vi.mock("../utils/project-id", () => ({
  getProjectId: async () => "project-1",
}));

vi.mock("../storage/agenda", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../storage/agenda")>()),
  addAgendaItem: mocks.addAgendaItem,
}));

// Import tool layer AFTER mocks are established
import { subagentReportTools } from "../tools/subagent-report";

// =============================================================================
// Helpers
// =============================================================================

function makeChangeWorkflowState(
  overrides: Partial<ChangeWorkflowState> = {},
): ChangeWorkflowState {
  return {
    projectId: "project-1",
    changeId: "change-1",
    title: "Test change",
    initializedAt: "2026-05-20T00:00:00.000Z",
    id: "change-1",
    status: "draft",
    createdAt: "2026-05-20T00:00:00.000Z",
    tasks: [],
    deltas: {},
    wisdom: [],
    gates: createDefaultGates(),
    artifacts: {},
    ...overrides,
  };
}

function releaseReadyGates() {
  const gates = createDefaultGates();
  gates.proposal.status = "done";
  gates.discovery.status = "done";
  gates.design.status = "done";
  gates.planning.status = "done";
  gates.execution.status = "done";
  gates.acceptance.status = "done";
  return gates;
}

function makeContract(
  items: Array<
    Partial<NonNullable<ChangeWorkflowState["contract"]>["items"][number]> & {
      id: string;
    }
  >,
  reviewMatrixRows?: Array<{
    contractId: string;
    status: string;
    evidencePolicy?: string;
  }>,
): NonNullable<ChangeWorkflowState["contract"]> {
  return {
    version: 1,
    rigor: "standard",
    source: { artifact: "agreement", approvedAt: "2026-05-20T00:00:00.000Z" },
    items: items.map((it) => ({
      kind: "acceptance_criterion",
      text: it.id,
      sourceArtifact: "agreement",
      verificationRequired: true,
      evidencePolicy: "test",
      status: "approved",
      ...it,
    })),
    ...(reviewMatrixRows
      ? {
          reviewMatrix: {
            reviewedAt: "2026-05-20T00:00:00.000Z",
            rows: reviewMatrixRows.map((r) => ({
              contractId: r.contractId,
              kind: "acceptance_criterion",
              status: r.status,
              evidencePolicy: r.evidencePolicy ?? "test",
              evidence: "reviewed",
            })),
          },
        }
      : {}),
    amendments: [],
  };
}

function buildChangeWithContract(
  items: Array<{
    id: string;
    requiredCritical?: boolean;
    notRequiredReason?: string;
    kind?: string;
    verificationRequired?: boolean;
  }>,
  tasks: Array<{
    id: string;
    status: string;
    contract_refs?: {
      implements?: string[];
      verifies?: string[];
    };
  }>,
): Change {
  return {
    id: "c-critical",
    title: "Critical ops fixture",
    status: "active",
    created_at: "2026-06-02T00:00:00.000Z",
    deltas: {},
    contract: {
      version: 1,
      rigor: "standard",
      source: { artifact: "agreement", approvedAt: "2026-06-02T00:00:00.000Z" },
      items: items.map((it) => ({
        id: it.id,
        kind: (it.kind as any) ?? "acceptance_criterion",
        text: it.id,
        sourceArtifact: "agreement",
        evidencePolicy: "test",
        verificationRequired: it.verificationRequired !== false,
        ...(it.requiredCritical !== undefined && {
          requiredCritical: it.requiredCritical,
        }),
        ...(it.notRequiredReason !== undefined && {
          notRequiredReason: it.notRequiredReason,
        }),
      })),
    },
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.id,
      status: t.status,
      deps: [],
      metadata: {},
      ...(t.contract_refs && { contract_refs: t.contract_refs }),
    })),
  } as unknown as Change;
}

function engineerReport(
  overrides: Partial<EngineerSubagentReport> = {},
): EngineerSubagentReport {
  return {
    schema_version: "1.0",
    change_id: "change-1",
    task_id: "tk-1",
    attempt: 1,
    agent: "adv-engineer",
    status: "complete",
    scope: { kind: "task", task_id: "tk-1" },
    workdir_used: "/repo",
    files_touched: ["src/a.ts"],
    verification: [{ command: "pnpm test", exit_code: 0, summary: "passed" }],
    decisions: [{ what: "Used typed tool", why: "Durable state" }],
    blockers: [],
    scope_drift: null,
    follow_ups: [],
    required_main_agent_actions: [],
    related_scan: "No same-pattern issues",
    context_update_for_adv: {
      what_ads_needs_to_know: "Report submitted",
      suggested_next_action: "Continue",
    },
    ...overrides,
  };
}

function storeFor(baseChange: Change): Store {
  return {
    paths: {
      root: "/repo",
      agenda: "/state/agenda.jsonl",
    } as Store["paths"],
    config: null,
    init: vi.fn(),
    sync: vi.fn(),
    close: vi.fn(),
    flush: vi.fn(),
    changes: {
      get: vi.fn(async () => ({ success: true, data: baseChange })),
      refresh: vi.fn(async () => undefined),
    },
  } as unknown as Store;
}

function parse(output: string): Record<string, any> {
  return JSON.parse(output) as Record<string, any>;
}

// =============================================================================
// Full Pipeline Tests
// =============================================================================

describe("required-obligation end-to-end pipeline", () => {
  describe("happy path: requiredCritical → coverage → review → release", () => {
    test("prep blocks when requiredCritical item has no task coverage", () => {
      const change = buildChangeWithContract(
        [{ id: "RC-1", requiredCritical: true }],
        [],
      );
      const result = runPrepReadinessChecks(change, "strict");

      expect(result.passed).toBe(false);
      expect(result.mustFailures).toContainEqual(
        expect.objectContaining({
          code: "CRITICAL_OPS_UNCOVERED",
          severity: "error",
          details: expect.objectContaining({ contractId: "RC-1" }),
        }),
      );
    });

    test("prep passes after task coverage is added", () => {
      const change = buildChangeWithContract(
        [{ id: "RC-1", requiredCritical: true }],
        [
          {
            id: "tk-1",
            status: "pending",
            contract_refs: { implements: ["RC-1"] },
          },
        ],
      );
      const result = runPrepReadinessChecks(change, "strict");

      expect(
        result.mustFailures.some((i) => i.code === "CRITICAL_OPS_UNCOVERED"),
      ).toBe(false);
    });

    test("release passes when requiredCritical item has passing review matrix", () => {
      const result = evaluateGateReadiness(
        makeChangeWorkflowState({
          gates: releaseReadyGates(),
          contract: makeContract(
            [{ id: "RC-1", requiredCritical: true }],
            [{ contractId: "RC-1", status: "pass" }],
          ),
        }),
        "release",
      );

      expect(result.ready).toBe(true);
      expect(
        result.blockers.some((b) => b.code.startsWith("REQUIRED_OBLIGATION")),
      ).toBe(false);
    });
  });

  describe("negative path: silently deferred requiredCritical", () => {
    test("prep blocks for uncovered requiredCritical", () => {
      const change = buildChangeWithContract(
        [{ id: "RC-1", requiredCritical: true }],
        [],
      );
      const prepResult = runPrepReadinessChecks(change, "strict");
      expect(prepResult.passed).toBe(false);
      expect(prepResult.mustFailures).toContainEqual(
        expect.objectContaining({ code: "CRITICAL_OPS_UNCOVERED" }),
      );
    });

    test("release blocks for silently deferred requiredCritical (no row, no coverage)", () => {
      const result = evaluateGateReadiness(
        makeChangeWorkflowState({
          gates: releaseReadyGates(),
          contract: makeContract(
            [{ id: "RC-1", requiredCritical: true }],
            // review matrix present but missing RC-1 row
            [{ contractId: "RC-2", status: "pass" }],
          ),
        }),
        "release",
      );

      expect(result.ready).toBe(false);
      expect(result.blockers).toContainEqual(
        expect.objectContaining({
          code: "REQUIRED_OBLIGATION_NOT_ROUTED",
          gateId: "release",
          contractId: "RC-1",
        }),
      );
    });

    test("release also blocks for requiredCritical with failing review status", () => {
      const result = evaluateGateReadiness(
        makeChangeWorkflowState({
          gates: releaseReadyGates(),
          contract: makeContract(
            [{ id: "RC-1", requiredCritical: true }],
            [{ contractId: "RC-1", status: "fail" }],
          ),
        }),
        "release",
      );

      expect(result.ready).toBe(false);
      expect(result.blockers).toContainEqual(
        expect.objectContaining({
          code: "REQUIRED_OBLIGATION_UNRESOLVED",
          gateId: "release",
          contractId: "RC-1",
        }),
      );
    });
  });
});

// =============================================================================
// Cross-Cutting Enforcement Tests
// =============================================================================

describe("checkCriticalOpsCoverage", () => {
  test("identifies uncovered requiredCritical items", () => {
    const change = buildChangeWithContract(
      [
        { id: "RC-1", requiredCritical: true },
        { id: "RC-2", requiredCritical: true },
      ],
      [
        {
          id: "tk-1",
          status: "pending",
          contract_refs: { implements: ["RC-1"] },
        },
      ],
    );
    const issues = checkCriticalOpsCoverage(change);

    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("CRITICAL_OPS_UNCOVERED");
    expect(issues[0].details).toMatchObject({ contractId: "RC-2" });
  });

  test("ignores non-requiredCritical items without coverage", () => {
    const change = buildChangeWithContract(
      [
        { id: "AC-1", requiredCritical: false },
        { id: "AC-2" }, // requiredCritical undefined
      ],
      [],
    );
    const issues = checkCriticalOpsCoverage(change);
    expect(issues).toHaveLength(0);
  });
});

describe("checkRequiredObligationReleaseBlockers", () => {
  test("blocks release for failing requiredCritical review row", () => {
    const state = makeChangeWorkflowState({
      contract: makeContract(
        [{ id: "RC-1", requiredCritical: true }],
        [{ contractId: "RC-1", status: "fail" }],
      ),
    });
    const blockers = checkRequiredObligationReleaseBlockers(state, "release");

    expect(blockers).toHaveLength(1);
    expect(blockers[0].code).toBe("REQUIRED_OBLIGATION_UNRESOLVED");
  });

  test("blocks release for 'unknown' review status", () => {
    const state = makeChangeWorkflowState({
      contract: makeContract(
        [{ id: "RC-1", requiredCritical: true }],
        [{ contractId: "RC-1", status: "unknown" }],
      ),
    });
    const blockers = checkRequiredObligationReleaseBlockers(state, "release");

    expect(blockers).toHaveLength(1);
    expect(blockers[0].code).toBe("REQUIRED_OBLIGATION_UNRESOLVED");
  });

  test("does not block for 'violated' non-requiredCritical items", () => {
    const state = makeChangeWorkflowState({
      contract: makeContract(
        [
          { id: "RC-1", requiredCritical: false },
          { id: "RC-2", requiredCritical: true },
        ],
        [
          { contractId: "RC-1", status: "violated" },
          { contractId: "RC-2", status: "pass" },
        ],
      ),
    });
    const blockers = checkRequiredObligationReleaseBlockers(state, "release");
    expect(blockers).toHaveLength(0);
  });

  test("no-op for non-release gates", () => {
    const state = makeChangeWorkflowState({
      contract: makeContract(
        [{ id: "RC-1", requiredCritical: true }],
        [{ contractId: "RC-1", status: "fail" }],
      ),
    });
    for (const gateId of [
      "proposal",
      "discovery",
      "design",
      "planning",
      "execution",
      "acceptance",
    ] as const) {
      expect(
        checkRequiredObligationReleaseBlockers(state, gateId),
      ).toHaveLength(0);
    }
  });
});

describe("checkRequiredObligationRouting", () => {
  test("blocks release for requiredCritical with no row and no task coverage", () => {
    const state = makeChangeWorkflowState({
      contract: makeContract(
        [{ id: "RC-1", requiredCritical: true }],
        [], // no review matrix rows at all
      ),
    });
    const blockers = checkRequiredObligationRouting(state, "release");

    expect(blockers).toHaveLength(1);
    expect(blockers[0].code).toBe("REQUIRED_OBLIGATION_NOT_ROUTED");
  });

  test("allows release when task coverage exists even without review row", () => {
    const state = makeChangeWorkflowState({
      tasks: [
        {
          id: "tk-cover",
          title: "Cover RC-1",
          status: "done",
          createdAt: "2026-05-20T00:00:00.000Z",
          updatedAt: "2026-05-20T00:00:00.000Z",
          contract_refs: { verifies: ["RC-1"] },
        },
      ],
      contract: makeContract([{ id: "RC-1", requiredCritical: true }], []),
    });
    const blockers = checkRequiredObligationRouting(state, "release");
    expect(blockers).toHaveLength(0);
  });

  test("allows release when notRequiredReason is set", () => {
    const state = makeChangeWorkflowState({
      contract: makeContract(
        [
          {
            id: "RC-1",
            requiredCritical: true,
            notRequiredReason: "Handled upstream.",
          },
        ],
        [],
      ),
    });
    const blockers = checkRequiredObligationRouting(state, "release");
    expect(blockers).toHaveLength(0);
  });

  test("allows release when review matrix row exists", () => {
    const state = makeChangeWorkflowState({
      contract: makeContract(
        [{ id: "RC-1", requiredCritical: true }],
        [{ contractId: "RC-1", status: "pass" }],
      ),
    });
    const blockers = checkRequiredObligationRouting(state, "release");
    expect(blockers).toHaveLength(0);
  });

  test("no-op for non-release gates", () => {
    const state = makeChangeWorkflowState({
      contract: makeContract([{ id: "RC-1", requiredCritical: true }], []),
    });
    for (const gateId of [
      "proposal",
      "discovery",
      "design",
      "planning",
      "execution",
      "acceptance",
    ] as const) {
      expect(checkRequiredObligationRouting(state, gateId)).toHaveLength(0);
    }
  });
});

// =============================================================================
// Report Ingestion Tests
// =============================================================================

describe("required_follow_ups report ingestion", () => {
  beforeEach(() => {
    mocks.fireSignalAndRefresh.mockClear();
    mocks.addAgendaItem.mockClear();
  });

  test("required_critical creates agenda item with priority critical", async () => {
    const store = storeFor(
      buildChangeWithContract([], [{ id: "tk-1", status: "pending" }]),
    );
    const report = engineerReport({
      follow_ups: [],
      required_follow_ups: [
        {
          text: "Fix security vulnerability",
          obligation_class: "required_critical",
          severity: "critical",
          source_contract_id: "contract-sec-1",
        },
      ],
    });

    const output = parse(
      await subagentReportTools.adv_subagent_report_submit.execute(
        { report },
        store,
      ),
    );

    expect(output.success).toBe(true);
    expect(mocks.addAgendaItem).toHaveBeenCalledWith(
      "/repo",
      "Fix security vulnerability",
      expect.objectContaining({
        priority: "critical",
        category: "required-obligation",
        description: expect.stringContaining("Obligation: required_critical"),
      }),
    );
    expect(mocks.addAgendaItem.mock.calls[0][2].description).toContain(
      "Contract: contract-sec-1",
    );
  });

  test("severity high creates agenda item with priority high", async () => {
    const store = storeFor(
      buildChangeWithContract([], [{ id: "tk-1", status: "pending" }]),
    );
    const report = engineerReport({
      follow_ups: [],
      required_follow_ups: [
        {
          text: "Update documentation",
          obligation_class: "required_standard",
          severity: "high",
        },
      ],
    });

    const output = parse(
      await subagentReportTools.adv_subagent_report_submit.execute(
        { report },
        store,
      ),
    );

    expect(output.success).toBe(true);
    expect(mocks.addAgendaItem).toHaveBeenCalledWith(
      "/repo",
      "Update documentation",
      expect.objectContaining({
        priority: "high",
        category: "required-obligation",
      }),
    );
  });

  test("report without required_follow_ups creates no required agenda items", async () => {
    const store = storeFor(
      buildChangeWithContract([], [{ id: "tk-1", status: "pending" }]),
    );
    const report = engineerReport({
      follow_ups: ["Regular follow-up"],
    });

    const output = parse(
      await subagentReportTools.adv_subagent_report_submit.execute(
        { report },
        store,
      ),
    );

    expect(output.success).toBe(true);
    // Should have exactly 1 call for the regular follow-up
    expect(mocks.addAgendaItem).toHaveBeenCalledTimes(1);
    expect(mocks.addAgendaItem).toHaveBeenCalledWith(
      "/repo",
      "Regular follow-up",
      expect.objectContaining({
        category: "subagent-followup",
      }),
    );
  });

  test("preserves severity mapping from report to agenda", async () => {
    const store = storeFor(
      buildChangeWithContract([], [{ id: "tk-1", status: "pending" }]),
    );
    const report = engineerReport({
      follow_ups: [],
      required_follow_ups: [
        {
          text: "A",
          obligation_class: "required_critical",
          severity: "critical",
        },
        { text: "B", obligation_class: "required_standard", severity: "high" },
      ],
    });

    const output = parse(
      await subagentReportTools.adv_subagent_report_submit.execute(
        { report },
        store,
      ),
    );

    expect(output.success).toBe(true);
    expect(mocks.addAgendaItem).toHaveBeenCalledTimes(2);
    const calls = mocks.addAgendaItem.mock.calls;
    const priorities = calls.map((c: any[]) => c[2].priority);
    expect(priorities).toContain("critical");
    expect(priorities).toContain("high");
  });

  test("report with both follow_ups and required_follow_ups creates both types", async () => {
    const store = storeFor(
      buildChangeWithContract([], [{ id: "tk-1", status: "pending" }]),
    );
    const report = engineerReport({
      follow_ups: ["Advisory follow-up"],
      required_follow_ups: [
        {
          text: "Required follow-up",
          obligation_class: "required_critical",
          severity: "critical",
        },
      ],
    });

    const output = parse(
      await subagentReportTools.adv_subagent_report_submit.execute(
        { report },
        store,
      ),
    );

    expect(output.success).toBe(true);
    expect(mocks.addAgendaItem).toHaveBeenCalledTimes(2);

    const categories = mocks.addAgendaItem.mock.calls.map(
      (c: any[]) => c[2].category,
    );
    expect(categories).toContain("subagent-followup");
    expect(categories).toContain("required-obligation");
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe("edge cases", () => {
  test("mixed contract: requiredCritical and non-requiredCritical items", () => {
    const change = buildChangeWithContract(
      [
        { id: "RC-1", requiredCritical: true },
        { id: "AC-1", requiredCritical: false },
        { id: "AC-2" },
      ],
      [
        {
          id: "tk-1",
          status: "pending",
          contract_refs: { implements: ["RC-1"] },
        },
      ],
    );
    const issues = checkCriticalOpsCoverage(change);
    expect(issues).toHaveLength(0);
  });

  test("requiredCritical with notRequiredReason is exempt from prep coverage check", () => {
    const change = buildChangeWithContract(
      [
        {
          id: "RC-1",
          requiredCritical: true,
          notRequiredReason: "Covered by upstream contract",
        },
      ],
      [],
    );
    const issues = checkCriticalOpsCoverage(change);
    expect(issues).toHaveLength(0);
  });

  test("requiredCritical with verificationRequired:false still needs coverage", () => {
    const change = buildChangeWithContract(
      [{ id: "RC-1", requiredCritical: true, verificationRequired: false }],
      [],
    );
    const issues = checkCriticalOpsCoverage(change);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("CRITICAL_OPS_UNCOVERED");
  });

  test("cancelled tasks do not count as coverage", () => {
    const change = buildChangeWithContract(
      [{ id: "RC-1", requiredCritical: true }],
      [
        {
          id: "tk-1",
          status: "cancelled",
          contract_refs: { verifies: ["RC-1"] },
        },
      ],
    );
    const issues = checkCriticalOpsCoverage(change);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("CRITICAL_OPS_UNCOVERED");
  });

  test("backward compatibility: contracts without requiredCritical field work as before", () => {
    const change = buildChangeWithContract(
      [{ id: "AC-1" }, { id: "AC-2" }],
      [],
    );
    const issues = checkCriticalOpsCoverage(change);
    expect(issues).toHaveLength(0);

    const result = evaluateGateReadiness(
      makeChangeWorkflowState({
        gates: releaseReadyGates(),
        contract: makeContract(
          [{ id: "AC-1" }, { id: "AC-2" }],
          [
            { contractId: "AC-1", status: "pass" },
            { contractId: "AC-2", status: "pass" },
          ],
        ),
      }),
      "release",
    );
    expect(result.ready).toBe(true);
  });

  test("existing non-requiredCritical items are not affected by new release checks", () => {
    const state = makeChangeWorkflowState({
      gates: releaseReadyGates(),
      contract: makeContract(
        [{ id: "AC-1", requiredCritical: false }, { id: "AC-2" }],
        [
          { contractId: "AC-1", status: "fail" },
          { contractId: "AC-2", status: "violated" },
        ],
      ),
    });
    const blockers = checkRequiredObligationReleaseBlockers(state, "release");
    expect(blockers).toHaveLength(0);
  });

  test("requiredCritical item with implements coverage passes prep", () => {
    const change = buildChangeWithContract(
      [{ id: "RC-1", requiredCritical: true }],
      [
        {
          id: "tk-1",
          status: "pending",
          contract_refs: { implements: ["RC-1"] },
        },
      ],
    );
    const issues = checkCriticalOpsCoverage(change);
    expect(issues).toHaveLength(0);
  });

  test("requiredCritical item with verifies coverage passes prep", () => {
    const change = buildChangeWithContract(
      [{ id: "RC-1", requiredCritical: true }],
      [
        {
          id: "tk-1",
          status: "pending",
          contract_refs: { verifies: ["RC-1"] },
        },
      ],
    );
    const issues = checkCriticalOpsCoverage(change);
    expect(issues).toHaveLength(0);
  });

  test("multiple requiredCritical items: some covered, some not", () => {
    const change = buildChangeWithContract(
      [
        { id: "RC-1", requiredCritical: true },
        { id: "RC-2", requiredCritical: true },
        { id: "RC-3", requiredCritical: true },
      ],
      [
        {
          id: "tk-1",
          status: "pending",
          contract_refs: { implements: ["RC-1"] },
        },
        {
          id: "tk-2",
          status: "pending",
          contract_refs: { verifies: ["RC-2"] },
        },
      ],
    );
    const issues = checkCriticalOpsCoverage(change);
    expect(issues).toHaveLength(1);
    expect(issues[0].details).toMatchObject({ contractId: "RC-3" });
  });
});
