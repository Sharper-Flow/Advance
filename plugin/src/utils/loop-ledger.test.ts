import { describe, expect, it } from "vitest";

import {
  LoopLedgerReadbackSchema,
  LoopLedgerEntrySchema,
} from "../types/loop-ledger";
import { projectLoopLedger } from "./loop-ledger";

// ---------------------------------------------------------------------------
// Fixture builders — structural, legacy-tolerant shapes (not full Change/Task)
// ---------------------------------------------------------------------------

function reviewerReport(over: Record<string, unknown> = {}) {
  return {
    schema_version: "1.0",
    change_id: "addLoopLedger",
    task_id: "tk-1",
    attempt: 1,
    workdir_used: "/wt",
    agent: "adv-reviewer",
    scope: { kind: "task", task_id: "tk-1" },
    phase: "review",
    verdict: "NEEDS_WORK",
    blocking_findings: [],
    nonblocking_findings: [],
    changes_made: [],
    wisdom_candidates: [],
    verification: { tests_run: [], results: "fail", evidence: "x" },
    scope_drift: null,
    risks: [],
    required_main_agent_actions: [],
    ...over,
  };
}

function scannerReport(over: Record<string, unknown> = {}) {
  return {
    schema_version: "1.0",
    change_id: "addLoopLedger",
    attempt: 1,
    workdir_used: "/wt",
    agent: "adv-scanner-bundle",
    scope: { kind: "change", scope_key: "scanner-bundle:harden" },
    phase: "harden",
    scanner_count: 2,
    dimensions: ["security"],
    summary: "harden scan",
    findings: [],
    follow_ups: [],
    ...over,
  };
}

function triageReport(over: Record<string, unknown> = {}) {
  return {
    schema_version: "1.0",
    change_id: "addLoopLedger",
    attempt: 1,
    workdir_used: "/wt",
    agent: "adv-verification-triage-bundle",
    scope: { kind: "change", scope_key: "verifier:local-verify" },
    phase: "local_verify",
    targets: [{ kind: "command", command: "pnpm test", exit_code: 1 }],
    status: "fail",
    error_class: "SEMANTIC",
    confidence: "high",
    evidence_basis: "test output",
    findings: [],
    recommended_next_action: "retry_narrower",
    scope_risk: false,
    required_main_agent_actions: [],
    follow_ups: [],
    ...over,
  };
}

function attempt(n: number, outcome: "failed" | "succeeded" = "failed") {
  return {
    attempt_number: n,
    error: `err-${n}`,
    diagnosis: `diag-${n}`,
    fix_tried: `fix-${n}`,
    outcome,
    attempted_at: `2026-07-10T10:0${n}:00.000Z`,
  };
}

