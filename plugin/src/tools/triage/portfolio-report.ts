export type IssuePriority = "critical" | "high" | "medium" | "low" | string;

export interface EpicContext {
  id: string;
  title: string;
  order: number;
}

export interface ImportantChange {
  changeId: string;
  title: string;
  gate: string;
  tasksDone: number;
  tasksTotal: number;
  lastActivity: string;
  linkedIssue?: { number: number; priority: IssuePriority };
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
const PRIORITY_WEIGHT: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};
const GATE_WEIGHT: Record<string, number> = {
  release: 7,
  acceptance: 6,
  execution: 5,
  planning: 4,
  design: 3,
  discovery: 2,
  proposal: 1,
};

function priorityWeight(priority?: IssuePriority): number {
  return PRIORITY_WEIGHT[String(priority ?? "").toLowerCase()] ?? 0;
}

function overflowLine(total: number): string[] {
  return total > CAP ? [`(${total - CAP} more not shown)`] : [];
}

function epicLine(epic?: EpicContext | null): string {
  return epic ? `\n  Epic ${epic.id} — ${epic.title} — order ${epic.order}` : "";
}

export function renderPortfolioBalance(input: PortfolioBalanceInput): string {
  const important = [...input.importantToComplete].sort((left, right) => {
    const priority =
      priorityWeight(right.linkedIssue?.priority) -
      priorityWeight(left.linkedIssue?.priority);
    if (priority !== 0) return priority;
    const gate =
      (GATE_WEIGHT[right.gate] ?? 0) - (GATE_WEIGHT[left.gate] ?? 0);
    if (gate !== 0) return gate;
    return Date.parse(right.lastActivity) - Date.parse(left.lastActivity);
  });

  const importantLines = important.slice(0, CAP).map((item) => {
    const issue = item.linkedIssue
      ? `; #${item.linkedIssue.number} priority:${item.linkedIssue.priority}`
      : "";
    return `- ${item.changeId} — ${item.title} — gate:${item.gate}; tasks:${item.tasksDone}/${item.tasksTotal}${issue}${epicLine(item.epic)}\n  → /adv-apply ${item.changeId}`;
  });

  const cleanupRows = [
    ...input.cleanupNeeded.readyToArchive.map((id) => `ready-to-archive: ${id}`),
    ...input.cleanupNeeded.stuckAtProposal.map((id) => `stuck-at-proposal: ${id}`),
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
    const priority = priorityWeight(right.priority) - priorityWeight(left.priority);
    if (priority !== 0) return priority;
    return Date.parse(right.createdAt) - Date.parse(left.createdAt);
  });
  const issueLines = issues.slice(0, CAP).map(
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
    ...(
      cleanupRows.length > 0
        ? cleanupRows.slice(0, CAP).map((row) => `- ${row}`)
        : ["None"]
    ),
    ...overflowLine(cleanupRows.length),
    "→ /adv-cleanup",
    "",
    "### Open issues worth solving",
    ...(issueLines.length > 0 ? issueLines : ["None"]),
    ...overflowLine(issues.length),
  ].join("\n");
}
