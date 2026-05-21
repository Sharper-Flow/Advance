import { describe, expect, test } from "vitest";
import { ChangeContractSchema } from "../types";
import { buildContractFromAgreement } from "./contract-mint";

const approvedAt = "2026-05-21T05:21:11.743Z";

describe("buildContractFromAgreement", () => {
  test("parses labeled agreement obligations into typed contract items", () => {
    const agreement = `# Agreement

## Success Criteria
- SC1: Users can archive recovered changes.

## Acceptance Criteria
- AC1: Contract minting fires a production signal.
- AC2: Recovery mode requires explicit evidence.

## Constraints
- C1: Preserve signal/query-only workflow surface.

## Avoidances
- DONT1: Do not use CLI workarounds as the normal path.

## Out of Scope
- OOS1: Do not build workflow termination tooling.
`;

    const contract = buildContractFromAgreement({
      agreement,
      approvedAt,
      rigor: "standard",
    });

    expect(contract).toMatchObject({
      version: 1,
      rigor: "standard",
      source: { artifact: "agreement", approvedAt },
    });
    expect(contract.source.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(contract.items.map((item) => [item.id, item.kind])).toEqual([
      ["SC1", "success_criterion"],
      ["AC1", "acceptance_criterion"],
      ["AC2", "acceptance_criterion"],
      ["C1", "constraint"],
      ["DONT1", "avoidance"],
      ["OOS1", "out_of_scope"],
    ]);
    expect(contract.items.map((item) => item.evidencePolicy)).toEqual([
      "review",
      "test",
      "test",
      "static_check",
      "review",
      "not_applicable",
    ]);
    expect(contract.items.every((item) => item.status === "approved")).toBe(
      true,
    );
    expect(ChangeContractSchema.parse(contract)).toEqual(contract);
  });

  test("generates stable fallback ids for unlabeled section bullets", () => {
    const contract = buildContractFromAgreement({
      agreement: `## Acceptance Criteria
- First parsed acceptance criterion.
- Second parsed acceptance criterion.

## Constraints
- Must stay deterministic.
`,
      approvedAt,
    });

    expect(contract.items.map((item) => item.id)).toEqual(["AC1", "AC2", "C1"]);
  });

  test("rejects agreements with no contract items", () => {
    expect(() =>
      buildContractFromAgreement({
        agreement: "# Agreement\n\n## Notes\n\nNo obligations here.",
        approvedAt,
      }),
    ).toThrow(/CONTRACT_ITEMS_EMPTY/);
  });

  test("requires an approvedAt timestamp", () => {
    expect(() =>
      buildContractFromAgreement({
        agreement: "## Acceptance Criteria\n- AC1: Works.",
        approvedAt: "",
      }),
    ).toThrow(/approvedAt/);
  });
});
