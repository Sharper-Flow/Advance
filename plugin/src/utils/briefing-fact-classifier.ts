/**
 * Briefing Fact Classifier
 *
 * Pure, deterministic classifier that routes report-created context into typed
 * briefing-fact outcomes using structural source fields only. No free-text
 * keyword inference owns correctness.
 *
 * Outcome taxonomy:
 *   - transient_prompt_context  → context_update_for_adv, recommendation,
 *                                 suggested_next_commands
 *   - report_follow_up          → follow_ups, required_follow_ups,
 *                                 designer design_dimensions concerns and
 *                                 neighboring_recommendations (retireAgendaWorkflow:
 *                                 replaces the retired "agenda" label; these
 *                                 remain source-attributed report metadata and
 *                                 are promoted only via typed tools)
 *   - wisdom_candidate          → reviewer wisdom_candidates
 *   - spec_delta_candidate      → explicit typed facts only
 *   - epic_terminal_note        → supplied Epic membership context
 *   - research_citation         → first RESEARCH_CITATION_RENDER_LIMIT
 *                                 adv-researcher sources (stable order)
 *                                 plus one deterministic omission marker
 *                                 when sources exceed the bound
 *   - archive_only_evidence     → decisions, changes_made, verification,
 *                                 findings, risks,
 *                                 architecture_assessment
 *   - unresolved_action         → required_main_agent_actions, blockers,
 *                                 scope_drift, open_questions,
 *                                 consumer verification warnings,
 *                                 verifier suggested_handoff /
 *                                 recommended_next_action
 */

import {
  type BriefingFact,
  type BriefingFactOutcome,
  type ChangeScopedReviewerSubagentReport,
  type DesignerSubagentReport,
  type EngineerSubagentReport,
  RESEARCH_CITATION_RENDER_LIMIT,
  type ResearcherSubagentReport,
  type ReviewerSubagentReport,
  type ScannerBundleSubagentReport,
  type ScopedSubagentReport,
  type TronSubagentReport,
  type VerificationTriageBundleSubagentReport,
} from "../types";

const DESIGN_DIMENSION_KEYS = [
  "component_correctness",
  "semantic_html_a11y",
  "responsive_behavior",
  "visual_polish",
  "site_design_consistency",
  "finer_details",
] as const;

type AnyReviewerReport =
  | ReviewerSubagentReport
  | ChangeScopedReviewerSubagentReport;

export interface BriefingFactInput extends Omit<
  BriefingFact,
  "id" | "dispositioned"
> {
  id?: string;
  dispositioned?: boolean;
}

export interface BriefingFactClassifierInput {
  /** Sub-agent report to classify. */
  report: ScopedSubagentReport;
  /** Optional explicit typed facts for outcomes with no structural report source. */
  explicitFacts?: BriefingFactInput[];
  /** Optional Epic membership used to emit an epic_terminal_note fact. */
  epicMembership?: {
    epic_id: string;
    title: string;
    order: number;
  } | null;
}

function reportRef(report: ScopedSubagentReport): string {
  const scopeId =
    typeof report.scope === "string"
      ? report.scope
      : report.scope.kind === "task"
        ? `task:${report.scope.task_id}`
        : `change:${report.scope.scope_key}`;
  return `${report.change_id}/${scopeId}/${report.agent}/attempt-${report.attempt}`;
}

function nextFactId(
  facts: BriefingFact[],
  sourceLabel: string,
  ref: string,
): string {
  const index = facts.filter((f) => f.source_label === sourceLabel).length;
  return `${sourceLabel}:${ref}:${index}`;
}

function addFact(
  facts: BriefingFact[],
  report: ScopedSubagentReport,
  outcome: BriefingFactOutcome,
  sourceLabel: string,
  content: string,
  sourceRef?: string,
): void {
  facts.push({
    id: nextFactId(facts, sourceLabel, reportRef(report)),
    outcome,
    source_label: sourceLabel,
    source_ref: sourceRef,
    content,
    dispositioned: false,
  });
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return undefined;
  return String(value);
}

