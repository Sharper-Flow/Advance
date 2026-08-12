import { describe, expect, test, vi } from "vitest";
import type { Store } from "../storage/store-types";
import { createDispositionTool } from "./disposition-tool-factory";
import { designConcernTools } from "./design-concern";
import { coordinateChangeMutation } from "./change-mutation-coordinator";

vi.mock("./change-mutation-coordinator", () => ({
  coordinateChangeMutation: vi.fn(),
}));

const changeId = "change-1";
const taskId = "task-1";
const argumentKeys = [
  "changeId",
  "taskId",
  "concernKey",
  "disposition",
  "evidence",
  "dryRun",
  "priorApprovalEvidence",
  "target_path",
  "target_confirmed",
  "confirmationEvidence",
];

const expectedDescriptions = {
  design:
    "Record a typed disposition for a design-quality concern raised by an adv-designer report (a design_dimensions concern or neighboring recommendation). Clears the structural acceptance/release block for that (taskId, concernKey). Disposition verbs: fixed | rejected_with_evidence | split | fast_follow — there is no accepted_debt path.",
};

function createStore(): Store {
  return {
    paths: { root: "/repo", changes: "/changes" } as Store["paths"],
    changes: {
      get: vi.fn(async () => ({
        success: true,
        data: { tasks: [{ id: taskId }] },
      })),
    },
  } as unknown as Store;
}

function parse(output: string): Record<string, unknown> {
  return JSON.parse(output) as Record<string, unknown>;
}

async function emittedErrorCodes(
  tool: {
    execute: (args: unknown, store: Store) => Promise<string>;
  },
  concernKey: string,
): Promise<string[]> {
  const coordinate = vi.mocked(coordinateChangeMutation);
  coordinate.mockReset();
  coordinate
    .mockResolvedValueOnce({
      kind: "unverified",
      reason: "unverified reason",
    } as never)
    .mockResolvedValueOnce({
      kind: "stale_revision",
      expected: 1,
      actual: 2,
    } as never)
    .mockResolvedValueOnce({
      kind: "operator_required",
      reason: "operator reason",
    } as never);

  const args = {
    changeId,
    taskId,
    concernKey,
    disposition: "fixed",
    evidence: "evidence",
  };
  const outputs = await Promise.all([
    tool.execute(args, createStore()),
    tool.execute(args, createStore()),
    tool.execute(args, createStore()),
  ]);
  return outputs.map((output) => parse(output).code as string);
}

describe("disposition tool factory contract", () => {
  test("exposes a factory and preserves exact tool metadata", () => {
    expect(createDispositionTool).toBeTypeOf("function");

    const design = designConcernTools.adv_design_concern_disposition;

    expect(design.description).toBe(expectedDescriptions.design);
    expect(Object.keys(design.args)).toEqual(argumentKeys);
    expect(
      (design.args.concernKey as { description?: string }).description,
    ).toBe(
      "Stable concern key from the structural blocker, e.g. 'dimension:site_design_consistency' or 'neighbor:0'.",
    );
  });

  test("preserves each tool's explicit error-code set, including the typo", async () => {
    expect(
      await emittedErrorCodes(
        designConcernTools.adv_design_concern_disposition,
        "dimension:site_design_consistency",
      ),
    ).toEqual([
      "DESIGN_CONCERN_DISPOSITION_RECOVERY_UNVERIFIED",
      "DESIGN_CONCERN_DISPOSITION_STALE_REVISION",
      "DESIGN_CONSENT_MUTATION_OPERATOR_REQUIRED",
    ]);
  });
});
