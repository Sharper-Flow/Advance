export type IssuePriority = "critical" | "high" | "medium" | "low" | string;

export interface EpicContext {
  id: string;
  title: string;
  order: number;
}

/**
 * Source of an advisory defect hint.
 *
 * `origin_kind` is primary: `origin.kind` is already-wired typed provenance
 * with runtime effect. `title_prefix` is secondary and weak: change titles are
 * free text, so prefix inference is lossier than the Conventional Commits
 * prefix inference it resembles.
 */
export type DefectHintSource = "origin_kind" | "title_prefix";

/**
 * Advisory-only defect signal (rq-backlogCoord10.3).
 *
 * A hint MAY influence ordering within the portfolio set. It MUST NOT decide
 * membership, filter, suppress, close, deprioritize, or authorize a mutation.
 * It always renders its evidence source so the reader can calibrate trust.
 */
export interface DefectHint {
  source: DefectHintSource;
  evidence: string;
}

export interface ImportantChange {
  changeId: string;
  title: string;
  gate: string;
  tasksDone: number;
  tasksTotal: number;
  lastActivity: string;
  linkedIssue?: { number: number; priority: IssuePriority };
  /** Advisory ordering signal only — never a membership or suppression filter. */
  defectHint?: DefectHint;
  epic?: EpicContext;
}

export interface CleanupNeeded {
  readyToArchive: string[];
  stuckAtProposal: string[];
  abandonedMidFlight: string[];
  duplicateOrSuperseded: string[];
  staleEpicEntries: string[];
}

export interface OpenIssueCandidate {
  number: number;
  title: string;
  priority: IssuePriority;
  createdAt: string;
  epic?: EpicContext | null;
}

export interface PortfolioBalanceInput {
  importantToComplete: ImportantChange[];
  cleanupNeeded: CleanupNeeded;
  openIssuesWorthSolving: OpenIssueCandidate[];
}

const CAP = 10;

/**
 * Structural priority weights, scaled so an advisory hint can be positioned
 * strictly between two structural tiers without impersonating either.
 */
const PRIORITY_WEIGHT: Record<string, number> = {
  critical: 40,
  high: 30,
  medium: 20,
  low: 10,
};

/**
 * Ordering weight for an unlinked change carrying an advisory defect hint.
 *
 * Deliberately between `low` (10) and `medium` (20): a hint may lift defect
 * work above the weakest structural triage signal, but must never outrank a
 * deliberate medium-or-higher triage decision. Heuristics rank; they do not
 * own correctness (P33).
 */
const DEFECT_HINT_WEIGHT = 15;

const GATE_WEIGHT: Record<string, number> = {
  release: 7,
  acceptance: 6,
  execution: 5,
  planning: 4,
  design: 3,
  discovery: 2,
  proposal: 1,
};

/**
 * Derive an advisory defect hint from typed provenance, falling back to a weak
 * title-prefix signal.
 *
 * Returns `undefined` when no signal is present. A missing hint never removes
 * a change from the report — it only leaves ordering to the remaining keys.
 */
export function deriveDefectHint(input: {
  originKind?: string;
  title: string;
}): DefectHint | undefined {
  if (input.originKind === "triage") {
    return { source: "origin_kind", evidence: "origin.kind=triage" };
  }
  if (/^\s*fix\b/i.test(input.title)) {
    return { source: "title_prefix", evidence: 'title starts with "fix"' };
  }
  return undefined;
}

/** Structural weight of a GitHub `priority:*` label. */
function issuePriorityWeight(priority?: IssuePriority): number {
  return PRIORITY_WEIGHT[String(priority ?? "").toLowerCase()] ?? 0;
}

/**
 * Effective ordering weight for a change.
 *
 * Structural linked-issue priority wins when present. Otherwise an advisory
 * defect hint supplies a bounded ordering nudge. Absence of both yields 0 —
 * which affects position only, never inclusion.
 *
 * Kept separate from `issuePriorityWeight` on purpose: the hint fallback is
 * meaningful for a change and meaningless for an issue, so the two ordering
 * axes must not share one helper.
 */
function orderingWeight(item: ImportantChange): number {
  if (item.linkedIssue) return issuePriorityWeight(item.linkedIssue.priority);
  return item.defectHint ? DEFECT_HINT_WEIGHT : 0;
}

function overflowLine(total: number): string[] {
  return total > CAP ? [`(${total - CAP} more not shown)`] : [];
}

function epicLine(epic?: EpicContext | null): string {
  return epic
    ? `\n  Epic ${epic.id} — ${epic.title} — order ${epic.order}`
    : "";
}

/** Advisory hint annotation, always carrying its evidence source. */
function defectHintLine(hint?: DefectHint): string {
  return hint
    ? `\n  advisory defect hint (ordering only) — source:${hint.source} — ${hint.evidence}`
    : "";
}

export function renderPortfolioBalance(input: PortfolioBalanceInput): string {
  const important = [...input.importantToComplete].sort((left, right) => {
    const priority = orderingWeight(right) - orderingWeight(left);
    if (priority !== 0) return priority;
    const gate = (GATE_WEIGHT[right.gate] ?? 0) - (GATE_WEIGHT[left.gate] ?? 0);
    if (gate !== 0) return gate;
    return Date.parse(right.lastActivity) - Date.parse(left.lastActivity);
  });

  const importantLines = important.slice(0, CAP).map((item) => {
    const issue = item.linkedIssue
      ? `; #${item.linkedIssue.number} priority:${item.linkedIssue.priority}`
      : "";
    return `- ${item.changeId} — ${item.title} — gate:${item.gate}; tasks:${item.tasksDone}/${item.tasksTotal}${issue}${epicLine(item.epic)}${defectHintLine(item.defectHint)}\n  → /adv-apply ${item.changeId}`;
  });

  const cleanupRows = [
    ...input.cleanupNeeded.readyToArchive.map(
      (id) => `ready-to-archive: ${id}`,
    ),
    ...input.cleanupNeeded.stuckAtProposal.map(
      (id) => `stuck-at-proposal: ${id}`,
    ),
    ...input.cleanupNeeded.abandonedMidFlight.map(
      (id) => `abandoned-mid-flight: ${id}`,
    ),
    ...input.cleanupNeeded.duplicateOrSuperseded.map(
      (id) => `duplicate/superseded: ${id}`,
    ),
    ...input.cleanupNeeded.staleEpicEntries.map(
      (id) => `stale-epic-entry: ${id}`,
    ),
  ];

  const issues = [...input.openIssuesWorthSolving].sort((left, right) => {
    const priority =
      issuePriorityWeight(right.priority) - issuePriorityWeight(left.priority);
    if (priority !== 0) return priority;
    return Date.parse(right.createdAt) - Date.parse(left.createdAt);
  });
  const issueLines = issues
    .slice(0, CAP)
    .map(
      (issue) =>
        `- #${issue.number} — ${issue.title} — priority:${issue.priority}${epicLine(issue.epic)}\n  → /adv-proposal #${issue.number}`,
    );

  return [
    "## /adv-triage portfolio balance",
    "",
    "### Important to complete",
    ...(importantLines.length > 0 ? importantLines : ["None"]),
    ...overflowLine(important.length),
    "",
    "### Cleanup needed",
    ...(cleanupRows.length > 0
      ? cleanupRows.slice(0, CAP).map((row) => `- ${row}`)
      : ["None"]),
    ...overflowLine(cleanupRows.length),
    "→ /adv-cleanup",
    "",
    "### Open issues worth solving",
    ...(issueLines.length > 0 ? issueLines : ["None"]),
    ...overflowLine(issues.length),
  ].join("\n");
}