function classifyTaskScopedReport(
  report: ScopedSubagentReport,
  facts: BriefingFact[],
): void {
  // context_update_for_adv is transient prompt context for the main agent.
  if (
    "context_update_for_adv" in report &&
    report.context_update_for_adv &&
    typeof report.context_update_for_adv === "object"
  ) {
    const ctx = report.context_update_for_adv as {
      what_ads_needs_to_know: string;
      suggested_next_action: string;
    };
    addFact(
      facts,
      report,
      "transient_prompt_context",
      "context_update_for_adv",
      `${ctx.what_ads_needs_to_know} | Next: ${ctx.suggested_next_action}`,
    );
  }

  // follow_ups remain source-attributed report metadata (retireAgendaWorkflow
  // AC3); they are not written into any queue by the report consumer.
  if ("follow_ups" in report && Array.isArray(report.follow_ups)) {
    for (const followUp of report.follow_ups) {
      const content = asString(followUp);
      if (content) {
        addFact(facts, report, "report_follow_up", "follow_ups", content);
      }
    }
  }

  // required_follow_ups are typed obligations routed through
  // adv_followup_promote into an ops/enabler child change. They are never
  // written into an unowned queue (retireAgendaWorkflow AC2).
  if (
    "required_follow_ups" in report &&
    Array.isArray(report.required_follow_ups)
  ) {
    for (const rf of report.required_follow_ups) {
      addFact(
        facts,
        report,
        "report_follow_up",
        "required_follow_ups",
        rf.text,
        rf.source_contract_id,
      );
    }
  }

  // required_main_agent_actions are unresolved until the main agent handles them.
  if (
    "required_main_agent_actions" in report &&
    Array.isArray(report.required_main_agent_actions)
  ) {
    for (const action of report.required_main_agent_actions) {
      const content = asString(action);
      if (content) {
        addFact(
          facts,
          report,
          "unresolved_action",
          "required_main_agent_actions",
          content,
        );
      }
    }
  }

  // reviewer wisdom_candidates are durable wisdom promotions.
  if (report.agent === "adv-reviewer") {
    const reviewerReport = report as AnyReviewerReport;
    for (const wc of reviewerReport.wisdom_candidates) {
      addFact(
        facts,
        report,
        "wisdom_candidate",
        "wisdom_candidates",
        `[${wc.type}] ${wc.content}`,
      );
    }

    for (const cm of reviewerReport.changes_made) {
      addFact(
        facts,
        report,
        "archive_only_evidence",
        "changes_made",
        `${cm.file}: ${cm.summary}`,
      );
    }
  }

  // designer design_dimensions concerns and neighboring_recommendations carry
  // typed structural blockers via gate-readiness (retireAgendaWorkflow AC4);
  // they surface as report follow-up facts but are not written into any queue.
  if (report.agent === "adv-designer") {
    const designerReport = report as DesignerSubagentReport;
    for (const dim of DESIGN_DIMENSION_KEYS) {
      if (designerReport.design_dimensions[dim] === "concern") {
        const notes = designerReport.design_dimensions.notes?.trim();
        addFact(
          facts,
          report,
          "report_follow_up",
          "design_dimensions",
          `${dim}${notes ? ` — ${notes}` : ""}`,
        );
      }
    }
    for (const rec of designerReport.neighboring_recommendations) {
      addFact(
        facts,
        report,
        "report_follow_up",
        "neighboring_recommendations",
        rec.what,
      );
    }

    for (const decision of designerReport.decisions) {
      addFact(
        facts,
        report,
        "archive_only_evidence",
        "decisions",
        `${decision.what} — ${decision.why}`,
      );
    }
  }

  // engineer decisions are archive-only evidence.
  if (report.agent === "adv-engineer") {
    const engineerReport = report as EngineerSubagentReport;
    for (const decision of engineerReport.decisions) {
      addFact(
        facts,
        report,
        "archive_only_evidence",
        "decisions",
        `${decision.what} — ${decision.why}`,
      );
    }
  }

  // blockers are unresolved actions.
  if ("blockers" in report && Array.isArray(report.blockers)) {
    for (const blocker of report.blockers) {
      const b = blocker as { what: string };
      if (b.what) {
        addFact(facts, report, "unresolved_action", "blockers", b.what);
      }
    }
  }

  // scope_drift is an unresolved action until dispositioned.
  if (
    "scope_drift" in report &&
    report.scope_drift &&
    typeof report.scope_drift === "object"
  ) {
    const drift = report.scope_drift as {
      recommendation: string;
      details: string;
    };
    addFact(
      facts,
      report,
      "unresolved_action",
      "scope_drift",
      `${drift.recommendation}: ${drift.details}`,
    );
  }

  // verification is structural: array for engineer/designer, object for reviewer.
  if ("verification" in report && report.verification) {
    if (Array.isArray(report.verification)) {
      for (const v of report.verification) {
        addFact(
          facts,
          report,
          "archive_only_evidence",
          "verification",
          `${v.command} (${v.exit_code}) — ${v.summary}`,
        );
      }
    } else if (typeof report.verification === "object") {
      const rv = report.verification as {
        tests_run: string[];
        results: string;
        evidence: string;
      };
      addFact(
        facts,
        report,
        "archive_only_evidence",
        "verification",
        `tests_run=${rv.tests_run.join(", ")} results=${rv.results} — ${rv.evidence}`,
      );
    }
  }

  // consumer_warnings: verification issues become unresolved actions;
  // everything else is archive-only evidence.
  if (
    "consumer_warnings" in report &&
    Array.isArray(report.consumer_warnings)
  ) {
    for (const warning of report.consumer_warnings) {
      const outcome: BriefingFactOutcome =
        warning.kind === "verification_mismatch" ||
        warning.kind === "verification_missing" ||
        warning.kind === "design_concern_promoted"
          ? "unresolved_action"
          : "archive_only_evidence";
      addFact(
        facts,
        report,
        outcome,
        "consumer_warnings",
        `${warning.kind}: ${warning.message}`,
      );
    }
  }
}

