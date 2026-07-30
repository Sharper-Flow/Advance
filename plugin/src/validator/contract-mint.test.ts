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
      ["adv_change_create", new Set(["summary", "target_path"])],
      ["adv_change_archive", new Set(["changeId", "phase9", "target_path"])],
      ["adv_task_checkpoint", new Set(["taskId", "target_path"])],
    ]),
    specIds: new Set(["rq-acWarrant01"]),
  };

  test("AC1: mint fails fast when a declared warrant names a nonexistent tool arg", () => {
    expect(() =>
      buildContractFromAgreement({
        agreement: `## Acceptance Criteria
- AC1: Cross-project archive routes through target. [warrant: tool:adv_change_archive#nonexistent_arg]
`,
        approvedAt,
        warrantLookup,
      }),
    ).toThrow(
      /CONTRACT_UNRESOLVED_WARRANT[\s\S]*adv_change_archive#nonexistent_arg/,
    );
  });

  test("AC2a: mint succeeds when an archive target_path warrant resolves", () => {
    const contract = buildContractFromAgreement({
      agreement: `## Acceptance Criteria
- AC1: Cross-project archive routes through target. [warrant: tool:adv_change_archive#target_path]
`,
      approvedAt,
      warrantLookup,
    });
    const item = contract.items.find((i) => i.id === "AC1");
    expect(item?.warrants).toEqual(["tool:adv_change_archive#target_path"]);
    expect(item?.text).toBe("Cross-project archive routes through target.");
    expect(item?.text).not.toContain("[warrant:");
  });

  test("AC2b: mint succeeds when a checkpoint target_path warrant resolves", () => {
    const contract = buildContractFromAgreement({
      agreement: `## Acceptance Criteria
- AC1: Cross-project checkpoint routes through target. [warrant: tool:adv_task_checkpoint#target_path]
`,
      approvedAt,
      warrantLookup,
    });
    const item = contract.items.find((i) => i.id === "AC1");
    expect(item?.warrants).toEqual(["tool:adv_task_checkpoint#target_path"]);
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

  // addStructuredAcceptance: typed criterion variants at the mint boundary.
  test("AC1: behavioral criterion receives variant annotation while preserving canonical text and id", () => {
    const contract = buildContractFromAgreement({
      agreement: `## Acceptance Criteria
- AC1: Given an approved criterion, when its agreement is minted, then the contract preserves a typed optional variant annotation while retaining canonical text and stable contract ID.
`,
      approvedAt,
    });

    const item = contract.items.find((i) => i.id === "AC1");
    expect(item).toBeDefined();
    expect(item?.variant).toEqual({
      kind: "behavioral",
      context: "an approved criterion",
      trigger: "its agreement is minted",
      outcome:
        "the contract preserves a typed optional variant annotation while retaining canonical text and stable contract ID",
    });
    expect(item?.text).toBe(
      "Given an approved criterion, when its agreement is minted, then the contract preserves a typed optional variant annotation while retaining canonical text and stable contract ID.",
    );
    expect(ChangeContractSchema.parse(contract)).toEqual(contract);
  });

  test("AC2: behavioral criterion separates comma-delimited And boundaries for rendering", () => {
    const contract = buildContractFromAgreement({
      agreement: `## Acceptance Criteria
- AC1: Given a valid contract, when a malformed structured update is minted, then ADV returns a clear validation result, and the existing contract remains unchanged.
`,
      approvedAt,
    });

    expect(contract.items[0]?.variant).toEqual({
      kind: "behavioral",
      context: "a valid contract",
      trigger: "a malformed structured update is minted",
      outcome: "ADV returns a clear validation result",
      boundaries: ["the existing contract remains unchanged"],
    });
    expect(contract.items[0]?.text).toBe(
      "Given a valid contract, when a malformed structured update is minted, then ADV returns a clear validation result, and the existing contract remains unchanged.",
    );
  });

  test("AC1: evidence and spec-law variants are parsed and stored", () => {
    const contract = buildContractFromAgreement({
      agreement: `## Acceptance Criteria
- AC1: Evidence: review matrix coverage is proven by passing gate-readiness checks.
- AC2: Spec-law: rq-structuredAc requires typed criterion variants at the mint boundary.
`,
      approvedAt,
    });

    expect(contract.items[0]?.variant).toEqual({
      kind: "evidence",
      subject: "review matrix coverage is proven",
      method: "passing gate-readiness checks",
    });
    expect(contract.items[1]?.variant).toEqual({
      kind: "spec_law",
      spec: "rq-structuredAc",
      requirement: "typed criterion variants at the mint boundary",
    });
  });

  test("AC5: malformed evidence variants are rejected before a contract can be minted", () => {
    for (const text of [
      "Evidence: via passing gate-readiness checks.",
      "Evidence: review matrix coverage is proven by ",
    ]) {
      expect(() =>
        buildContractFromAgreement({
          agreement: `## Acceptance Criteria\n- AC1: ${text}\n`,
          approvedAt,
        }),
      ).toThrow(/CONTRACT_MALFORMED_VARIANT/);
    }
  });

  test("AC1: constraint variant is parsed for constraint-kind items", () => {
    const contract = buildContractFromAgreement({
      agreement: `## Constraints
- C1: Must preserve signal/query-only workflow surface for temporal workflows.
`,
      approvedAt,
    });

    const item = contract.items.find((i) => i.id === "C1");
    expect(item?.variant).toEqual({
      kind: "constraint",
      obligation: "Must preserve signal/query-only workflow surface",
      scope: "temporal workflows",
    });
  });

  test("AC1: flat-text criteria remain usable without a variant annotation", () => {
    const contract = buildContractFromAgreement({
      agreement: `## Acceptance Criteria
- AC1: Returns an error when input is invalid.
`,
      approvedAt,
    });

    expect(contract.items[0]?.variant).toBeUndefined();
    expect(contract.items[0]?.text).toBe(
      "Returns an error when input is invalid.",
    );
  });

  test("AC4: structured behavioral criterion retains and validates bracketed warrants", () => {
    const contract = buildContractFromAgreement({
      agreement: `## Acceptance Criteria
- AC1: Given a criterion contains a valid bracketed warrant, when it is minted, then its warrant is retained and validated through the current structural path. [warrant: tool:adv_change_archive#target_path]
`,
      approvedAt,
      warrantLookup,
    });

    const item = contract.items.find((i) => i.id === "AC1");
    expect(item?.variant?.kind).toBe("behavioral");
    expect(item?.warrants).toEqual(["tool:adv_change_archive#target_path"]);
    expect(item?.text).not.toContain("[warrant:");
    expect(item?.text).toContain(
      "validated through the current structural path",
    );
  });

  test("AC5: malformed evidence variant is rejected before contract mutation", () => {
    expect(() =>
      buildContractFromAgreement({
        agreement: `## Acceptance Criteria
- AC1: Evidence: missing separator.
`,
        approvedAt,
      }),
    ).toThrow(/CONTRACT_MALFORMED_VARIANT/);
  });

  test("AC5: malformed spec-law variant is rejected before contract mutation", () => {
    expect(() =>
      buildContractFromAgreement({
        agreement: `## Acceptance Criteria
- AC1: Spec-law: missing requirement.
`,
        approvedAt,
      }),
    ).toThrow(/CONTRACT_MALFORMED_VARIANT/);
  });

  test("AC5: incomplete behavioral scenario is rejected before contract mutation", () => {
    expect(() =>
      buildContractFromAgreement({
        agreement: `## Acceptance Criteria
- AC1: Given an approved criterion, when its agreement is minted.
`,
        approvedAt,
      }),
    ).toThrow(/CONTRACT_MALFORMED_VARIANT/);
  });
});
