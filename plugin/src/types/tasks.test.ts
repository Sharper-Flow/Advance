/**
 * Tests for Task / WisdomDraft schema types (rq-wisdomAutoSurfacing01).
 *
 * Covers AC4 (WisdomDraft lifecycle) and AC7 (task-scoped drafts), plus
 * DDC3 (unique IDs per task — schema shape), DDC6 (backward-compat — existing
 * callers unaffected when wisdom_drafts absent).
 */
import { describe, expect, it } from "vitest";

import {
  ContractConflictKindSchema,
  ContractConflictSchema,
  DelegationRecoverySchema,
  ErrorRecoverySchema,
  FailureAttributionKindSchema,
  FailureAttributionSchema,
  TaskSchema,
  WisdomDraftDismissReasonSchema,
  WisdomDraftSchema,
  WisdomDraftStatusSchema,
  WisdomDraftSuggestedTypeSchema,
} from "./tasks";

describe("ErrorRecoverySchema", () => {
  const attempt = {
    attempt_number: 1,
    error: "expected read_model to equal disk",
    diagnosis: "The branch changed source semantics without base attribution.",
    fix_tried: "Inspect the failing assertion and branch/base diff.",
    strategy_label: "attribute-branch-base",
    outcome: "failed" as const,
    attempted_at: "2026-07-30T01:00:00.000Z",
  };

  it("derives retry_count from recorded attempts instead of rejecting drift", () => {
    const parsed = ErrorRecoverySchema.parse({
      last_error: attempt.error,
      retry_count: 2,
      max_retries: 3,
      error_class: "SEMANTIC",
      attempts: [attempt],
    });

    expect(parsed.retry_count).toBe(1);
    expect(parsed.attempts).toHaveLength(1);
  });

  it("keeps retry_count when no attempt history is recorded", () => {
    const parsed = ErrorRecoverySchema.parse({
      last_error: attempt.error,
      retry_count: 2,
      max_retries: 3,
      error_class: "SEMANTIC",
    });

    expect(parsed.retry_count).toBe(2);
    expect(parsed.attempts).toBeUndefined();
  });

  it("rejects recorded attempts that exceed the declared retry budget", () => {
    expect(() =>
      ErrorRecoverySchema.parse({
        last_error: attempt.error,
        retry_count: 1,
        max_retries: 1,
        error_class: "SEMANTIC",
        attempts: [
          attempt,
          { ...attempt, attempt_number: 2, strategy_label: "inspect-fixture" },
        ],
      }),
    ).toThrow();
  });

  it("rejects semantic retries that repeat a strategy label", () => {
    expect(() =>
      ErrorRecoverySchema.parse({
        last_error: attempt.error,
        retry_count: 2,
        max_retries: 3,
        error_class: "SEMANTIC",
        attempts: [attempt, { ...attempt, attempt_number: 2 }],
      }),
    ).toThrow();
  });

  it("rejects a retry count above the declared budget", () => {
    expect(() =>
      ErrorRecoverySchema.parse({
        last_error: attempt.error,
        retry_count: 4,
        max_retries: 3,
        error_class: "SEMANTIC",
        attempts: [
          attempt,
          { ...attempt, attempt_number: 2, strategy_label: "inspect-fixture" },
          { ...attempt, attempt_number: 3, strategy_label: "compare-base" },
          { ...attempt, attempt_number: 4, strategy_label: "route-review" },
        ],
      }),
    ).toThrow();
  });

  it("accepts a non-retry CONTRACT_CONFLICT error with failure attribution", () => {
    const parsed = ErrorRecoverySchema.parse({
      last_error: "Task contract refs conflict",
      retry_count: 0,
      max_retries: 0,
      error_class: "CONTRACT_CONFLICT",
      failure_attribution: {
        kind: "contract_conflict",
        description: "AC1 is both implemented and verified",
        contract_conflict: {
          kind: "overlapping_implements_verifies",
          contract_ids: ["AC1"],
          reason:
            "A task cannot both implement and verify the same acceptance criterion",
        },
      },
    });
    expect(parsed.error_class).toBe("CONTRACT_CONFLICT");
    expect(parsed.failure_attribution?.kind).toBe("contract_conflict");
  });

  it("rejects CONTRACT_CONFLICT with max_retries > 0", () => {
    expect(() =>
      ErrorRecoverySchema.parse({
        last_error: "Conflict",
        retry_count: 0,
        max_retries: 1,
        error_class: "CONTRACT_CONFLICT",
        failure_attribution: {
          kind: "contract_conflict",
          description: "Conflict",
          contract_conflict: {
            kind: "overlapping_implements_verifies",
            contract_ids: ["AC1"],
            reason: "Conflict",
          },
        },
      }),
    ).toThrow();
  });

  it("rejects CONTRACT_CONFLICT with retry_count > 0", () => {
    expect(() =>
      ErrorRecoverySchema.parse({
        last_error: "Conflict",
        retry_count: 1,
        max_retries: 0,
        error_class: "CONTRACT_CONFLICT",
        failure_attribution: {
          kind: "contract_conflict",
          description: "Conflict",
          contract_conflict: {
            kind: "overlapping_implements_verifies",
            contract_ids: ["AC1"],
            reason: "Conflict",
          },
        },
      }),
    ).toThrow();
  });

  it("rejects CONTRACT_CONFLICT with attempts", () => {
    expect(() =>
      ErrorRecoverySchema.parse({
        last_error: "Conflict",
        retry_count: 0,
        max_retries: 0,
        error_class: "CONTRACT_CONFLICT",
        attempts: [attempt],
        failure_attribution: {
          kind: "contract_conflict",
          description: "Conflict",
          contract_conflict: {
            kind: "overlapping_implements_verifies",
            contract_ids: ["AC1"],
            reason: "Conflict",
          },
        },
      }),
    ).toThrow();
  });

  it("rejects CONTRACT_CONFLICT without a contract_conflict failure attribution", () => {
    expect(() =>
      ErrorRecoverySchema.parse({
        last_error: "Conflict",
        retry_count: 0,
        max_retries: 0,
        error_class: "CONTRACT_CONFLICT",
      }),
    ).toThrow();
  });

  it("rejects CONTRACT_CONFLICT with a non-contract_conflict attribution", () => {
    expect(() =>
      ErrorRecoverySchema.parse({
        last_error: "Conflict",
        retry_count: 0,
        max_retries: 0,
        error_class: "CONTRACT_CONFLICT",
        failure_attribution: {
          kind: "unknown",
          description: "Not a contract conflict",
        },
      }),
    ).toThrow();
  });
});

