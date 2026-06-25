/**
 * Prep-readiness TDD-inversion severity tests (rq-PR003tdd.1, AC4 of
 * remediateSlopScanFindings / QUAL-012).
 *
 * The metadata-less title-heuristic inversion finding must be ADVISORY
 * (severity "warning"), not a gate-blocking "error". A title regex must not
 * solely own a hard gate-block (P33); the authoritative block for missing or
 * invalid TDD intent remains TASK_TDD_INTENT_MISSING. This aligns
 * prep-readiness with the permissive tdd-contract rq-TDD002sep.2 stance.
 */

import { describe, expect, test } from "vitest";
import {
  runPrepReadinessChecks,
  checkCriticalOpsCoverage,
} from "./prep-readiness";
import type { Change, TaskType } from "../types";

/**
 * Two metadata-less tasks: a test task (by title heuristic) blocked_by an
 * implementation task (by title heuristic) — the canonical heuristic-path
 * inversion shape.
 */
function buildInversionChange(): Change {
  return {
    id: "c-inversion",
    title: "Inversion fixture",
    status: "active",
    created_at: "2026-06-02T00:00:00.000Z",
    deltas: {},
    tasks: [
      {
        id: "impl",
        title: "Implement the parser",
        status: "pending",
        deps: [],
        metadata: {},
      },
      {
        id: "test",
        title: "Add failing test for the parser",
        status: "pending",
        deps: [{ type: "blocked_by", target: "impl" }],
        metadata: {},
      },
    ],
  } as unknown as Change;
}

describe("checkTaskGraphIntegrity — TDD inversion severity (rq-PR003tdd.1, AC4)", () => {
  test("heuristic-path inversion is advisory warning, not a gate-blocking error (strict)", () => {
    const result = runPrepReadinessChecks(buildInversionChange(), "strict");
    const inversion = [...result.mustFailures, ...result.warnings].filter(
      (i) => i.code === "TASK_TDD_INVERSION",
    );
    expect(inversion).toHaveLength(1);
    expect(inversion[0].severity).toBe("warning");
    expect(
      result.mustFailures.some((i) => i.code === "TASK_TDD_INVERSION"),
    ).toBe(false);
    expect(result.warnings.some((i) => i.code === "TASK_TDD_INVERSION")).toBe(
      true,
    );
  });

  test("missing tdd_intent still blocks via TASK_TDD_INTENT_MISSING in strict mode", () => {
    const result = runPrepReadinessChecks(buildInversionChange(), "strict");
    expect(
      result.mustFailures.some((i) => i.code === "TASK_TDD_INTENT_MISSING"),
    ).toBe(true);
  });

  test("advisory/off enforcement still emits inversion as a warning", () => {
    for (const mode of ["advisory", "off"] as const) {
      const result = runPrepReadinessChecks(buildInversionChange(), mode);
      const inversion = [...result.mustFailures, ...result.warnings].filter(
        (i) => i.code === "TASK_TDD_INVERSION",
      );
      expect(inversion).toHaveLength(1);
      expect(inversion[0].severity).toBe("warning");
    }
  });
});

// =============================================================================
// Critical-Ops Coverage (rq-PR007cro)
// =============================================================================

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

