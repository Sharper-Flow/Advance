/**
 * Briefing Packet Renderer
 *
 * Pure, storage-free renderer that composes already-loaded ADV structured state
 * into a lane-specific briefing packet. The renderer never loads state itself;
 * callers (storage/tool adapters) pass hydrated input.
 *
 * rq-approvalConsequenceRenderer01
 */

import {
  BRIEFING_PACKET_LANE_SCHEMA_VERSION,
  type BriefingFact,
  type BriefingPacket,
  type BriefingPacketLane,
  type BriefingPacketSection,
  type ContractItemVariant,
  getBriefingPacketArchiveAnchors,
  getBriefingPacketLaneAnchors,
} from "../types";
import type { EpicMembershipVerification } from "../types/epics";

// =============================================================================
// Input Types
// =============================================================================

export interface BriefingPacketRendererInput {
  change_id: string;
  title: string;
  lane: BriefingPacketLane;
  origin?: {
    kind: string;
    issue_number?: number;
    source_artifact?: string;
  };
  scope?: {
    proposal?: string;
    problem_statement?: string;
    user_outcomes?: string[];
    in_scope?: string[];
    out_of_scope?: string[];
  };
  contract?: {
    items: Array<{
      id: string;
      kind:
        | "success_criterion"
        | "acceptance_criterion"
        | "constraint"
        | "avoidance"
        | "out_of_scope";
      text: string;
      status?:
        | "pass"
        | "fail"
        | "respected"
        | "violated"
        | "unknown"
        | "not_applicable";
      /**
       * Optional structured criterion variant parsed once at mint time. The
       * renderer surfaces it alongside canonical text; display parts are
       * advisory and canonical text remains authoritative (C2 / AC6).
       */
      variant?: ContractItemVariant;
    }>;
  };
  tasks?: Array<{
    id: string;
    title: string;
    status: string;
    touched_files?: string[];
  }>;
  affected_files?: string[];
  epic_membership?: {
    epic_id: string;
    entry_id: string;
    order: number;
    title: string;
    linked_at: string;
  } | null;
  epic_membership_verification?: EpicMembershipVerification;
  verification_expectations?: string[];
  durable_facts?: BriefingFact[];
  archive_digest?: {
    status: string;
    terminal_gate_summary?: Record<string, string>;
  };
  unavailable?: Array<{ label: string; reason: string }>;
  generated_by?: string;
  generated_at?: string;
}

// =============================================================================
// Bounds
// =============================================================================

const MAX_SECTIONS = 20;
const MAX_FACTS = 100;
const MAX_SCOPE_LINES = 10;
const MAX_CONTRACT_ITEMS = 20;
const MAX_TASK_ITEMS = 20;
const MAX_AFFECTED_FILES = 20;
const MAX_EXPECTATIONS = 10;

// =============================================================================
// Lane Section Selection
// =============================================================================

type SectionKind = BriefingPacketSection["kind"];

const LANE_SECTIONS: Record<BriefingPacketLane, SectionKind[]> = {
  researcher: [
    "identity_anchors",
    "scope",
    "contract",
    "tasks",
    "affected_files",
    "epic_context",
    "durable_facts",
    "unavailable_state",
  ],
  engineer: [
    "identity_anchors",
    "scope",
    "contract",
    "tasks",
    "affected_files",
    "epic_context",
    "verification_expectations",
    "durable_facts",
    "unavailable_state",
  ],
  designer: [
    "identity_anchors",
    "scope",
    "contract",
    "tasks",
    "affected_files",
    "epic_context",
    "durable_facts",
    "unavailable_state",
  ],
  reviewer: [
    "identity_anchors",
    "scope",
    "contract",
    "tasks",
    "affected_files",
    "epic_context",
    "verification_expectations",
    "durable_facts",
    "unavailable_state",
  ],
  scanner: [
    "identity_anchors",
    "scope",
    "contract",
    "affected_files",
    "epic_context",
    "durable_facts",
    "unavailable_state",
  ],
  verifier: [
    "identity_anchors",
    "scope",
    "contract",
    "tasks",
    "affected_files",
    "epic_context",
    "verification_expectations",
    "durable_facts",
    "unavailable_state",
  ],
  visual_review: [
    "identity_anchors",
    "scope",
    "contract",
    "tasks",
    "affected_files",
    "epic_context",
    "durable_facts",
    "unavailable_state",
  ],
  archive: [
    "identity_anchors",
    "archive_digest",
    "epic_context",
    "durable_facts",
    "unavailable_state",
  ],
};