// -----------------------------------------------------------------------------
// Delegation Recovery (AC5)
// -----------------------------------------------------------------------------

describe("DelegationRecoverySchema", () => {
  it("accepts an initial empty/malformed incident with no retry yet", () => {
    const parsed = DelegationRecoverySchema.parse({
      empty_or_malformed_count: 1,
      narrower_retry_count: 0,
      inline_diagnosis_evidence: false,
      last_updated_at: "2026-07-30T01:00:00.000Z",
    });
    expect(parsed.empty_or_malformed_count).toBe(1);
    expect(parsed.narrower_retry_count).toBe(0);
    expect(parsed.inline_diagnosis_evidence).toBe(false);
  });

  it("accepts the single narrower retry when inline diagnosis evidence exists", () => {
    const parsed = DelegationRecoverySchema.parse({
      empty_or_malformed_count: 1,
      narrower_retry_count: 1,
      inline_diagnosis_evidence: true,
      last_updated_at: "2026-07-30T01:00:00.000Z",
    });
    expect(parsed.narrower_retry_count).toBe(1);
    expect(parsed.inline_diagnosis_evidence).toBe(true);
  });

  it("rejects more than one narrower retry", () => {
    expect(() =>
      DelegationRecoverySchema.parse({
        empty_or_malformed_count: 1,
        narrower_retry_count: 2,
        inline_diagnosis_evidence: true,
        last_updated_at: "2026-07-30T01:00:00.000Z",
      }),
    ).toThrow();
  });

  it("accepts the single narrower retry before inline diagnosis evidence is recorded", () => {
    const parsed = DelegationRecoverySchema.parse({
      empty_or_malformed_count: 1,
      narrower_retry_count: 1,
      inline_diagnosis_evidence: false,
      last_updated_at: "2026-07-30T01:00:00.000Z",
    });
    expect(parsed.narrower_retry_count).toBe(1);
    expect(parsed.inline_diagnosis_evidence).toBe(false);
  });

  it("rejects a second narrower retry even if inline diagnosis evidence is missing", () => {
    expect(() =>
      DelegationRecoverySchema.parse({
        empty_or_malformed_count: 2,
        narrower_retry_count: 2,
        inline_diagnosis_evidence: false,
        last_updated_at: "2026-07-30T01:00:00.000Z",
      }),
    ).toThrow();
  });

  it("rejects more retries than recorded incidents", () => {
    expect(() =>
      DelegationRecoverySchema.parse({
        empty_or_malformed_count: 0,
        narrower_retry_count: 1,
        inline_diagnosis_evidence: false,
        last_updated_at: "2026-07-30T01:00:00.000Z",
      }),
    ).toThrow();
  });

  it("accepts resolved recovery after inline diagnosis evidence is recorded", () => {
    const parsed = DelegationRecoverySchema.parse({
      empty_or_malformed_count: 2,
      narrower_retry_count: 1,
      inline_diagnosis_evidence: true,
      last_updated_at: "2026-07-30T01:00:00.000Z",
      blocked_scope: "implementation:tk-570509ffe024",
    });
    expect(parsed.inline_diagnosis_evidence).toBe(true);
    expect(parsed.blocked_scope).toBe("implementation:tk-570509ffe024");
  });

  it("exposes recovery as a task field (structural, not prose)", () => {
    const parsed = TaskSchema.parse({
      id: "tk-delegation01",
      title: "bounded recovery test",
      status: "in_progress",
      created_at: "2026-07-30T01:00:00.000Z",
      delegation_recovery: {
        empty_or_malformed_count: 1,
        narrower_retry_count: 0,
        inline_diagnosis_evidence: false,
        last_updated_at: "2026-07-30T01:00:00.000Z",
      },
    });
    expect(parsed.delegation_recovery).toBeDefined();
    expect(parsed.delegation_recovery?.empty_or_malformed_count).toBe(1);
  });
});

