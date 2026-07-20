import { describe, expect, test } from "vitest";
import {
  createDefaultGates,
  type Change,
  type Spec,
  type Task,
} from "../types";
import { validateChange } from "./validator";
import { projectContractCoverage } from "./contract";

const createdAt = "2026-05-08T00:00:00.000Z";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "tk-1",
    title: "Implement AC1",
    type: "code",
    status: "pending",
    priority: 0,
    created_at: createdAt,
    ...overrides,
  };
}

function change(overrides: Partial<Change> = {}): Change {
  return {
    id: "contractTraceability",
    title: "Contract traceability",
    status: "active",
    created_at: createdAt,
    tasks: [
      task({
        contract_refs: { implements: ["AC1"], verifies: ["AC1"] },
      }),
    ],
    deltas: {},
    contract: {
      version: 1,
      rigor: "standard",
      source: { artifact: "agreement", approvedAt: createdAt },
      items: [
        {
          id: "AC1",
          kind: "acceptance_criterion",
          text: "Review proves AC1.",
          sourceArtifact: "agreement",
          verificationRequired: true,
          evidencePolicy: "test",
          status: "approved",
        },
      ],
      amendments: [],
    },
    ...overrides,
  };
}

async function validate(changeOverride: Partial<Change> = {}) {
  return await validateChange(change(changeOverride), {
    specs: [] as Spec[],
    skipChecks: ["conflicts", "proposal-drift"],
  });
}

async function validateProposalDrift(
  proposalText: string,
  changeOverride: Partial<Change> = {},
) {
  return await validateChange(change(changeOverride), {
    specs: [] as Spec[],
    skipChecks: ["completeness", "conflicts"],
    proposalText,
  });
}

describe("contract validation", () => {
  test("errors on task refs to unknown contract IDs", async () => {
    const result = await validate({
      tasks: [task({ contract_refs: { implements: ["AC404"] } })],
    });

    expect(result.errors.map((error) => error.code)).toContain(
      "CONTRACT_UNKNOWN_REF",
    );
  });

  test("errors on standard code task without contract refs or exemption", async () => {
    const result = await validate({
      tasks: [task({ contract_refs: undefined })],
    });

    expect(result.errors.map((error) => error.code)).toContain(
      "CONTRACT_TASK_REFS_MISSING",
    );
  });

  test("skips contract_refs check for cancelled tasks", async () => {
    const result = await validate({
      tasks: [
        task({
          id: "tk-done",
          status: "done",
          contract_refs: { implements: ["AC1"], verifies: ["AC1"] },
        }),
        task({
          id: "tk-cancelled",
          status: "cancelled",
          contract_refs: undefined,
        }),
      ],
    });

    expect(result.errors.map((error) => error.code)).not.toContain(
      "CONTRACT_TASK_REFS_MISSING",
    );
  });

  test("skips contract_refs check for cancelled tasks", async () => {
    const result = await validate({
      tasks: [
        task({
          id: "tk-done",
          status: "done",
          contract_refs: { implements: ["AC1"], verifies: ["AC1"] },
        }),
        task({
          id: "tk-cancelled",
          status: "cancelled",
          contract_refs: undefined,
        }),
      ],
    });

    expect(result.errors.map((error) => error.code)).not.toContain(
      "CONTRACT_TASK_REFS_MISSING",
    );
  });

  test("errors when required AC lacks implementing or verifying task coverage", async () => {
    const result = await validate({
      tasks: [task({ contract_refs: { respects: ["AC1"] } })],
    });

    expect(result.errors.map((error) => error.code)).toContain(
      "CONTRACT_AC_UNCOVERED",
    );
  });

  test("errors when review matrix contains failing required proof", async () => {
    const result = await validate({
      contract: {
        ...change().contract!,
        reviewMatrix: {
          reviewedAt: createdAt,
          rows: [
            {
              contractId: "AC1",
              kind: "acceptance_criterion",
              status: "fail",
              evidencePolicy: "test",
              evidence: "failing test evidence",
            },
          ],
        },
      },
    });

    expect(result.errors.map((error) => error.code)).toContain(
      "CONTRACT_PROOF_FAILED",
    );
  });

  test("warns when legacy acceptanceCriteria projection diverges", async () => {
    const result = await validate({
      acceptanceCriteria: ["Different AC"],
    } as any);

    expect(result.warnings.map((warning) => warning.code)).toContain(
      "CONTRACT_ACCEPTANCE_CRITERIA_DRIFT",
    );
  });

  test("passes contract checks for covered standard contract", async () => {
    const result = await validate({
      gates: createDefaultGates(),
      contract: {
        ...change().contract!,
        reviewMatrix: {
          reviewedAt: createdAt,
          rows: [
            {
              contractId: "AC1",
              kind: "acceptance_criterion",
              status: "pass",
              evidencePolicy: "test",
              evidence: "passing test evidence",
            },
          ],
        },
      },
    });

    const contractIssues = [...result.errors, ...result.warnings].filter(
      (issue) => issue.code.startsWith("CONTRACT_"),
    );
    expect(contractIssues).toEqual([]);
  });
});

// =============================================================================
// Contract Coverage Projection
// =============================================================================

