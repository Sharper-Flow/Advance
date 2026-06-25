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

  test("does not promote unrecognized visible labels to contract ids", () => {
    const contract = buildContractFromAgreement({
      agreement: `## Acceptance Criteria
- REQ1: Uses a non-contract label and should receive an AC fallback id.
- AC3: Uses a recognized contract label.
- Another unlabeled acceptance criterion.
`,
      approvedAt,
    });

    expect(contract.items.map((item) => [item.id, item.kind])).toEqual([
      ["AC1", "acceptance_criterion"],
      ["AC3", "acceptance_criterion"],
      ["AC4", "acceptance_criterion"],
    ]);
  });

  test("rejects duplicate contract ids during mint", () => {
    expect(() =>
      buildContractFromAgreement({
        agreement: `## Acceptance Criteria
- AC1: First criterion.
- AC1: Duplicate criterion.
`,
        approvedAt,
      }),
    ).toThrow(/CONTRACT_DUPLICATE_ID/);
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

  // addAcWarrantGuard — capability-warrant verification at mint
  const warrantLookup = {
    toolSurface: new Map([
      ["adv_change_status_repair", new Set(["changeId", "target_path"])],
      ["adv_change_archive", new Set(["changeId", "phase9"])],
    ]),
    specIds: new Set(["rq-acWarrant01"]),
  };

  test("AC1: mint fails fast when a declared warrant names a nonexistent tool surface", () => {
    expect(() =>
      buildContractFromAgreement({
        agreement: `## Acceptance Criteria
- AC1: Cross-project archive routes through target. [warrant: tool:adv_change_archive#target_path]
`,
        approvedAt,
        warrantLookup,
      }),
    ).toThrow(/CONTRACT_UNRESOLVED_WARRANT[\s\S]*adv_change_archive#target_path/);
  });

  test("AC2: mint succeeds when a declared warrant resolves; tag stripped, refs recorded", () => {
    const contract = buildContractFromAgreement({
      agreement: `## Acceptance Criteria
- AC1: Cross-project repair routes through target. [warrant: tool:adv_change_status_repair#target_path]
`,
      approvedAt,
      warrantLookup,
    });
    const item = contract.items.find((i) => i.id === "AC1");
    expect(item?.warrants).toEqual([
      "tool:adv_change_status_repair#target_path",
    ]);
    expect(item?.text).toBe("Cross-project repair routes through target.");
    expect(item?.text).not.toContain("[warrant:");
  });

  test("AC3: behavioral criteria with no warrant tags mint unchanged (no lookup needed)", () => {
    const contract = buildContractFromAgreement({
      agreement: `## Acceptance Criteria
- AC1: Returns an error when input is invalid.
- AC2: Persists the record on success.
`,
      approvedAt,
    });
    expect(contract.items.map((i) => i.id)).toEqual(["AC1", "AC2"]);
    expect(contract.items.every((i) => i.warrants === undefined)).toBe(true);
  });

  test("declared warrant is recorded even without a lookup (verification deferred to tool layer)", () => {
    const contract = buildContractFromAgreement({
      agreement: `## Acceptance Criteria
- AC1: Does X. [warrant: spec:rq-acWarrant01]
`,
      approvedAt,
    });
    expect(contract.items[0]?.warrants).toEqual(["spec:rq-acWarrant01"]);
    expect(contract.items[0]?.text).toBe("Does X.");
  });

  test("malformed warrant tag fails the mint", () => {
    expect(() =>
      buildContractFromAgreement({
        agreement: `## Acceptance Criteria
- AC1: Bad warrant. [warrant: nonsense]
`,
        approvedAt,
        warrantLookup,
      }),
    ).toThrow(/WARRANT_MALFORMED/);
  });
});