// -----------------------------------------------------------------------------
// Failure Attribution
// -----------------------------------------------------------------------------

describe("FailureAttributionSchema", () => {
  it("accepts a contract_conflict attribution", () => {
    const attribution = {
      kind: "contract_conflict",
      description: "Task implements and verifies the same AC",
      contract_conflict: {
        kind: "overlapping_implements_verifies",
        contract_ids: ["AC1"],
        reason:
          "A task cannot both implement and verify the same acceptance criterion",
      },
    };
    expect(FailureAttributionSchema.parse(attribution)).toEqual(attribution);
  });

  it("accepts an implementation_defect attribution with contract refs", () => {
    const attribution = {
      kind: "implementation_defect",
      description: "Logic error in retry counter",
      contract_refs: {
        implements: ["AC2"],
        respects: ["C1"],
      },
    };
    expect(FailureAttributionSchema.parse(attribution)).toEqual(attribution);
  });

  it("accepts an unknown attribution without contract refs", () => {
    const attribution = {
      kind: "unknown",
      description: "Unclassified failure",
    };
    expect(FailureAttributionSchema.parse(attribution)).toEqual(attribution);
  });

  it("rejects a contract_conflict attribution without contract_conflict details", () => {
    expect(() =>
      FailureAttributionSchema.parse({
        kind: "contract_conflict",
        description: "Missing details",
      }),
    ).toThrow();
  });

  it("rejects an invalid attribution kind", () => {
    expect(() =>
      FailureAttributionSchema.parse({
        kind: "design_flaw",
        description: "Not a valid kind",
      }),
    ).toThrow();
  });

  it("rejects an empty description", () => {
    expect(() =>
      FailureAttributionSchema.parse({
        kind: "infrastructure",
        description: "",
      }),
    ).toThrow();
  });
});

describe("ContractConflictSchema", () => {
  it("accepts a valid contract conflict", () => {
    const conflict = {
      kind: "implements_respects_overlap",
      contract_ids: ["AC1", "C1"],
      reason: "AC1 is both implemented and respected",
    };
    expect(ContractConflictSchema.parse(conflict)).toEqual(conflict);
  });

  it("rejects an invalid conflict kind", () => {
    expect(() =>
      ContractConflictSchema.parse({
        kind: "duplicate_task",
        contract_ids: ["AC1"],
        reason: "Not a valid kind",
      }),
    ).toThrow();
  });

  it("rejects empty contract_ids", () => {
    expect(() =>
      ContractConflictSchema.parse({
        kind: "missing_required_respects",
        contract_ids: [],
        reason: "No ids",
      }),
    ).toThrow();
  });

  it("rejects missing reason", () => {
    expect(() =>
      ContractConflictSchema.parse({
        kind: "not_applicable_with_refs",
        contract_ids: ["AC1"],
      }),
    ).toThrow();
  });

  it("exposes the expected finite vocabularies", () => {
    expect(FailureAttributionKindSchema.options).toEqual([
      "contract_conflict",
      "implementation_defect",
      "infrastructure",
      "external_service",
      "unknown",
    ]);
    expect(ContractConflictKindSchema.options).toEqual([
      "overlapping_implements_verifies",
      "implements_respects_overlap",
      "missing_required_respects",
      "not_applicable_with_refs",
      "unattributed_acceptance_criterion",
    ]);
  });
});