// =============================================================================
// Helpers
// =============================================================================

function section(
  kind: SectionKind,
  source_label: string,
  content: unknown,
  unavailable_warning?: string,
): BriefingPacketSection {
  return { kind, source_label, content, unavailable_warning };
}

function omitTail<T>(
  items: T[],
  limit: number,
): { kept: T[]; omitted: number } {
  if (items.length <= limit) return { kept: items, omitted: 0 };
  return { kept: items.slice(0, limit), omitted: items.length - limit };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function compactProposalSummary(
  proposal?: string,
  problem_statement?: string,
): { user_outcomes?: number; summary?: string; source: string } {
  if (isNonEmptyString(proposal)) {
    const outcomes =
      proposal.match(/^\s*[-*]\s+.+$/gmu)?.map((s) => s.trim()) ?? [];
    const lines = proposal.split("\n").filter((l) => l.trim().length > 0);
    const summary = lines.slice(0, MAX_SCOPE_LINES).join("\n");
    return {
      user_outcomes: outcomes.length > 0 ? outcomes.length : undefined,
      summary: summary.length > 0 ? summary : undefined,
      source: "proposal.md",
    };
  }
  if (isNonEmptyString(problem_statement)) {
    const lines = problem_statement
      .split("\n")
      .filter((l) => l.trim().length > 0);
    return {
      summary: lines.slice(0, MAX_SCOPE_LINES).join("\n"),
      source: "problem-statement.md",
    };
  }
  return { source: "proposal.md" };
}

function countTasksByStatus(
  tasks: BriefingPacketRendererInput["tasks"],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const t of tasks ?? []) {
    counts[t.status] = (counts[t.status] ?? 0) + 1;
  }
  return counts;
}

function currentTask(
  tasks: BriefingPacketRendererInput["tasks"],
): { id: string; title: string } | undefined {
  const task = tasks?.find(
    (t) => t.status === "in_progress" || t.status === "active",
  );
  return task ? { id: task.id, title: task.title } : undefined;
}

// =============================================================================
// Section Builders
// =============================================================================

function buildIdentitySection(
  input: BriefingPacketRendererInput,
): BriefingPacketSection {
  const anchors =
    input.lane === "archive"
      ? getBriefingPacketArchiveAnchors()
      : getBriefingPacketLaneAnchors(input.lane);
  return section("identity_anchors", "subagent-report.packet_anchors", {
    change_id: input.change_id,
    title: input.title,
    anchors,
    // Self-documenting hint: anchor NAMES are surfaced here, but the VALUES
    // must be set by the orchestrator in the Task/spawn prompt before
    // delegating to a typed worker. The briefing packet cannot fill identity
    // values (workdir, attempt number, scope key) — only the orchestrator
    // knows them. Without this field, readers have misinterpreted the
    // anchor-names array as informational-only and skipped the required
    // packet header, causing typed-worker packet-defect failures.
    required_from: "orchestrator_packet_header",
    note: "Anchor values must be set by the orchestrator in the Task/spawn prompt before delegating to a typed worker. The briefing packet surfaces required anchor NAMES only; it cannot fill identity values.",
    origin: input.origin ?? null,
  });
}

