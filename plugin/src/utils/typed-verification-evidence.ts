/**
 * Minimal durable test-run projection shared by report ingestion and workflow
 * readiness. Run identity is task-local: callers must supply records for the
 * report's task only.
 */
export type DurableTestRunLike = {
  runId?: string;
  command?: string;
  exitCode?: number | null;
};

type TypedVerificationEntry = {
  run_id?: string;
  test_run_id?: string;
  exit_code: number;
};

export type TypedVerificationWarning = {
  kind: "verification_missing" | "verification_mismatch";
  message: string;
};

function latestDurableByRunId(
  records: readonly DurableTestRunLike[] | undefined,
): Map<string, { exitCode: number | null }> {
  const map = new Map<string, { exitCode: number | null }>();
  for (const record of records ?? []) {
    if (record && typeof record.runId === "string" && record.runId) {
      map.set(record.runId, { exitCode: record.exitCode ?? null });
    }
  }
  return map;
}

/**
 * Re-resolve typed report evidence against the current durable run ledger.
 * The exact run ID and exit code are authoritative; command text and unrelated
 * passing runs cannot substitute for an evicted or mismatched run.
 * (rq-verificationEvidenceFreshness01)
 */
export function resolveTypedVerificationWarnings(
  entries: readonly TypedVerificationEntry[],
  durableRecords?: readonly DurableTestRunLike[],
): TypedVerificationWarning[] {
  const durableByRunId = latestDurableByRunId(durableRecords);
  return entries.flatMap((entry): TypedVerificationWarning[] => {
    const entryRunId = entry.test_run_id || entry.run_id;
    if (!entryRunId) return [];

    const durable = durableByRunId.get(entryRunId);
    if (!durable) {
      return [
        {
          kind: "verification_missing",
          message: `No durable adv_run_test evidence found for run_id: ${entryRunId}`,
        },
      ];
    }
    if (durable.exitCode !== null && durable.exitCode !== entry.exit_code) {
      return [
        {
          kind: "verification_mismatch",
          message: `Reported exit_code ${entry.exit_code} differs from durable adv_run_test exitCode ${durable.exitCode} for run_id: ${entryRunId}`,
        },
      ];
    }
    return [];
  });
}