describe("projectLoopLedger", () => {
  it("returns an empty, schema-valid readback for legacy state with no loop fields", () => {
    const readback = projectLoopLedger({});
    expect(readback.summary.totalEntries).toBe(0);
    expect(readback.summary.retryFailureCount).toBe(0);
    expect(readback.details).toBeUndefined();
    expect(() => LoopLedgerReadbackSchema.parse(readback)).not.toThrow();
  });

  it("projects apply_retry from task attempts + error_recovery, with testRuns as evidence refs only (DDC8)", () => {
    const readback = projectLoopLedger({
      changeId: "addLoopLedger",
      tasks: [
        {
          id: "tk-1",
          status: "in_progress",
          attempts: [attempt(1)],
          error_recovery: {
            last_error: "type error",
            retry_count: 3,
            max_retries: 3,
            error_class: "SEMANTIC",
            next_strategy: "rewrite-import-path",
            attempts: [attempt(1), attempt(2)],
          },
        },
      ],
      testRuns: {
        "tk-1": [
          {
            runId: "tr_1",
            exitCode: 1,
            classification: "fail",
            command: "pnpm test",
            durationMs: 100,
            recordedAt: "2026-07-10T10:03:00.000Z",
          },
        ],
      },
    });

    const apply = readback.summary.byKind.apply_retry ?? 0;
    expect(apply).toBe(1);
    expect(readback.summary.sourceTotals.testRuns).toBe(1);

    const detailed = projectLoopLedger(
      {
        changeId: "addLoopLedger",
        tasks: [
          {
            id: "tk-1",
            status: "in_progress",
            attempts: [attempt(1)],
            error_recovery: {
              last_error: "type error",
              retry_count: 3,
              max_retries: 3,
              error_class: "SEMANTIC",
              next_strategy: "rewrite-import-path",
              attempts: [attempt(1), attempt(2)],
            },
          },
        ],
        testRuns: {
          "tk-1": [
            {
              runId: "tr_1",
              exitCode: 1,
              classification: "fail",
              command: "pnpm test",
              durationMs: 100,
              recordedAt: "2026-07-10T10:03:00.000Z",
            },
          ],
        },
      },
      { details: true },
    );
    const entry = detailed.details!.find((e) => e.kind === "apply_retry")!;
    // 1 task.attempts + 3 error_recovery attempts = 4; testRuns NOT counted.
    //
    // This fixture is a LEGACY record: retry_count says 3 but only 2 attempts
    // are retained, and there is no total_attempts. error_recovery.attempts is
    // a bounded retention window, so its length is a floor, not a count —
    // observedAttemptCount therefore reports 3 here, not 2. Before the
    // retention bound existed this read 2 and the total was 3.
    //
    // Open contract question, pre-dating this change: task.attempts and
    // error_recovery.attempts are summed additively, yet this fixture places
    // attempt(1) in both. If those arrays can overlap in production, the sum
    // double-counts the shared attempt. Left as-is rather than silently
    // resolved — see follow-up on the loop-ledger composition contract.
    expect(entry.attemptCount).toBe(4);
    expect(entry.verdict).toBe("fail");
    expect(entry.nextAction).toBe("rewrite-import-path");
    expect(entry.sourceRefs.some((r) => r.kind === "test_run")).toBe(true);
    expect(entry.sourceRefs.some((r) => r.kind === "task")).toBe(true);
  });

  it("counts attempts elided by the retention bound on a post-reducer record", () => {
    // Golden path for records written by the clamped accumulator: attempts[] is
    // capped at max_retries and total_attempts carries the real figure. Without
    // this the migrated consumer would only ever be exercised against the
    // legacy retry_count-floor shape above.
    const detailed = projectLoopLedger(
      {
        changeId: "addLoopLedger",
        tasks: [
          {
            id: "tk-clamped",
            status: "in_progress",
            attempts: [],
            error_recovery: {
              last_error: "blocker",
              retry_count: 3,
              max_retries: 3,
              total_attempts: 9,
              error_class: "SEMANTIC",
              next_strategy: "Resolve sub-agent reported blocker",
              attempts: [attempt(7), attempt(8), attempt(9)],
            },
          },
        ],
      },
      { details: true },
    );
    const entry = detailed.details!.find((e) => e.kind === "apply_retry")!;
    // 9 occurred; only the most recent 3 are retained. Reporting 3 would tell
    // an operator the loop is at budget when it has run three times past it.
    expect(entry.attemptCount).toBe(9);
  });

  it("marks a done task with attempts as verdict pass with a stop reason", () => {
    const readback = projectLoopLedger(
      {
        changeId: "addLoopLedger",
        tasks: [
          {
            id: "tk-2",
            status: "done",
            attempts: [attempt(1, "failed"), attempt(2, "succeeded")],
          },
        ],
      },
      { details: true },
    );
    const entry = readback.details!.find((e) => e.kind === "apply_retry")!;
    expect(entry.verdict).toBe("pass");
    expect(entry.stopReason).toBeTruthy();
    expect(readback.summary.byVerdict.pass).toBe(1);
  });

  it("projects review_remediation from reviewer phase=review reports and maps verdicts", () => {
    const readback = projectLoopLedger(
      {
        changeId: "addLoopLedger",
        subagent_reports: [
          reviewerReport({ attempt: 1, verdict: "NEEDS_WORK" }),
          reviewerReport({ attempt: 2, verdict: "READY" }),
          reviewerReport({ attempt: 3, verdict: "BLOCKED" }),
        ],
      },
      { details: true },
    );

    expect(readback.summary.byKind.review_remediation).toBe(3);
    const verdicts = readback
      .details!.filter((e) => e.kind === "review_remediation")
      .map((e) => e.verdict)
      .sort();
    expect(verdicts).toEqual(["blocked", "fail", "pass"]);
  });

  it("projects harden_remediation from reviewer phase=harden and scanner-bundle reports", () => {
    const readback = projectLoopLedger(
      {
        changeId: "addLoopLedger",
        subagent_reports: [
          reviewerReport({
            scope: { kind: "change", scope_key: "harden:release" },
            task_id: undefined,
            phase: "harden",
            verdict: "READY",
          }),
          scannerReport({
            findings: [
              {
                scanner: "gitleaks",
                severity: "blocker",
                summary: "s",
                evidence: [],
              },
            ],
          }),
        ],
      },
      { details: true },
    );

    expect(readback.summary.byKind.harden_remediation).toBe(2);
    const scanner = readback.details!.find(
      (e) =>
        e.kind === "harden_remediation" && e.producer === "adv-scanner-bundle",
    )!;
    expect(scanner.verdict).toBe("fail"); // blocker finding → fail
  });

  it("projects verification_triage (local_verify) and ci_repair (ci_check) from triage bundles", () => {
    const readback = projectLoopLedger(
      {
        changeId: "addLoopLedger",
        subagent_reports: [
          triageReport({
            phase: "local_verify",
            status: "pass",
            error_class: "SEMANTIC",
          }),
          triageReport({
            attempt: 2,
            phase: "ci_check",
            scope: { kind: "change", scope_key: "verifier:ci-check" },
            status: "fail",
            error_class: "ENVIRONMENTAL",
            targets: [
              {
                kind: "ci_check",
                repo: "acme/api",
                check_name: "ci",
                head_sha: "abc1234",
                conclusion: "failure",
              },
            ],
          }),
        ],
      },
      { details: true },
    );

    expect(readback.summary.byKind.verification_triage).toBe(1);
    expect(readback.summary.byKind.ci_repair).toBe(1);
    const ci = readback.details!.find((e) => e.kind === "ci_repair")!;
    expect(ci.sourceRefs.some((r) => r.kind === "ci_check")).toBe(true);
  });

  it("maps UNKNOWN error_class and inconclusive status to verdict inconclusive WITHOUT retry-failure budget (AC2/DDC4)", () => {
    const readback = projectLoopLedger(
      {
        changeId: "addLoopLedger",
        subagent_reports: [
          triageReport({ attempt: 1, status: "fail", error_class: "UNKNOWN" }),
          triageReport({
            attempt: 2,
            status: "inconclusive",
            error_class: "SEMANTIC",
          }),
          triageReport({ attempt: 3, status: "fail", error_class: "SEMANTIC" }),
        ],
      },
      { details: true },
    );

    const verdicts = readback.details!.map((e) => e.verdict).sort();
    expect(verdicts).toEqual(["fail", "inconclusive", "inconclusive"]);
    // Only the SEMANTIC fail counts toward retry-failure; UNKNOWN + inconclusive do not.
    expect(readback.summary.retryFailureCount).toBe(1);
    expect(readback.summary.byVerdict.inconclusive).toBe(2);
  });

  it("dedupes the same report present on both task and change sidecars by stable report key (DDC3)", () => {
    const shared = reviewerReport({ attempt: 2, verdict: "READY" });
    const readback = projectLoopLedger(
      {
        changeId: "addLoopLedger",
        tasks: [
          { id: "tk-1", status: "in_progress", subagent_reports: [shared] },
        ],
        subagent_reports: [shared],
      },
      { details: true },
    );

    const reviewEntries = readback.details!.filter(
      (e) => e.kind === "review_remediation",
    );
    expect(reviewEntries).toHaveLength(1);
  });

  it("omits details by default and bounds/clamps detailed entries with truncation flag (DDC1/DDC2)", () => {
    const reports = Array.from({ length: 5 }, (_, i) =>
      reviewerReport({ attempt: i + 1, verdict: "NEEDS_WORK" }),
    );

    const compact = projectLoopLedger({
      changeId: "addLoopLedger",
      subagent_reports: reports,
    });
    expect(compact.details).toBeUndefined();
    expect(compact.summary.totalEntries).toBe(5);

    const detailed = projectLoopLedger(
      { changeId: "addLoopLedger", subagent_reports: reports },
      { details: true, limit: 2 },
    );
    expect(detailed.details).toHaveLength(2);
    expect(detailed.detailsTruncated).toBe(true);
    expect(detailed.detailsLimit).toBe(2);

    // limit is clamped to a hard ceiling of 100 even if caller requests more.
    const clamped = projectLoopLedger(
      { changeId: "addLoopLedger", subagent_reports: reports },
      { details: true, limit: 500 },
    );
    expect(clamped.detailsLimit).toBeLessThanOrEqual(100);
  });

  it("counts retry-failure from fail verdicts only (excludes blocked/inconclusive/pass)", () => {
    const readback = projectLoopLedger({
      changeId: "addLoopLedger",
      subagent_reports: [
        reviewerReport({ attempt: 1, verdict: "NEEDS_WORK" }), // fail
        reviewerReport({ attempt: 2, verdict: "READY" }), // pass
        reviewerReport({ attempt: 3, verdict: "BLOCKED" }), // blocked
        triageReport({
          attempt: 4,
          status: "inconclusive",
          error_class: "UNKNOWN",
        }), // inconclusive
        triageReport({ attempt: 5, status: "fail", error_class: "TRANSIENT" }), // fail
      ],
    });
    expect(readback.summary.retryFailureCount).toBe(2);
  });

  it("produces schema-valid entries for every loop kind", () => {
    const readback = projectLoopLedger(
      {
        changeId: "addLoopLedger",
        tasks: [{ id: "tk-1", status: "in_progress", attempts: [attempt(1)] }],
        subagent_reports: [
          reviewerReport({ attempt: 1 }),
          reviewerReport({
            attempt: 2,
            scope: { kind: "change", scope_key: "harden:release" },
            task_id: undefined,
            phase: "harden",
          }),
          scannerReport({ attempt: 3 }),
          triageReport({ attempt: 4 }),
          triageReport({
            attempt: 5,
            phase: "ci_check",
            scope: { kind: "change", scope_key: "verifier:ci-check" },
          }),
        ],
      },
      { details: true },
    );
    for (const entry of readback.details!) {
      expect(() => LoopLedgerEntrySchema.parse(entry)).not.toThrow();
    }
    expect(() => LoopLedgerReadbackSchema.parse(readback)).not.toThrow();
  });
});