// -----------------------------------------------------------------------------
// WisdomDraft schema
// -----------------------------------------------------------------------------

describe("WisdomDraftSchema", () => {
  it("accepts a fully-populated draft", () => {
    const draft = {
      id: "dr-abcdef12",
      suggested_type: "failure",
      suggested_content: "missing import → add path alias",
      source_attempts: [1, 2],
      status: "suggested",
      created_at: "2026-07-21T17:00:00.000Z",
    };
    expect(WisdomDraftSchema.parse(draft)).toEqual(draft);
  });

  it("accepts a minimal draft with only required fields", () => {
    const draft = {
      id: "dr-00000000",
      suggested_type: "gotcha",
      suggested_content: "zod passthrough swallows extras",
      status: "suggested",
      created_at: "2026-07-21T17:00:00.000Z",
    };
    expect(WisdomDraftSchema.parse(draft)).toEqual(draft);
  });

  it("accepts a promoted draft with promoted_wisdom_id", () => {
    const draft = {
      id: "dr-11111111",
      suggested_type: "failure",
      suggested_content: "race on signal → atomic set",
      status: "promoted",
      created_at: "2026-07-21T17:00:00.000Z",
      promoted_wisdom_id: "w-xyz",
    };
    expect(WisdomDraftSchema.parse(draft)).toEqual(draft);
  });

  it("accepts a dismissed draft with auto_checkpoint reason", () => {
    const draft = {
      id: "dr-22222222",
      suggested_type: "failure",
      suggested_content: "type mismatch → narrow union",
      status: "dismissed",
      created_at: "2026-07-21T17:00:00.000Z",
      dismissed_at: "2026-07-21T17:30:00.000Z",
      dismiss_reason: "auto_checkpoint",
    };
    expect(WisdomDraftSchema.parse(draft)).toEqual(draft);
  });

  it("accepts a dismissed draft with user_dismissed reason", () => {
    const draft = {
      id: "dr-33333333",
      suggested_type: "failure",
      suggested_content: "wrong retry policy → use exponential",
      status: "dismissed",
      created_at: "2026-07-21T17:00:00.000Z",
      dismissed_at: "2026-07-21T17:30:00.000Z",
      dismiss_reason: "user_dismissed",
    };
    expect(WisdomDraftSchema.parse(draft)).toEqual(draft);
  });

  it("rejects an invalid status enum value", () => {
    const draft = {
      id: "dr-44444444",
      suggested_type: "failure",
      suggested_content: "x",
      status: "rejected", // not in enum — no rejected state per AC4
      created_at: "2026-07-21T17:00:00.000Z",
    };
    expect(() => WisdomDraftSchema.parse(draft)).toThrow();
  });

  it("rejects an invalid dismiss_reason enum value", () => {
    const draft = {
      id: "dr-55555555",
      suggested_type: "failure",
      suggested_content: "x",
      status: "dismissed",
      created_at: "2026-07-21T17:00:00.000Z",
      dismiss_reason: "expired", // not in enum
    };
    expect(() => WisdomDraftSchema.parse(draft)).toThrow();
  });

  it("rejects an invalid suggested_type enum value", () => {
    const draft = {
      id: "dr-66666666",
      suggested_type: "convention", // not in enum — WisdomDraft is failure|gotcha
      suggested_content: "x",
      status: "suggested",
      created_at: "2026-07-21T17:00:00.000Z",
    };
    expect(() => WisdomDraftSchema.parse(draft)).toThrow();
  });

  it("rejects a draft missing required id", () => {
    const draft = {
      suggested_type: "failure",
      suggested_content: "x",
      status: "suggested",
      created_at: "2026-07-21T17:00:00.000Z",
    };
    expect(() => WisdomDraftSchema.parse(draft)).toThrow();
  });

  it("rejects a draft missing required status", () => {
    const draft = {
      id: "dr-77777777",
      suggested_type: "failure",
      suggested_content: "x",
      created_at: "2026-07-21T17:00:00.000Z",
    };
    expect(() => WisdomDraftSchema.parse(draft)).toThrow();
  });

  it("enum schemas export the expected finite vocabularies", () => {
    // Lock the lifecycle vocabulary per AC4 / D3.
    expect(WisdomDraftStatusSchema.options).toEqual([
      "suggested",
      "promoted",
      "dismissed",
    ]);
    expect(WisdomDraftDismissReasonSchema.options).toEqual([
      "auto_checkpoint",
      "user_dismissed",
    ]);
    expect(WisdomDraftSuggestedTypeSchema.options).toEqual([
      "failure",
      "gotcha",
    ]);
  });
});