describe("projectContractCoverage", () => {
  test("only implements and verifies count as coverage", () => {
    const result = projectContractCoverage(
      change({
        tasks: [
          task({
            id: "tk-respects",
            contract_refs: { respects: ["AC1"] },
          }),
        ],
      }),
    );
    expect(result.coveredIds.has("AC1")).toBe(false);
    expect(result.uncoveredAcceptanceCriteria).toHaveLength(1);
    expect(result.uncoveredAcceptanceCriteria[0].id).toBe("AC1");
  });

  test("cancelled tasks do not contribute coverage", () => {
    const result = projectContractCoverage(
      change({
        tasks: [
          task({
            id: "tk-cancelled",
            status: "cancelled",
            contract_refs: { implements: ["AC1"] },
          }),
        ],
      }),
    );
    expect(result.coveredIds.has("AC1")).toBe(false);
    expect(result.uncoveredAcceptanceCriteria).toHaveLength(1);
  });

  test("cancellation metadata surfaces cancelled task ids and count", () => {
    const result = projectContractCoverage(
      change({
        tasks: [
          task({
            id: "tk-active",
            contract_refs: { implements: ["AC1"] },
          }),
          task({
            id: "tk-cancelled-1",
            status: "cancelled",
            contract_refs: { implements: ["AC2"] },
          }),
          task({
            id: "tk-cancelled-2",
            status: "cancelled",
            contract_refs: { implements: ["AC2"] },
          }),
        ],
        contract: {
          ...change().contract!,
          items: [
            {
              id: "AC1",
              kind: "acceptance_criterion",
              text: "Active coverage",
              sourceArtifact: "agreement",
              verificationRequired: true,
              evidencePolicy: "test",
              status: "approved",
            },
            {
              id: "AC2",
              kind: "acceptance_criterion",
              text: "Cancelled coverage",
              sourceArtifact: "agreement",
              verificationRequired: true,
              evidencePolicy: "test",
              status: "approved",
            },
          ],
        },
      }),
    );
    expect(result.cancelledTaskIds).toEqual([
      "tk-cancelled-1",
      "tk-cancelled-2",
    ]);
    expect(result.cancelledTaskCount).toBe(2);
  });

  test("cancellation metadata is empty when no tasks are cancelled", () => {
    const result = projectContractCoverage(
      change({
        tasks: [
          task({
            id: "tk-active",
            contract_refs: { implements: ["AC1"] },
          }),
        ],
      }),
    );
    expect(result.cancelledTaskIds).toEqual([]);
    expect(result.cancelledTaskCount).toBe(0);
  });

  test("verificationRequired=false AC is not reported as uncovered", () => {
    const result = projectContractCoverage(
      change({
        contract: {
          ...change().contract!,
          items: [
            {
              id: "AC1",
              kind: "acceptance_criterion",
              text: "Review proves AC1.",
              sourceArtifact: "agreement",
              verificationRequired: false,
              evidencePolicy: "test",
              status: "approved",
            },
          ],
        },
        tasks: [task({ contract_refs: undefined })],
      }),
    );
    expect(result.uncoveredAcceptanceCriteria).toHaveLength(0);
  });

  test("returns per-task coverage entries", () => {
    const result = projectContractCoverage(change());
    expect(result.taskCoverage).toEqual([
      { taskId: "tk-1", implements: ["AC1"], verifies: ["AC1"] },
    ]);
  });
});

// =============================================================================
// Non-Code Task Contract Coverage (rq-prepNonCodeEvidence01 / Decision 6)
// =============================================================================

describe("non-code task contract coverage", () => {
  test.each([
    ["docs"],
    ["research"],
    ["approval"],
    ["verification"],
    ["ops"],
  ] as const)(
    "errors on standard %s task without contract refs or exemption",
    async (type) => {
      const result = await validate({
        tasks: [task({ type, contract_refs: undefined })],
      });

      expect(result.errors.map((error) => error.code)).toContain(
        "CONTRACT_TASK_REFS_MISSING",
      );
    },
  );

  test.each([
    ["docs"],
    ["research"],
    ["approval"],
    ["verification"],
    ["ops"],
  ] as const)(
    "allows %s task with not_applicable_reason to bypass coverage",
    async (type) => {
      const result = await validate({
        tasks: [
          task({
            type,
            contract_refs: { not_applicable_reason: "Bookkeeping checkpoint" },
          }),
        ],
      });

      expect(result.errors.map((error) => error.code)).not.toContain(
        "CONTRACT_TASK_REFS_MISSING",
      );
    },
  );

  test("minimal rigor skips non-code contract_refs check", async () => {
    const result = await validate({
      contract: {
        ...change().contract!,
        rigor: "minimal",
      },
      tasks: [task({ type: "research", contract_refs: undefined })],
    });

    expect(result.errors.map((error) => error.code)).not.toContain(
      "CONTRACT_TASK_REFS_MISSING",
    );
  });
});

describe("proposal-task drift validation", () => {
  test("ignores narrative proposal sections", async () => {
    const result = await validateProposalDrift(
      `# Proposal\n\n## Intent\n\nFix status wording.\n\n## Scope\n\nKeep change local.\n\n## Risks / Unknowns\n\nOutput wording may need care.\n\n## Coordinated With\n\nRelated change handles shared contract.\n\n## What Changes\n\nFormatter prose changes only.\n\n## Avoidances\n\nNo schema redesign.\n`,
    );

    expect(result.warnings.map((warning) => warning.code)).not.toContain(
      "PROPOSAL_TASK_DRIFT",
    );
  });

  test("warns when explicit task-bearing section has no matching task", async () => {
    const result = await validateProposalDrift(
      `# Proposal\n\n## Tasks\n\n- Update session debt wording.\n- Add formatter coverage.\n`,
      {
        tasks: [task({ title: "Implement unrelated cache invalidation" })],
      },
    );

    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        code: "PROPOSAL_TASK_DRIFT",
        path: "proposal.sections.Tasks",
      }),
    );
  });
});