function classifyChangeScopedReport(
  report: ScopedSubagentReport,
  facts: BriefingFact[],
): void {
  // Researcher
  if (report.agent === "adv-researcher") {
    const researcherReport = report as ResearcherSubagentReport;
    // AC4/SC3/C5/DONT4: render the first RESEARCH_CITATION_RENDER_LIMIT
    // sources in stable report order as typed research_citation facts. When
    // sources exceed the bound, render exactly one deterministic omission
    // marker so engineers see the truncation without packet bloat. No
    // adoption, usage, delivery, or click telemetry is emitted.
    const kept = researcherReport.sources.slice(
      0,
      RESEARCH_CITATION_RENDER_LIMIT,
    );
    for (const source of kept) {
      addFact(
        facts,
        report,
        "research_citation",
        "sources",
        `${source.label}: ${source.summary} (${source.locator})`,
      );
    }
    const omittedCount = researcherReport.sources.length - kept.length;
    if (omittedCount > 0) {
      addFact(
        facts,
        report,
        "research_citation",
        "sources.omitted",
        `${omittedCount} additional source${omittedCount === 1 ? "" : "s"} omitted (bounded to first ${RESEARCH_CITATION_RENDER_LIMIT})`,
      );
    }
    addFact(
      facts,
      report,
      "archive_only_evidence",
      "architecture_assessment",
      researcherReport.architecture_assessment,
    );
    addFact(
      facts,
      report,
      "transient_prompt_context",
      "recommendation",
      researcherReport.recommendation,
    );
    for (const blocker of researcherReport.validation.blockers) {
      addFact(
        facts,
        report,
        "unresolved_action",
        "validation.blockers",
        typeof blocker === "string" ? blocker : blocker.finding,
      );
    }
  }

  // Tron
  if (report.agent === "adv-tron") {
    const tronReport = report as TronSubagentReport;
    for (const finding of tronReport.findings) {
      addFact(facts, report, "archive_only_evidence", "findings", finding);
    }
    for (const hotspot of tronReport.hotspots) {
      addFact(facts, report, "archive_only_evidence", "hotspots", hotspot);
    }
    for (const risk of tronReport.risks) {
      addFact(facts, report, "archive_only_evidence", "risks", risk);
    }
    for (const question of tronReport.open_questions) {
      addFact(facts, report, "unresolved_action", "open_questions", question);
    }
    for (const command of tronReport.suggested_next_commands) {
      addFact(
        facts,
        report,
        "transient_prompt_context",
        "suggested_next_commands",
        command,
      );
    }
  }

  // Scanner bundle
  if (report.agent === "adv-scanner-bundle") {
    // follow_ups handled in task-scoped branch; findings are archive-only.
    const scannerReport = report as ScannerBundleSubagentReport;
    for (const finding of scannerReport.findings) {
      addFact(
        facts,
        report,
        "archive_only_evidence",
        "findings",
        `[${finding.severity}] ${finding.scanner}: ${finding.summary}`,
      );
    }
  }

  // Verifier bundle
  if (report.agent === "adv-verification-triage-bundle") {
    const verifierReport = report as VerificationTriageBundleSubagentReport;
    for (const finding of verifierReport.findings) {
      addFact(
        facts,
        report,
        "archive_only_evidence",
        "findings",
        `[${finding.severity}] ${finding.summary}`,
      );
    }
    if (verifierReport.failure_attribution) {
      const fa = verifierReport.failure_attribution;
      const parts = [
        `assertion: ${fa.assertion}`,
        `branch: ${fa.branch_result}`,
        `base: ${fa.base_result}`,
        `comparison: ${fa.comparison_status}`,
        `failure_mode: ${fa.failure_mode}`,
      ];
      if (fa.owner_task) parts.push(`owner_task: ${fa.owner_task}`);
      addFact(
        facts,
        report,
        "archive_only_evidence",
        "failure_attribution",
        parts.join(" | "),
      );
      if (fa.test_locator) {
        addFact(
          facts,
          report,
          "archive_only_evidence",
          "failure_attribution.test_locator",
          `${fa.test_locator.label}: ${fa.test_locator.locator} — ${fa.test_locator.summary}`,
        );
      }
      if (fa.production_locator) {
        addFact(
          facts,
          report,
          "archive_only_evidence",
          "failure_attribution.production_locator",
          `${fa.production_locator.label}: ${fa.production_locator.locator} — ${fa.production_locator.summary}`,
        );
      }
    }
    if (verifierReport.suggested_handoff) {
      addFact(
        facts,
        report,
        "unresolved_action",
        "suggested_handoff",
        `${verifierReport.suggested_handoff.summary} — in_scope: ${verifierReport.suggested_handoff.in_scope.join(", ")}`,
      );
    }
    if (
      verifierReport.recommended_next_action &&
      verifierReport.recommended_next_action !== "no_action" &&
      verifierReport.recommended_next_action !== "continue"
    ) {
      addFact(
        facts,
        report,
        "unresolved_action",
        "recommended_next_action",
        verifierReport.recommended_next_action,
      );
    }
  }
}