describe("checkCriticalOpsCoverage", () => {
  test("requiredCritical item with task coverage produces no issues", () => {
    const change = buildChangeWithContract(
      [{ id: "AC-1", requiredCritical: true }],
      [
        {
          id: "tk-1",
          status: "pending",
          contract_refs: { implements: ["AC-1"] },
        },
      ],
    );
    const issues = checkCriticalOpsCoverage(change);
    expect(issues).toHaveLength(0);
  });

  test("requiredCritical item without task coverage produces CRITICAL_OPS_UNCOVERED error", () => {
    const change = buildChangeWithContract(
      [{ id: "AC-1", requiredCritical: true }],
      [],
    );
    const issues = checkCriticalOpsCoverage(change);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("CRITICAL_OPS_UNCOVERED");
    expect(issues[0].severity).toBe("error");
  });

  test("requiredCritical item with notRequiredReason is exempt (alternate route)", () => {
    const change = buildChangeWithContract(
      [
        {
          id: "AC-1",
          requiredCritical: true,
          notRequiredReason: "Covered by upstream contract",
        },
      ],
      [],
    );
    const issues = checkCriticalOpsCoverage(change);
    expect(issues).toHaveLength(0);
  });

  test("non-requiredCritical item without coverage produces no error from this check", () => {
    const change = buildChangeWithContract(
      [{ id: "AC-1", requiredCritical: false }],
      [],
    );
    const issues = checkCriticalOpsCoverage(change);
    expect(issues).toHaveLength(0);
  });

  test("requiredCritical item with cancelled task coverage is still uncovered", () => {
    const change = buildChangeWithContract(
      [{ id: "AC-1", requiredCritical: true }],
      [
        {
          id: "tk-1",
          status: "cancelled",
          contract_refs: { verifies: ["AC-1"] },
        },
      ],
    );
    const issues = checkCriticalOpsCoverage(change);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("CRITICAL_OPS_UNCOVERED");
    expect(issues[0].severity).toBe("error");
  });

  test("requiredCritical item with verifies coverage produces no issues", () => {
    const change = buildChangeWithContract(
      [{ id: "SC-1", requiredCritical: true, kind: "success_criterion" }],
      [
        {
          id: "tk-1",
          status: "pending",
          contract_refs: { verifies: ["SC-1"] },
        },
      ],
    );
    const issues = checkCriticalOpsCoverage(change);
    expect(issues).toHaveLength(0);
  });

  test("requiredCritical item with verificationRequired:false still needs coverage", () => {
    const change = buildChangeWithContract(
      [{ id: "AC-1", requiredCritical: true, verificationRequired: false }],
      [],
    );
    const issues = checkCriticalOpsCoverage(change);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("CRITICAL_OPS_UNCOVERED");
    expect(issues[0].severity).toBe("error");
  });
});

// =============================================================================
// Non-Code Task Evidence Policy Readiness (rq-PR008nonCodeEvidence)
// =============================================================================

const NON_CODE_TYPES: TaskType[] = [
  "docs",
  "research",
  "approval",
  "verification",
  "ops",
];

const NON_CODE_EVIDENCE_POLICIES = [
  "source_citation",
  "source_audit",
  "rubric_review",
  "stakeholder_acceptance",
  "artifact_reference",
];

function buildNonCodeTask(
  type: TaskType,
  opts: {
    evidence_policy?: string;
    tdd_intent?: string;
    status?: string;
    not_applicable_reason?: string;
  } = {},
): any {
  const tddIntentByType: Record<TaskType, string> = {
    code: "inline",
    verification: "separate_verification",
    docs: "not_applicable",
    research: "not_applicable",
    approval: "not_applicable",
    ops: "not_applicable",
  };
  return {
    id: `tk-${type}`,
    title: `${type} task`,
    type,
    status: opts.status ?? "pending",
    deps: [],
    metadata: {
      tdd_intent: opts.tdd_intent ?? tddIntentByType[type],
    },
    ...(opts.evidence_policy && { evidence_policy: opts.evidence_policy }),
    ...(opts.not_applicable_reason && {
      contract_refs: { not_applicable_reason: opts.not_applicable_reason },
    }),
  };
}

function buildNonCodeChange(tasks: any[]): Change {
  return {
    id: "c-noncode",
    title: "Non-code fixture",
    status: "active",
    created_at: "2026-06-02T00:00:00.000Z",
    deltas: {},
    tasks,
  } as unknown as Change;
}

