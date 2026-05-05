import type { ChangeWorkflowState } from "../temporal/contracts";

export interface RenderBriefSummaryInput {
  state: ChangeWorkflowState;
  status: "archived" | "cancelled";
  archivedAt: string;
  branch?: string;
  mergeSha?: string;
  approvalEvidence: string;
  approvedBy: string;
}

function excerpt(value: string, max = 160): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > max ? `${compact.slice(0, max - 1)}…` : compact;
}

export function renderBriefSummary(input: RenderBriefSummaryInput): string {
  const { state } = input;
  const doneTasks = state.tasks.filter((task) => task.status === "done");
  const deltas = Object.entries(state.deltas ?? {}).flatMap(
    ([capability, capabilityDeltas]) =>
      capabilityDeltas.map((delta) => ({ capability, delta })),
  );
  const promotedWisdom = (state.wisdom ?? []).filter((entry) =>
    ["convention", "pattern"].includes(entry.type),
  );

  const lines = [
    `# ${state.changeId}: ${state.title}`,
    "",
    `**Status:** ${input.status}`,
    `**Branch:** ${input.branch ?? `change/${state.changeId}`} (merged at ${input.mergeSha ?? "pending"})`,
    `**Timeline:** ${state.createdAt} → ${input.archivedAt}`,
    "",
    "## Outcome",
    doneTasks.length > 0
      ? `Completed ${doneTasks.length} task(s): ${excerpt(doneTasks.map((task) => task.title).join("; "))}`
      : input.status === "cancelled"
        ? "Change closed without promoting implementation work."
        : "Change archived with no task records in the retained summary.",
    "",
    "## Why",
    excerpt(
      state.documents?.problemStatement ??
        state.documents?.proposal ??
        state.title,
    ),
    "",
    "## Surface",
    ...doneTasks.slice(0, 6).map((task) => `- ${excerpt(task.title, 120)}`),
    ...(doneTasks.length > 6
      ? [`- …${doneTasks.length - 6} more task(s)`]
      : []),
    "",
    "## Acceptance Criteria",
    ...(state.acceptanceCriteria?.length
      ? state.acceptanceCriteria
          .slice(0, 8)
          .map((criterion) => `- ✓ ${excerpt(criterion, 120)}`)
      : ["- ✓ Gate acceptance recorded in workflow state"]),
    "",
    "## Spec Deltas",
    ...(deltas.length
      ? deltas.map(
          ({ capability, delta }) =>
            `- ${capability}/${delta.id}: ${delta.operation}`,
        )
      : ["- None"]),
    "",
    "## Wisdom Promoted",
    ...(promotedWisdom.length
      ? promotedWisdom.map(
          (entry) => `- ${entry.id}: ${excerpt(entry.content, 120)}`,
        )
      : ["- None"]),
    "",
    "## Approval",
    `${input.approvedBy}, ${excerpt(input.approvalEvidence, 120)}, ${input.archivedAt}`,
    "",
  ];

  const rendered = lines.join("\n");
  if (rendered.length <= 2048) return rendered;
  return `${rendered.slice(0, 2000)}\n\n<!-- summary truncated to stay under 2KB -->\n`;
}
