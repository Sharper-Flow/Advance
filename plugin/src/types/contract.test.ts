import { describe, expect, test } from "vitest";
import {
  ChangeContractSchema,
  ChangeSchema,
  ContractItemSchema,
  ContractReviewMatrixSchema,
  TaskContractRefsSchema,
  TaskSchema,
} from "./index";

describe("change contract schemas", () => {
  test("validates contract items and review matrix rows", () => {
    const item = ContractItemSchema.parse({
      id: "AC1",
      kind: "acceptance_criterion",
      text: "Review proves every required obligation.",
      sourceArtifact: "agreement",
      verificationRequired: true,
      evidencePolicy: "test",
      status: "approved",
    });

    expect(item.id).toBe("AC1");

    const matrix = ContractReviewMatrixSchema.parse({
      reviewedAt: "2026-05-08T00:00:00.000Z",
      rows: [
        {
          contractId: "AC1",
          kind: "acceptance_criterion",
          status: "pass",
          evidencePolicy: "test",
          evidence: "pnpm test -- contract.test.ts",
        },
      ],
    });

    expect(matrix.rows).toHaveLength(1);
  });

  test("accepts optional change contract on ChangeSchema", () => {
    const parsed = ChangeSchema.parse({
      id: "contractTraceability",
      title: "Contract traceability",
      status: "draft",
      created_at: "2026-05-08T00:00:00.000Z",
      contract: {
        version: 1,
        rigor: "standard",
        source: {
          artifact: "agreement",
          approvedAt: "2026-05-08T00:00:00.000Z",
        },
        items: [
          {
            id: "C1",
            kind: "constraint",
            text: "Typed state is the source of truth.",
            sourceArtifact: "agreement",
            verificationRequired: true,
            evidencePolicy: "review",
            status: "approved",
          },
        ],
        amendments: [],
      },
    });

    expect(parsed.contract.items[0].id).toBe("C1");
  });

  test("validates task contract references as typed task field", () => {
    const refs = TaskContractRefsSchema.parse({
      implements: ["AC1"],
      verifies: ["AC1"],
      respects: ["C1", "DONT1", "OOS1"],
    });

    expect(refs.respects).toContain("DONT1");

    const task = TaskSchema.parse({
      id: "tk-contract",
      title: "Implement contract refs",
      type: "code",
      status: "pending",
      created_at: "2026-05-08T00:00:00.000Z",
      contract_refs: refs,
    });

    expect(task.contract_refs.implements).toEqual(["AC1"]);
  });

  test("rejects invalid evidence policy", () => {
    expect(() =>
      ContractItemSchema.parse({
        id: "DONT1",
        kind: "avoidance",
        text: "Do not force fake tests for negative obligations.",
        sourceArtifact: "agreement",
        verificationRequired: true,
        evidencePolicy: "fake_test",
        status: "approved",
      }),
    ).toThrow();
  });

  test("validates full contract shape directly", () => {
    const contract = ChangeContractSchema.parse({
      version: 1,
      rigor: "minimal",
      source: {
        artifact: "agreement",
        contentHash: "abc123",
        approvedAt: "2026-05-08T00:00:00.000Z",
      },
      items: [],
      amendments: [],
    });

    expect(contract.version).toBe(1);
  });
});
