/**
 * Loop Ledger — typed read/projection model over existing ADV loop evidence.
 *
 * This module is intentionally pure and workflow-safe: it imports only `zod`
 * so it can be reached from storage, the tool layer, and tests
 * without crossing storage/tool boundaries.
 *
 * The loop ledger is a READBACK/PROJECTION vocabulary only. It never
 * authorizes task, contract, report, or gate completion (AC5/D5). Existing
 * authorities (task status, testRunRecordedSignal ordering, sub-agent report
 * consumers, contract review matrix, gate-readiness) remain authoritative.
 */

import { z } from "zod";

export const LOOP_LEDGER_SCHEMA_VERSION = "1.0";

// =============================================================================
// Vocabulary
// =============================================================================

/**
 * Loop classes covered in v1 (agreement: all existing user-relevant loops).
 */
export const LoopKindSchema = z.enum([
  "apply_retry",
  "review_remediation",
  "harden_remediation",
  "verification_triage",
  "ci_repair",
]);
export type LoopKind = z.infer<typeof LoopKindSchema>;

/**
 * User-visible outcome vocabulary. Deliberately separate from source-specific
 * error classification (D2): task retry uses TRANSIENT/SEMANTIC/ENVIRONMENTAL/
 * FATAL; verification triage adds UNKNOWN. UNKNOWN / routing-only triage maps
 * to `inconclusive` and MUST NOT increment the task retry-failure budget.
 */
export const LoopVerdictSchema = z.enum([
  "pass",
  "fail",
  "blocked",
  "inconclusive",
]);
export type LoopVerdict = z.infer<typeof LoopVerdictSchema>;

/**
 * Pointer to the underlying evidence a ledger entry is derived from (AC4).
 * Discriminated on `kind` so consumers can route to the source authority.
 */
export const LoopSourceRefSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("task"),
      taskId: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("report"),
      /** Stable sub-agent report identity (see `subagentReportKey`). */
      reportKey: z.string().min(1),
      agent: z.string().min(1),
      attempt: z.number().int().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("test_run"),
      taskId: z.string().min(1),
      runId: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("ci_check"),
      repo: z.string().min(1),
      checkName: z.string().min(1),
      headSha: z.string().min(1),
      runUrl: z.string().min(1).optional(),
    })
    .strict(),
]);
export type LoopSourceRef = z.infer<typeof LoopSourceRefSchema>;

// =============================================================================
// Count objects (all keys optional → legacy/empty tolerant)
// =============================================================================

const LoopKindCountSchema = z
  .object({
    apply_retry: z.number().int().nonnegative().optional(),
    review_remediation: z.number().int().nonnegative().optional(),
    harden_remediation: z.number().int().nonnegative().optional(),
    verification_triage: z.number().int().nonnegative().optional(),
    ci_repair: z.number().int().nonnegative().optional(),
  })
  .strict();

const LoopVerdictCountSchema = z
  .object({
    pass: z.number().int().nonnegative().optional(),
    fail: z.number().int().nonnegative().optional(),
    blocked: z.number().int().nonnegative().optional(),
    inconclusive: z.number().int().nonnegative().optional(),
  })
  .strict();

// =============================================================================
// Entry
// =============================================================================

/**
 * A single recorded or derived loop entry. Exposes the AC1 surface:
 * kind, producer, evaluator, attempt count, verdict, next action, stop reason.
 *
 * Evidence-only: a `pass` verdict here does NOT complete any task/gate (AC5).
 */
export const LoopLedgerEntrySchema = z
  .object({
    /** Stable dedupe identity: source kind + source id/report key + attempt. */
    id: z.string().min(1),
    kind: LoopKindSchema,
    /** Agent/loop that emitted the evidence (e.g. adv-reviewer, apply). */
    producer: z.string().min(1),
    /** Authority that produced the verdict (e.g. adv-reviewer, task-completion). */
    evaluator: z.string().min(1),
    attemptCount: z.number().int().nonnegative(),
    verdict: LoopVerdictSchema,
    /** Source-specific error class preserved separately from verdict (D2). */
    errorClass: z.string().min(1).optional(),
    nextAction: z.string(),
    /** Why the loop stopped; omitted while the loop is ongoing. */
    stopReason: z.string().min(1).optional(),
    sourceRefs: z.array(LoopSourceRefSchema).default([]),
    /** ISO timestamp of the latest evidence, when derivable. */
    recordedAt: z.string().min(1).optional(),
    /** Convenience linkage to the owning task, when one exists. */
    taskId: z.string().min(1).optional(),
  })
  .passthrough();
export type LoopLedgerEntry = z.infer<typeof LoopLedgerEntrySchema>;

// =============================================================================
// Summary (compact default readback — AC3/DDC1)
// =============================================================================

export const LoopLedgerSourceTotalsSchema = z
  .object({
    tasks: z.number().int().nonnegative().default(0),
    reports: z.number().int().nonnegative().default(0),
    testRuns: z.number().int().nonnegative().default(0),
    ciChecks: z.number().int().nonnegative().default(0),
  })
  .strict();
export type LoopLedgerSourceTotals = z.infer<
  typeof LoopLedgerSourceTotalsSchema
>;

export const LoopLedgerLatestStatusSchema = z
  .object({
    id: z.string().min(1),
    kind: LoopKindSchema,
    verdict: LoopVerdictSchema,
    recordedAt: z.string().min(1).optional(),
    taskId: z.string().min(1).optional(),
  })
  .strict();
export type LoopLedgerLatestStatus = z.infer<
  typeof LoopLedgerLatestStatusSchema
>;

export const LoopLedgerSummarySchema = z
  .object({
    totalEntries: z.number().int().nonnegative(),
    byKind: LoopKindCountSchema.default({}),
    byVerdict: LoopVerdictCountSchema.default({}),
    /** Most recent entry by recordedAt (then id); omitted when no entries. */
    latestStatus: LoopLedgerLatestStatusSchema.optional(),
    sourceTotals: LoopLedgerSourceTotalsSchema.default({
      tasks: 0,
      reports: 0,
      testRuns: 0,
      ciChecks: 0,
    }),
    /**
     * Entries that contribute to the task retry-failure budget. Only `fail`
     * verdicts count; `inconclusive` (UNKNOWN/routing-only) and `blocked`
     * never increment it (AC2/DDC4).
     */
    retryFailureCount: z.number().int().nonnegative().default(0),
    inconclusiveCount: z.number().int().nonnegative().default(0),
  })
  .passthrough();
export type LoopLedgerSummary = z.infer<typeof LoopLedgerSummarySchema>;

// =============================================================================
// Readback (top-level include result)
// =============================================================================

export const LoopLedgerReadbackSchema = z
  .object({
    version: z.literal(LOOP_LEDGER_SCHEMA_VERSION),
    summary: LoopLedgerSummarySchema,
    /** Present only on explicit detail opt-in; bounded by detailsLimit. */
    details: z.array(LoopLedgerEntrySchema).optional(),
    detailsTruncated: z.boolean().optional(),
    detailsLimit: z.number().int().positive().optional(),
  })
  .passthrough();
export type LoopLedgerReadback = z.infer<typeof LoopLedgerReadbackSchema>;
