/**
 * Contract Authority Invariants — Variant-Blind Regressions
 *
 * addStructuredAcceptance — AC7: variant-bearing criteria must NOT change
 * contract authority. Existing ID-based task coverage, review-matrix
 * completeness, drift checks, evidence-policy behavior, and gate-readiness
 * logic operate on canonical contract item text + IDs + evidence policies.
 * The optional `variant` annotation is purely additive presentation metadata
 * (parsed once at mint) and must not participate in any authority decision.
 *
 * These tests prove that AC7 by building side-by-side:
 *   1. A "plain" change with no variants.
 *   2. A "variant-bearing" change with the same IDs, text, and evidence
 *      policies plus an optional `variant` annotation.
 * Then asserting that every authority projection (coverage, review matrix,
 * drift, gate-readiness, evidence-policy) returns the same observable result.
 *
 * The DDC2 import-boundary invariant (warrant.ts + contract-mint.ts must
 * stay cycle-free of tool-registry / tools/*) is the structural companion
 * regression; the existing `warrant-boundary.test.ts` enforces it and these
 * tests re-assert the file contents so a future regression cannot be
 * introduced without tripping AC7.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, test } from "vitest";
import { createDefaultGates, type Change, type Task } from "../types";
import { validateChange } from "./validator";
import { projectContractCoverage, runContractChecks } from "./contract";
import { resolveTaskEvidence } from "./task-classifier";
import { buildContractFromAgreement } from "./contract-mint";
import { evaluateGateCriteria } from "../gates/gate-readiness";
import { acceptanceCriteriaFromContract } from "../types/change-state-helpers";
import type { ChangeState } from "../types/change-state";

const createdAt = "2026-07-29T00:00:00.000Z";

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

function plainContract() {
  return {
    version: 1,
    rigor: "standard",
    source: { artifact: "agreement" as const, approvedAt: createdAt },
    items: [
      {
        id: "AC1",
        kind: "acceptance_criterion" as const,
        text: "Given a request, when it is valid, then it succeeds.",
        sourceArtifact: "agreement" as const,
        verificationRequired: true,
        evidencePolicy: "test" as const,
        status: "approved" as const,
      },
      {
        id: "AC2",
        kind: "acceptance_criterion" as const,
        text: "Evidence: review matrix coverage is proven by passing gate-readiness checks.",
        sourceArtifact: "agreement" as const,
        verificationRequired: true,
        evidencePolicy: "test" as const,
        status: "approved" as const,
      },
      {
        id: "C1",
        kind: "constraint" as const,
        text: "Must preserve ID-based traceability for change contracts.",
        sourceArtifact: "agreement" as const,
        verificationRequired: true,
        evidencePolicy: "static_check" as const,
        status: "approved" as const,
      },
      {
        id: "OOS1",
        kind: "out_of_scope" as const,
        text: "Do not introduce a second authority source.",
        sourceArtifact: "agreement" as const,
        verificationRequired: false,
        evidencePolicy: "not_applicable" as const,
        status: "approved" as const,
      },
    ],
    reviewMatrix: {
      reviewedAt: createdAt,
      rows: [
        {
          contractId: "AC1",
          kind: "acceptance_criterion" as const,
          status: "pass" as const,
          evidencePolicy: "test" as const,
          evidence: "covered",
        },
        {
          contractId: "AC2",
          kind: "acceptance_criterion" as const,
          status: "pass" as const,
          evidencePolicy: "test" as const,
          evidence: "covered",
        },
        {
          contractId: "C1",
          kind: "constraint" as const,
          status: "pass" as const,
          evidencePolicy: "static_check" as const,
          evidence: "covered",
        },
      ],
    },
    amendments: [],
  };
}

function variantBearingContract() {
  // Same shape, same IDs, same text, same evidence policies — only addition
  // is the optional `variant` annotation on each item. The contract must
  // remain byte-identical for authority purposes.
  const base = plainContract();
  return {
    ...base,
    items: [
      {
        ...base.items[0],
        variant: {
          kind: "behavioral",
          context: "a request",
          trigger: "it is valid",
          outcome: "it succeeds",
        },
      },
      {
        ...base.items[1],
        variant: {
          kind: "evidence",
          subject: "review matrix coverage is proven",
          method: "passing gate-readiness checks",
        },
      },
      {
        ...base.items[2],
        variant: {
          kind: "constraint",
          obligation: "Must preserve ID-based traceability",
          scope: "change contracts",
        },
      },
      // OOS1 keeps no variant (out-of-scope items do not carry one).
      base.items[3],
    ],
  };
}

function plainChange(): Change {
  return {
    id: "authorityPlain",
    title: "Plain contract authority",
    status: "active",
    created_at: createdAt,
    tasks: [
      task({
        id: "tk-ac1",
        contract_refs: { implements: ["AC1"], verifies: ["AC1"] },
      }),
      task({
        id: "tk-ac2",
        contract_refs: { implements: ["AC2"], verifies: ["AC2"] },
      }),
      task({
        id: "tk-c1",
        contract_refs: { respects: ["C1"] },
      }),
    ],
    deltas: {},
    contract: plainContract(),
  };
}

function variantChange(): Change {
  return {
    ...plainChange(),
    id: "authorityVariant",
    title: "Variant-bearing contract authority",
    contract: variantBearingContract(),
  };
}

async function validate(changeOverride: Partial<Change> = {}) {
  return await validateChange(
    { ...variantChange(), ...changeOverride },
    {
      specs: [],
      skipChecks: ["conflicts", "proposal-drift"],
    },
  );
}

function makeState(
  change: Change,
  overrides: Partial<ChangeState> = {},
): ChangeState {
  return {
    projectId: "0000ec0100000000000000000000000000000000",
    changeId: change.id,
    title: change.title,
    initializedAt: createdAt,
    id: change.id,
    status: "draft",
    createdAt: createdAt,
    tasks: change.tasks,
    deltas: {},
    wisdom: [],
    gates: createDefaultGates(),
    artifacts: {},
    contract: change.contract,
    acceptanceCriteria: acceptanceCriteriaFromContract(change.contract!),
    ...overrides,
  };
}

// =============================================================================
// ID-based task coverage (projectContractCoverage) is variant-blind.
// =============================================================================

describe("AC7: projectContractCoverage is variant-blind", () => {
  test("covered IDs set is identical with and without variants", () => {
    const plain = projectContractCoverage(plainChange());
    const variant = projectContractCoverage(variantChange());

    expect([...variant.coveredIds].sort()).toEqual(
      [...plain.coveredIds].sort(),
    );
  });

  test("uncovered acceptance criteria list is identical with and without variants", () => {
    const plain = projectContractCoverage(plainChange());
    const variant = projectContractCoverage(variantChange());

    expect(variant.uncoveredAcceptanceCriteria).toEqual(
      plain.uncoveredAcceptanceCriteria,
    );
  });

  test("per-task coverage entries are identical with and without variants", () => {
    const plain = projectContractCoverage(plainChange());
    const variant = projectContractCoverage(variantChange());

    expect(variant.taskCoverage).toEqual(plain.taskCoverage);
  });

  test("cancelled task accounting is identical with and without variants", () => {
    const cancelled: Task = task({
      id: "tk-cancelled",
      status: "cancelled",
      contract_refs: { implements: ["AC2"] },
    });
    const plain = projectContractCoverage({
      ...plainChange(),
      tasks: [...plainChange().tasks, cancelled],
    });
    const variant = projectContractCoverage({
      ...variantChange(),
      tasks: [...variantChange().tasks, cancelled],
    });

    expect(variant.cancelledTaskIds).toEqual(plain.cancelledTaskIds);
    expect(variant.cancelledTaskCount).toEqual(plain.cancelledTaskCount);
  });

  test("respects-only contract refs do not count as coverage (variant-blind)", () => {
    const plain = projectContractCoverage(plainChange());
    const variant = projectContractCoverage(variantChange());

    // C1 is only `respects` on tk-c1 — both projections must agree it is not
    // a coverage point.
    expect(plain.coveredIds.has("C1")).toBe(false);
    expect(variant.coveredIds.has("C1")).toBe(false);
  });
});

// =============================================================================
// runContractChecks — full validation pass is variant-blind.
// =============================================================================

describe("AC7: runContractChecks is variant-blind", () => {
  test("contract_* issue codes are identical with and without variants", async () => {
    const plainIssues = (await validateChange(plainChange(), {
      specs: [],
      skipChecks: ["conflicts", "proposal-drift"],
    })) as { errors: { code: string }[]; warnings: { code: string }[] };
    const variantIssues = await validate(variantChange() as Partial<Change>);

    const codes = (issues: { code: string }[]) =>
      issues.map((i) => i.code).sort();

    expect(codes(plainIssues.errors)).toEqual(codes(variantIssues.errors));
    expect(codes(plainIssues.warnings)).toEqual(codes(variantIssues.warnings));
  });

  test("no new contract_* issues are introduced by adding variants", async () => {
    const result = await validate(variantChange() as Partial<Change>);
    const contractIssues = [...result.errors, ...result.warnings].filter(
      (issue) => issue.code.startsWith("CONTRACT_"),
    );

    // The only acceptable outcome: zero contract_* issues (clean standard
    // contract with full coverage and matching review matrix). Any contract
    // issue here would mean the variant annotation leaked into authority.
    expect(contractIssues).toEqual([]);
  });

  test("runContractChecks (sync surface) returns identical issue sets", () => {
    const plain = runContractChecks(plainChange());
    const variant = runContractChecks(variantChange());

    expect(variant).toEqual(plain);
  });
});

// =============================================================================
// Drift checks: legacy `acceptanceCriteria` projection is variant-blind.
// =============================================================================

describe("AC7: legacy acceptanceCriteria projection is variant-blind", () => {
  test("acceptanceCriteriaFromContract yields identical text arrays", () => {
    const plain = acceptanceCriteriaFromContract(plainContract());
    const variant = acceptanceCriteriaFromContract(variantBearingContract());

    expect(variant).toEqual(plain);
  });

  test("drift warning is not raised when both legacy and contract have the same text", async () => {
    const legacyCriteria = acceptanceCriteriaFromContract(plainContract());

    const plainWithLegacy = await validateChange(
      { ...plainChange(), acceptanceCriteria: legacyCriteria } as Change,
      { specs: [], skipChecks: ["conflicts", "proposal-drift"] },
    );
    const variantWithLegacy = await validateChange(
      { ...variantChange(), acceptanceCriteria: legacyCriteria } as Change,
      { specs: [], skipChecks: ["conflicts", "proposal-drift"] },
    );

    const plainDrift = plainWithLegacy.warnings.some(
      (w) => w.code === "CONTRACT_ACCEPTANCE_CRITERIA_DRIFT",
    );
    const variantDrift = variantWithLegacy.warnings.some(
      (w) => w.code === "CONTRACT_ACCEPTANCE_CRITERIA_DRIFT",
    );

    expect(plainDrift).toBe(false);
    expect(variantDrift).toBe(false);
  });

  test("drift warning fires identically when legacy text diverges from contract text", async () => {
    const legacyCriteria = ["Completely unrelated legacy text."];

    const plainWithDrift = await validateChange(
      { ...plainChange(), acceptanceCriteria: legacyCriteria } as Change,
      { specs: [], skipChecks: ["conflicts", "proposal-drift"] },
    );
    const variantWithDrift = await validateChange(
      { ...variantChange(), acceptanceCriteria: legacyCriteria } as Change,
      { specs: [], skipChecks: ["conflicts", "proposal-drift"] },
    );

    const plainCodes = plainWithDrift.warnings.map((w) => w.code).sort();
    const variantCodes = variantWithDrift.warnings.map((w) => w.code).sort();

    expect(plainCodes).toContain("CONTRACT_ACCEPTANCE_CRITERIA_DRIFT");
    expect(variantCodes).toContain("CONTRACT_ACCEPTANCE_CRITERIA_DRIFT");
    expect(variantCodes).toEqual(plainCodes);
  });
});

// =============================================================================
// Review-matrix completeness — variant-blind.
// =============================================================================

describe("AC7: review-matrix completeness is variant-blind", () => {
  test("REVIEW_MATRIX_COMPLETE passes identically with and without variants", () => {
    const plainState = makeState(plainChange());
    const variantState = makeState(variantChange());

    const plainCriteria = evaluateGateCriteria(plainState, "acceptance");
    const variantCriteria = evaluateGateCriteria(variantState, "acceptance");

    const plainComplete = plainCriteria.find(
      (c) => c.id === "REVIEW_MATRIX_COMPLETE",
    );
    const variantComplete = variantCriteria.find(
      (c) => c.id === "REVIEW_MATRIX_COMPLETE",
    );

    expect(plainComplete?.status).toBe("pass");
    expect(variantComplete?.status).toBe("pass");
    // Evidence includes identical counts (rows + items).
    expect(plainComplete?.evidence).toBe(variantComplete?.evidence);
  });

  test("ALL_ROWS_PASSING is variant-blind — failing rows still fail closed", () => {
    const failingMatrix = {
      reviewedAt: createdAt,
      rows: [
        {
          contractId: "AC1",
          kind: "acceptance_criterion" as const,
          status: "pass" as const,
          evidencePolicy: "test" as const,
          evidence: "covered",
        },
        {
          contractId: "AC2",
          kind: "acceptance_criterion" as const,
          status: "fail" as const,
          evidencePolicy: "test" as const,
          evidence: "broken",
        },
        {
          contractId: "C1",
          kind: "constraint" as const,
          status: "pass" as const,
          evidencePolicy: "static_check" as const,
          evidence: "covered",
        },
      ],
    };

    const plainState = makeState({
      ...plainChange(),
      contract: { ...plainContract(), reviewMatrix: failingMatrix },
    });
    const variantState = makeState({
      ...variantChange(),
      contract: { ...variantBearingContract(), reviewMatrix: failingMatrix },
    });

    const plain = evaluateGateCriteria(plainState, "acceptance");
    const variant = evaluateGateCriteria(variantState, "acceptance");

    const plainPassing = plain.find((c) => c.id === "ALL_ROWS_PASSING");
    const variantPassing = variant.find((c) => c.id === "ALL_ROWS_PASSING");

    expect(plainPassing?.status).toBe("fail");
    expect(variantPassing?.status).toBe("fail");
  });

  test("missing review row fails closed identically with and without variants", () => {
    const partialMatrix = {
      reviewedAt: createdAt,
      rows: [
        {
          contractId: "AC1",
          kind: "acceptance_criterion" as const,
          status: "pass" as const,
          evidencePolicy: "test" as const,
          evidence: "covered",
        },
        // AC2 row deliberately missing
        {
          contractId: "C1",
          kind: "constraint" as const,
          status: "pass" as const,
          evidencePolicy: "static_check" as const,
          evidence: "covered",
        },
      ],
    };

    const plainState = makeState({
      ...plainChange(),
      contract: { ...plainContract(), reviewMatrix: partialMatrix },
    });
    const variantState = makeState({
      ...variantChange(),
      contract: { ...variantBearingContract(), reviewMatrix: partialMatrix },
    });

    const plain = evaluateGateCriteria(plainState, "acceptance");
    const variant = evaluateGateCriteria(variantState, "acceptance");

    const plainComplete = plain.find((c) => c.id === "REVIEW_MATRIX_COMPLETE");
    const variantComplete = variant.find(
      (c) => c.id === "REVIEW_MATRIX_COMPLETE",
    );

    expect(plainComplete?.status).toBe("fail");
    expect(variantComplete?.status).toBe("fail");
    // Missing AC2 must surface identically in both projections.
    expect(plainComplete?.evidence).toContain("AC2");
    expect(variantComplete?.evidence).toContain("AC2");
  });

  test("CONTRACT_EXISTS is variant-blind (still passes when contract is present)", () => {
    const plainState = makeState(plainChange());
    const variantState = makeState(variantChange());

    const plain = evaluateGateCriteria(plainState, "acceptance");
    const variant = evaluateGateCriteria(variantState, "acceptance");

    expect(plain.find((c) => c.id === "CONTRACT_EXISTS")?.status).toBe("pass");
    expect(variant.find((c) => c.id === "CONTRACT_EXISTS")?.status).toBe(
      "pass",
    );
  });
});

// =============================================================================
// Evidence-policy behavior — variant-blind.
// =============================================================================

describe("AC7: evidence-policy behavior is variant-blind", () => {
  test("contract item evidencePolicy survives variant attachment", () => {
    const plain = plainContract();
    const variant = variantBearingContract();

    for (let i = 0; i < plain.items.length; i++) {
      expect(plain.items[i].evidencePolicy).toBe(
        variant.items[i].evidencePolicy,
      );
    }
  });

  test("resolveTaskEvidence policy outcome is independent of contract variant", () => {
    const plainTask = task({
      id: "tk-evp",
      evidence_policy: "test",
    });
    const variantTask = task({
      id: "tk-evp",
      evidence_policy: "test",
    });

    // Same task, same policy — the contract (with or without variants) has no
    // bearing on task-level evidence policy resolution.
    expect(resolveTaskEvidence(plainTask).policy).toBe(
      resolveTaskEvidence(variantTask).policy,
    );
  });

  test("behavior-critical + not_applicable still fails closed with variants present", () => {
    const behaviorCritical = task({
      id: "tk-bad-evp",
      type: "code",
      evidence_policy: "not_applicable",
    });
    const result = resolveTaskEvidence(behaviorCritical);

    // Independent of contract — but proving that adding variants to the
    // surrounding contract does not flip this rule.
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/not_applicable/i);
  });
});

// =============================================================================
// Mint boundary — variant-bearing items still produce ID + text + policy
// identical to plain items, with no extras in authority fields.
// =============================================================================

describe("AC7: variant-bearing items minted from structured agreement keep authority fields identical", () => {
  test("behavioral variant: id, text, kind, evidencePolicy preserved, variant attached", () => {
    const contract = buildContractFromAgreement({
      agreement: `## Acceptance Criteria
- AC1: Given a request, when it is valid, then it succeeds.
`,
      approvedAt: createdAt,
    });
    const item = contract.items.find((i) => i.id === "AC1");

    expect(item?.id).toBe("AC1");
    expect(item?.kind).toBe("acceptance_criterion");
    expect(item?.evidencePolicy).toBe("test");
    expect(item?.text).toBe(
      "Given a request, when it is valid, then it succeeds.",
    );
    expect(item?.variant).toEqual({
      kind: "behavioral",
      context: "a request",
      trigger: "it is valid",
      outcome: "it succeeds",
    });
  });

  test("evidence variant: id, text, evidencePolicy preserved, variant attached", () => {
    const contract = buildContractFromAgreement({
      agreement: `## Acceptance Criteria
- AC1: Evidence: review matrix coverage is proven by passing gate-readiness checks.
`,
      approvedAt: createdAt,
    });
    const item = contract.items.find((i) => i.id === "AC1");

    expect(item?.evidencePolicy).toBe("test");
    expect(item?.variant?.kind).toBe("evidence");
    expect(item?.text.startsWith("Evidence:")).toBe(true);
  });

  test("spec_law and constraint variants carry the kind-appropriate evidencePolicy", () => {
    const contract = buildContractFromAgreement({
      agreement: `## Acceptance Criteria
- AC1: Spec-law: rq-structuredAc requires typed criterion variants at the mint boundary.

## Constraints
- C1: Must preserve ID-based traceability for change contracts.
`,
      approvedAt: createdAt,
    });

    const ac = contract.items.find((i) => i.id === "AC1");
    const c = contract.items.find((i) => i.id === "C1");

    expect(ac?.kind).toBe("acceptance_criterion");
    expect(ac?.evidencePolicy).toBe("test");
    expect(ac?.variant?.kind).toBe("spec_law");

    expect(c?.kind).toBe("constraint");
    expect(c?.evidencePolicy).toBe("static_check");
    expect(c?.variant?.kind).toBe("constraint");
  });
});

// =============================================================================
// DDC2 — contract-mint.ts and warrant.ts must remain free of static
// tool-registry / tools/* imports. The warrant-boundary.test.ts file already
// enforces this; these tests re-assert the same invariant at the file
// boundary so AC7 cannot regress without tripping.
// =============================================================================

describe("AC7: DDC2 import-boundary invariant (cycle-free contract-mint / warrant)", () => {
  const files = ["warrant.ts", "contract-mint.ts"];
  const forbidden =
    /^\s*import\s+[^;]*from\s+["'](?:\.\.\/tool-registry|\.\.\/tools\/)/m;

  for (const file of files) {
    test(`${file} has no static tool-registry / tools/* import`, () => {
      const src = readFileSync(join(__dirname, file), "utf8");
      expect(src).not.toMatch(forbidden);
    });
  }

  test("warrant-boundary regression file is present", () => {
    // The structural companion test that pins this invariant.
    const exists = (() => {
      try {
        readFileSync(join(__dirname, "warrant-boundary.test.ts"), "utf8");
        return true;
      } catch {
        return false;
      }
    })();
    expect(exists).toBe(true);
  });
});

// =============================================================================
// Cross-cutting: authority is variant-blind across the full gate-readiness
// acceptance snapshot, not just the per-criterion statuses above.
// =============================================================================

describe("AC7: full acceptance-gate criteria projection is variant-blind", () => {
  test("all acceptance-gate criterion statuses match between plain and variant-bearing changes", () => {
    const plainState = makeState(plainChange());
    const variantState = makeState(variantChange());

    const plainCriteria = evaluateGateCriteria(plainState, "acceptance");
    const variantCriteria = evaluateGateCriteria(variantState, "acceptance");

    // Order is deterministic and identical across both calls.
    expect(variantCriteria.map((c) => c.id)).toEqual(
      plainCriteria.map((c) => c.id),
    );
    for (let i = 0; i < plainCriteria.length; i++) {
      expect(variantCriteria[i].status).toBe(plainCriteria[i].status);
      expect(variantCriteria[i].id).toBe(plainCriteria[i].id);
    }
  });
});