function buildScopeSection(
  input: BriefingPacketRendererInput,
): BriefingPacketSection | undefined {
  if (!input.scope) return undefined;
  const { proposal, problem_statement, user_outcomes, in_scope, out_of_scope } =
    input.scope;
  if (
    !isNonEmptyString(proposal) &&
    !isNonEmptyString(problem_statement) &&
    !user_outcomes?.length &&
    !in_scope?.length &&
    !out_of_scope?.length
  ) {
    return undefined;
  }

  const proposalSummary = compactProposalSummary(proposal, problem_statement);
  const scopeIn = omitTail(in_scope ?? [], MAX_SCOPE_LINES);
  const scopeOut = omitTail(out_of_scope ?? [], MAX_SCOPE_LINES);

  return section("scope", proposalSummary.source, {
    user_outcomes_count: user_outcomes?.length ?? proposalSummary.user_outcomes,
    proposal_summary: proposalSummary.summary,
    in_scope: scopeIn.kept,
    out_of_scope: scopeOut.kept,
    omitted: {
      in_scope: scopeIn.omitted,
      out_of_scope: scopeOut.omitted,
      proposal_lines: proposal
        ? Math.max(
            0,
            proposal.split("\n").filter((l) => l.trim()).length -
              MAX_SCOPE_LINES,
          )
        : 0,
    },
  });
}

function buildContractSection(
  input: BriefingPacketRendererInput,
): BriefingPacketSection | undefined {
  if (!input.contract?.items.length) return undefined;
  const { kept, omitted } = omitTail(input.contract.items, MAX_CONTRACT_ITEMS);
  return section("contract", "contract.review_matrix", {
    count: input.contract.items.length,
    items: kept.map((c) => {
      const base = {
        id: c.id,
        kind: c.kind,
        text: c.text,
        status: c.status ?? "unknown",
      };
      // Surface the optional variant without inventing a second authoritative
      // representation. AC6: variant kind + canonical text are both visible.
      if (c.variant) {
        return { ...base, variant: c.variant };
      }
      return base;
    }),
    omitted,
  });
}

function buildTasksSection(
  input: BriefingPacketRendererInput,
): BriefingPacketSection | undefined {
  if (!input.tasks?.length) return undefined;
  const { kept, omitted } = omitTail(input.tasks, MAX_TASK_ITEMS);
  const current = currentTask(input.tasks);
  return section("tasks", "task.list", {
    summary: countTasksByStatus(input.tasks),
    current_task: current,
    items: kept.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
    })),
    omitted,
  });
}

function buildAffectedFilesSection(
  input: BriefingPacketRendererInput,
): BriefingPacketSection | undefined {
  const files = input.affected_files ?? [];
  if (!files.length) return undefined;
  const { kept, omitted } = omitTail(files, MAX_AFFECTED_FILES);
  return section("affected_files", "task.touched_files", {
    count: files.length,
    files: kept,
    omitted,
  });
}

function buildEpicContextSection(
  input: BriefingPacketRendererInput,
): BriefingPacketSection {
  if (!input.epic_membership) {
    return section("epic_context", "epic.membership", {
      present: false,
      summary: "No Epic membership",
    });
  }
  const { epic_id, title, order } = input.epic_membership;
  const content: Record<string, unknown> = {
    present: true,
    epic_id,
    title,
    order,
  };
  if (input.epic_membership_verification) {
    content.verification = input.epic_membership_verification;
    if (input.epic_membership_verification === "entry_missing") {
      content.reconcile = "adv-store-reconcile";
    }
  }
  return section("epic_context", "epic.membership", content);
}

function buildVerificationExpectationsSection(
  input: BriefingPacketRendererInput,
): BriefingPacketSection | undefined {
  if (!input.verification_expectations?.length) return undefined;
  const { kept, omitted } = omitTail(
    input.verification_expectations,
    MAX_EXPECTATIONS,
  );
  return section("verification_expectations", "contract.acceptance", {
    expectations: kept,
    omitted,
  });
}

function buildDurableFactsSection(
  input: BriefingPacketRendererInput,
): BriefingPacketSection | undefined {
  if (!input.durable_facts?.length) return undefined;
  const { kept, omitted } = omitTail(input.durable_facts, MAX_FACTS);
  const byOutcome = kept.reduce<Record<string, number>>((acc, f) => {
    acc[f.outcome] = (acc[f.outcome] ?? 0) + 1;
    return acc;
  }, {});
  return section("durable_facts", "durable_fact.classifier", {
    total: input.durable_facts.length,
    included: kept.length,
    omitted,
    by_outcome: byOutcome,
    facts: kept,
  });
}

function buildArchiveDigestSection(
  input: BriefingPacketRendererInput,
): BriefingPacketSection | undefined {
  if (!input.archive_digest) return undefined;
  return section("archive_digest", "change.archive", {
    status: input.archive_digest.status,
    terminal_gate_summary: input.archive_digest.terminal_gate_summary ?? null,
  });
}

