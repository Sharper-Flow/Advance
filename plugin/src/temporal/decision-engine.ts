/**
 * @deprecated Validation-only artifact for `validateTemporalStorageShapeIs`.
 * Remove in `migrateAdvStateTemporalRetire` after the Temporal cutover
 * decision is made. The markdown artifact it produces is permanent; this
 * evaluator module is not.
 */

export interface TemporalValidationEvidence {
  integration: { pass: boolean; details?: string };
  replay: { pass: boolean; historyCount: number };
  workerLifecycle: {
    pass: boolean;
    checks: {
      sigtermFlush: boolean;
      duplicateSignal: boolean;
      restartNoRedo: boolean;
    };
  };
  divergence: { pass: boolean; unresolvedCount: number };
  latency: {
    pass: boolean;
    ratios: { taskUpdate: number; changeGet: number; gateComplete: number };
  };
  memory: { pass: boolean; peakRssBytes: number };
  operatorSetup: { pass: boolean; elapsedMinutes: number };
  parity: {
    pass: boolean;
    unresolvedMismatches: number;
    scenarioCount: number;
  };
  dryRunMigration: {
    pass: boolean;
    projectCount: number;
    unmappableProjects: string[];
  };
  smoke: { pass: boolean; historyCaptured: boolean };
}

export type TemporalReadinessCheck =
  | "integration"
  | "replay"
  | "workerLifecycle"
  | "divergence"
  | "latency"
  | "memory"
  | "operatorSetup"
  | "parity"
  | "dryRunMigration"
  | "smoke";

export interface TemporalReadinessDecision {
  verdict: "AUTO_GO" | "AMBIGUOUS";
  failedChecks: TemporalReadinessCheck[];
  summary: {
    totalChecks: number;
    passedChecks: number;
    failedChecks: number;
  };
}

const CHECK_ORDER: TemporalReadinessCheck[] = [
  "integration",
  "replay",
  "workerLifecycle",
  "divergence",
  "latency",
  "memory",
  "operatorSetup",
  "parity",
  "dryRunMigration",
  "smoke",
];

export function evaluateTemporalReadiness(
  evidence: TemporalValidationEvidence,
): TemporalReadinessDecision {
  const failedChecks = CHECK_ORDER.filter((name) => !evidence[name].pass);
  return {
    verdict: failedChecks.length === 0 ? "AUTO_GO" : "AMBIGUOUS",
    failedChecks,
    summary: {
      totalChecks: CHECK_ORDER.length,
      passedChecks: CHECK_ORDER.length - failedChecks.length,
      failedChecks: failedChecks.length,
    },
  };
}

export function renderTemporalReadinessDecision(input: {
  changeId: string;
  title: string;
  decision: TemporalReadinessDecision;
  evidence: TemporalValidationEvidence;
  reviewedAt: string;
}): string {
  const { changeId, title, decision, evidence, reviewedAt } = input;
  const lines: string[] = [];

  lines.push("# Temporal Readiness Decision");
  lines.push("");
  lines.push(`- Change: ${changeId}`);
  lines.push(`- Title: ${title}`);
  lines.push(`- Reviewed at: ${reviewedAt}`);
  lines.push(`- Verdict: **${decision.verdict}**`);
  lines.push("");

  lines.push("## Check Summary");
  lines.push("");
  lines.push("| Check | Result | Notes |");
  lines.push("|---|---|---|");
  for (const check of CHECK_ORDER) {
    const passed = evidence[check].pass;
    const notes = summarizeEvidence(check, evidence);
    lines.push(
      `| ${labelForCheck(check)} | ${passed ? "PASS" : "FAIL"} | ${notes} |`,
    );
  }
  lines.push("");

  if (decision.failedChecks.length > 0) {
    lines.push("## Failed Checks");
    lines.push("");
    for (const check of decision.failedChecks) {
      lines.push(`- ${labelForCheck(check)}`);
    }
    lines.push("");
    lines.push("## Next Step");
    lines.push("");
    lines.push(
      "Validation result is **AMBIGUOUS**. Consult the user via `/adv-accept`-style question flow before unblocking `migrateAdvStateTemporalRetire`.",
    );
  } else {
    lines.push("## Next Step");
    lines.push("");
    lines.push(
      "Validation result is **AUTO_GO**. Unblock `migrateAdvStateTemporalRetire` and proceed to the cutover change.",
    );
  }

  lines.push("");
  lines.push("## Handoff");
  lines.push("");
  lines.push("- Migration change: `migrateAdvStateTemporalRetire`");
  lines.push(
    "- Validation artifacts are transitional and scheduled for deletion during migration.",
  );

  return lines.join("\n");
}

function labelForCheck(check: TemporalReadinessCheck): string {
  switch (check) {
    case "integration":
      return "Integration";
    case "replay":
      return "Replay-safety";
    case "workerLifecycle":
      return "Worker lifecycle";
    case "divergence":
      return "Divergence";
    case "latency":
      return "Latency";
    case "memory":
      return "Memory";
    case "operatorSetup":
      return "Operator setup";
    case "parity":
      return "Parity harness";
    case "dryRunMigration":
      return "Dry-run migration";
    case "smoke":
      return "Smoke run";
  }
}

function summarizeEvidence(
  check: TemporalReadinessCheck,
  evidence: TemporalValidationEvidence,
): string {
  switch (check) {
    case "integration":
      return evidence.integration.details ?? "queries/updates covered";
    case "replay":
      return `${evidence.replay.historyCount} histories`;
    case "workerLifecycle":
      return `flush=${String(evidence.workerLifecycle.checks.sigtermFlush)}, dup=${String(
        evidence.workerLifecycle.checks.duplicateSignal,
      )}, restart=${String(evidence.workerLifecycle.checks.restartNoRedo)}`;
    case "divergence":
      return `${evidence.divergence.unresolvedCount} unresolved`;
    case "latency":
      return `p95 ratios task=${evidence.latency.ratios.taskUpdate} change=${evidence.latency.ratios.changeGet} gate=${evidence.latency.ratios.gateComplete}`;
    case "memory":
      return `${Math.round(evidence.memory.peakRssBytes / (1024 * 1024))} MB peak`;
    case "operatorSetup":
      return `${evidence.operatorSetup.elapsedMinutes} min`;
    case "parity":
      return `${evidence.parity.scenarioCount} scenarios, ${evidence.parity.unresolvedMismatches} unresolved`;
    case "dryRunMigration":
      return `${evidence.dryRunMigration.projectCount} projects, ${evidence.dryRunMigration.unmappableProjects.length} unmappable`;
    case "smoke":
      return evidence.smoke.historyCaptured
        ? "history captured"
        : "no captured history";
  }
}