// -----------------------------------------------------------------------------
// TaskSchema backward-compat + wisdom_drafts extension (DDC6, AC7)
// -----------------------------------------------------------------------------

const baseTask = {
  id: "tk-abc123",
  title: "Sample task",
  status: "pending",
  created_at: "2026-07-21T17:00:00.000Z",
} as const;

describe("TaskSchema wisdom_drafts extension", () => {
  it("accepts a task without wisdom_drafts (DDC6 backward-compat)", () => {
    const parsed = TaskSchema.parse(baseTask);
    expect(parsed.wisdom_drafts).toBeUndefined();
  });

  it("accepts a task with an empty wisdom_drafts array", () => {
    const parsed = TaskSchema.parse({ ...baseTask, wisdom_drafts: [] });
    expect(parsed.wisdom_drafts).toEqual([]);
  });

  it("accepts a task with a valid wisdom_drafts entry", () => {
    const draft = {
      id: "dr-aaaaaaaa",
      suggested_type: "failure" as const,
      suggested_content: "missing await → add await",
      source_attempts: [1],
      status: "suggested" as const,
      created_at: "2026-07-21T17:00:00.000Z",
    };
    const parsed = TaskSchema.parse({ ...baseTask, wisdom_drafts: [draft] });
    expect(parsed.wisdom_drafts).toHaveLength(1);
    expect(parsed.wisdom_drafts?.[0].id).toBe("dr-aaaaaaaa");
  });

  it("accepts a task with multiple drafts (lifecycle coexistence)", () => {
    const drafts = [
      {
        id: "dr-bbbbbbbb1",
        suggested_type: "failure" as const,
        suggested_content: "draft 1",
        status: "suggested" as const,
        created_at: "2026-07-21T17:00:00.000Z",
      },
      {
        id: "dr-bbbbbbbb2",
        suggested_type: "failure" as const,
        suggested_content: "draft 2",
        status: "promoted" as const,
        created_at: "2026-07-21T17:00:00.000Z",
        promoted_wisdom_id: "w-1",
      },
      {
        id: "dr-bbbbbbbb3",
        suggested_type: "gotcha" as const,
        suggested_content: "draft 3",
        status: "dismissed" as const,
        created_at: "2026-07-21T17:00:00.000Z",
        dismissed_at: "2026-07-21T17:30:00.000Z",
        dismiss_reason: "auto_checkpoint" as const,
      },
    ];
    const parsed = TaskSchema.parse({ ...baseTask, wisdom_drafts: drafts });
    expect(parsed.wisdom_drafts).toHaveLength(3);
    expect(parsed.wisdom_drafts?.map((d) => d.status)).toEqual([
      "suggested",
      "promoted",
      "dismissed",
    ]);
  });

  it("rejects a task with an invalid wisdom_drafts entry", () => {
    const badDraft = {
      id: "dr-cccccccc",
      suggested_type: "failure",
      suggested_content: "x",
      status: "suggested",
      created_at: "2026-07-21T17:00:00.000Z",
      dismiss_reason: "auto_checkpoint", // invalid: only valid on dismissed status
    };
    // Schema doesn't enforce status/dismiss_reason cross-field invariant
    // (that's workflow logic), but it does enforce enum membership. Test the
    // stronger invalid case: bad status value.
    const worseDraft = { ...badDraft, status: "expired" };
    expect(() =>
      TaskSchema.parse({ ...baseTask, wisdom_drafts: [worseDraft] }),
    ).toThrow();
  });

  it("preserves other Task fields when wisdom_drafts is present", () => {
    const draft = {
      id: "dr-dddddddd",
      suggested_type: "failure" as const,
      suggested_content: "x",
      status: "suggested" as const,
      created_at: "2026-07-21T17:00:00.000Z",
    };
    const taskWithExtras = {
      ...baseTask,
      type: "code" as const,
      priority: 5,
      evidence_policy: "test",
      wisdom_drafts: [draft],
    };
    const parsed = TaskSchema.parse(taskWithExtras);
    expect(parsed.id).toBe("tk-abc123");
    expect(parsed.priority).toBe(5);
    expect(parsed.wisdom_drafts).toHaveLength(1);
  });
});