function buildUnavailableSection(
  input: BriefingPacketRendererInput,
  expectedKinds: Set<SectionKind>,
  renderedKinds: Set<SectionKind>,
): { section?: BriefingPacketSection; markers: string[] } {
  const missing: Array<{ label: string; reason: string }> = [];

  if (expectedKinds.has("scope") && !renderedKinds.has("scope")) {
    missing.push({ label: "scope", reason: "no scope text provided" });
  }
  if (expectedKinds.has("contract") && !renderedKinds.has("contract")) {
    missing.push({
      label: "contract",
      reason: "no contract review matrix provided",
    });
  }
  if (expectedKinds.has("tasks") && !renderedKinds.has("tasks")) {
    missing.push({ label: "tasks", reason: "no task list provided" });
  }
  if (
    expectedKinds.has("affected_files") &&
    !renderedKinds.has("affected_files")
  ) {
    missing.push({
      label: "affected_files",
      reason: "no affected files provided",
    });
  }
  if (
    expectedKinds.has("verification_expectations") &&
    !renderedKinds.has("verification_expectations")
  ) {
    missing.push({
      label: "verification_expectations",
      reason: "no acceptance expectations provided",
    });
  }
  if (
    expectedKinds.has("durable_facts") &&
    !renderedKinds.has("durable_facts")
  ) {
    missing.push({
      label: "durable_facts",
      reason: "no durable facts provided",
    });
  }
  if (
    expectedKinds.has("archive_digest") &&
    !renderedKinds.has("archive_digest")
  ) {
    missing.push({
      label: "archive_digest",
      reason: "no archive digest provided",
    });
  }

  if (input.unavailable) {
    missing.push(...input.unavailable);
  }

  const markers = missing.map((m) => `${m.label}: ${m.reason}`);
  if (!missing.length) return { markers: [] };

  return {
    section: section(
      "unavailable_state",
      "renderer.omission_tracker",
      { missing },
      "Some requested state was not available for this briefing packet",
    ),
    markers,
  };
}

// =============================================================================
// Public Renderer
// =============================================================================

export function renderBriefingPacket(
  input: BriefingPacketRendererInput,
): BriefingPacket {
  const sectionKinds = LANE_SECTIONS[input.lane];
  const builders: Record<
    SectionKind,
    | ((
        input: BriefingPacketRendererInput,
      ) => BriefingPacketSection | undefined)
    | undefined
  > = {
    identity_anchors: buildIdentitySection,
    scope: buildScopeSection,
    contract: buildContractSection,
    tasks: buildTasksSection,
    affected_files: buildAffectedFilesSection,
    epic_context: buildEpicContextSection,
    verification_expectations: buildVerificationExpectationsSection,
    durable_facts: buildDurableFactsSection,
    unavailable_state: undefined, // handled separately
    archive_digest: buildArchiveDigestSection,
  };

  const sections: BriefingPacketSection[] = [];
  const renderedKinds = new Set<SectionKind>();
  const expectedKinds = new Set<SectionKind>(sectionKinds);

  for (const kind of sectionKinds) {
    if (kind === "unavailable_state") continue;
    const builder = builders[kind];
    const built = builder?.(input);
    if (built) {
      sections.push(built);
      renderedKinds.add(kind);
    }
  }

  const { section: unavailableSection, markers } = buildUnavailableSection(
    input,
    expectedKinds,
    renderedKinds,
  );
  if (unavailableSection) {
    sections.push(unavailableSection);
  }

  const facts = (input.durable_facts ?? []).slice(0, MAX_FACTS);

  const packet: BriefingPacket = {
    schema_version: BRIEFING_PACKET_LANE_SCHEMA_VERSION,
    change_id: input.change_id,
    lane: input.lane,
    generated_at: input.generated_at,
    sections: sections.slice(0, MAX_SECTIONS),
    facts,
    unavailable_markers: markers,
    session_metadata: input.generated_by
      ? { generated_by: input.generated_by, audit_only: true }
      : undefined,
  };

  return packet;
}