/**
 * Classify a sub-agent report into durable briefing facts.
 *
 * Classification is structural: outcomes are derived from typed report fields,
 * not from prose keyword matching. Facts that cannot be classified from
 * existing fields are supplied through `explicitFacts`.
 */
export function classifyBriefingFacts(
  input: BriefingFactClassifierInput,
): BriefingFact[] {
  const { report, explicitFacts = [], epicMembership } = input;
  const facts: BriefingFact[] = [];

  // Common fields for both task- and change-scoped reports.
  classifyTaskScopedReport(report, facts);
  classifyChangeScopedReport(report, facts);

  // Epic membership is supplied from change state, not from the report itself.
  if (epicMembership) {
    facts.push({
      id: `epic.membership:${epicMembership.epic_id}`,
      outcome: "epic_terminal_note",
      source_label: "epic.membership",
      content: `${epicMembership.epic_id} · ${epicMembership.title} (order ${epicMembership.order})`,
      dispositioned: false,
    });
  }

  // Explicit typed facts capture outcomes with no structural report source,
  // such as spec_delta_candidate.
  for (const [index, ef] of explicitFacts.entries()) {
    facts.push({
      id: ef.id ?? `explicit:${reportRef(report)}:${index}`,
      outcome: ef.outcome,
      source_label: ef.source_label,
      source_ref: ef.source_ref,
      content: ef.content,
      dispositioned: ef.dispositioned ?? false,
    });
  }

  return facts;
}