describe("checkNonCodeEvidencePolicy — rq-PR008nonCodeEvidence", () => {
  test.each(NON_CODE_TYPES)(
    "non-code task %s without evidence_policy blocks prep",
    (type) => {
      const result = runPrepReadinessChecks(
        buildNonCodeChange([buildNonCodeTask(type)]),
        "strict",
      );
      expect(
        result.mustFailures.some(
          (i) => i.code === "NON_CODE_EVIDENCE_POLICY_MISSING",
        ),
      ).toBe(true);
      expect(result.passed).toBe(false);
    },
  );

  test.each(NON_CODE_EVIDENCE_POLICIES)(
    "research task with %s evidence policy passes readiness",
    (policy) => {
      const result = runPrepReadinessChecks(
        buildNonCodeChange([
          buildNonCodeTask("research", { evidence_policy: policy }),
        ]),
        "strict",
      );
      expect(
        result.mustFailures.some(
          (i) => i.code === "NON_CODE_EVIDENCE_POLICY_MISSING",
        ),
      ).toBe(false);
      expect(result.passed).toBe(true);
    },
  );

  test("code task without evidence_policy does not trigger non-code error", () => {
    const result = runPrepReadinessChecks(
      buildNonCodeChange([buildNonCodeTask("code")]),
      "strict",
    );
    expect(
      result.mustFailures.some(
        (i) => i.code === "NON_CODE_EVIDENCE_POLICY_MISSING",
      ),
    ).toBe(false);
    expect(
      result.warnings.some(
        (i) => i.code === "NON_CODE_EVIDENCE_POLICY_MISSING",
      ),
    ).toBe(false);
  });

  test("cancelled non-code task missing evidence_policy is exempt", () => {
    const result = runPrepReadinessChecks(
      buildNonCodeChange([
        buildNonCodeTask("research", { status: "cancelled" }),
      ]),
      "strict",
    );
    expect(
      result.mustFailures.some(
        (i) => i.code === "NON_CODE_EVIDENCE_POLICY_MISSING",
      ),
    ).toBe(false);
  });

  test("non-code task with evidence_policy not_applicable requires rationale", () => {
    const result = runPrepReadinessChecks(
      buildNonCodeChange([
        buildNonCodeTask("docs", { evidence_policy: "not_applicable" }),
      ]),
      "strict",
    );
    expect(
      result.mustFailures.some(
        (i) => i.code === "NON_CODE_EVIDENCE_POLICY_MISSING",
      ),
    ).toBe(true);
    expect(result.passed).toBe(false);
  });

  test("non-code task with evidence_policy not_applicable and rationale passes", () => {
    const result = runPrepReadinessChecks(
      buildNonCodeChange([
        buildNonCodeTask("docs", {
          evidence_policy: "not_applicable",
          not_applicable_reason: "Approval bookkeeping only",
        }),
      ]),
      "strict",
    );
    expect(
      result.mustFailures.some(
        (i) => i.code === "NON_CODE_EVIDENCE_POLICY_MISSING",
      ),
    ).toBe(false);
    expect(result.passed).toBe(true);
  });
});

// =============================================================================
// Frontend Applicability Metadata Readiness (rq-PR009frontendApplicability)
// =============================================================================

function buildFrontendTask(opts: {
  id?: string;
  title?: string;
  metadata?: Record<string, string>;
  status?: string;
}): any {
  return {
    id: opts.id ?? "tk-frontend",
    title: opts.title ?? "Implement Button component",
    type: "code",
    status: opts.status ?? "pending",
    deps: [],
    metadata: {
      tdd_intent: "inline",
      ...(opts.metadata ?? {}),
    },
  };
}

describe("checkFrontendApplicability — rq-PR009frontendApplicability", () => {
  test("structured frontend task without metadata.frontend blocks prep", () => {
    const result = runPrepReadinessChecks(
      buildNonCodeChange([
        buildFrontendTask({ metadata: { frontend_required: "true" } }),
      ]),
      "strict",
    );

    expect(
      result.mustFailures.some(
        (i) => i.code === "FRONTEND_APPLICABILITY_MISSING",
      ),
    ).toBe(true);
    expect(result.passed).toBe(false);
  });

  test("metadata.frontend true satisfies structured frontend applicability", () => {
    const result = runPrepReadinessChecks(
      buildNonCodeChange([
        buildFrontendTask({
          metadata: { frontend_required: "true", frontend: "true" },
        }),
      ]),
      "strict",
    );

    expect(
      result.mustFailures.some((i) => i.code.startsWith("FRONTEND_")),
    ).toBe(false);
  });

  test("metadata.frontend false in structured design scope requires rationale", () => {
    const result = runPrepReadinessChecks(
      buildNonCodeChange([
        buildFrontendTask({
          title: "Update review packet contract",
          metadata: { frontend_scope: "true", frontend: "false" },
        }),
      ]),
      "strict",
    );

    expect(
      result.mustFailures.some((i) => i.code === "FRONTEND_RATIONALE_MISSING"),
    ).toBe(true);
  });

  test("metadata.frontend false with rationale passes structured design scope", () => {
    const result = runPrepReadinessChecks(
      buildNonCodeChange([
        buildFrontendTask({
          title: "Update review packet contract",
          metadata: {
            frontend_scope: "true",
            frontend: "false",
            frontend_rationale: "Review workflow only; no UI files owned.",
          },
        }),
      ]),
      "strict",
    );

    expect(
      result.mustFailures.some((i) => i.code.startsWith("FRONTEND_")),
    ).toBe(false);
  });

  test("heuristic frontend-looking task emits warning only", () => {
    const result = runPrepReadinessChecks(
      buildNonCodeChange([buildFrontendTask({ title: "Update Button.tsx" })]),
      "strict",
    );

    expect(
      result.warnings.some((i) => i.code === "FRONTEND_APPLICABILITY_HINT"),
    ).toBe(true);
    expect(
      result.mustFailures.some((i) => i.code === "FRONTEND_APPLICABILITY_HINT"),
    ).toBe(false);
  });
});
