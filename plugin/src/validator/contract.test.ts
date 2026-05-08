import { describe, expect, test } from "vitest";
import { createDefaultGates, type Change, type Spec, type Task } from "../types";
import { validateChange } from "./validator";

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
    const result = await validate({ tasks: [task({ contract_refs: undefined })] });

    expect(result.errors.map((error) => error.code)).toContain(
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
    const result = await validate({ acceptanceCriteria: ["Different AC"] } as any);

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
