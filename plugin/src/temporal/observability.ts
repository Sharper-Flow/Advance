export const ADVANCE_TEMPORAL_SEARCH_ATTRIBUTES = {
  projectId: "AdvProjectId",
  changeId: "AdvChangeId",
  changeStatus: "AdvChangeStatus",
  activeGate: "AdvActiveGate",
  doomLoop: "AdvDoomLoopActive",
} as const;

export function buildTemporalSearchAttributes(input: {
  projectId: string;
  changeId?: string;
  changeStatus?: string;
  activeGate?: string;
  doomLoopActive?: boolean;
}): Record<string, unknown[]> {
  const attrs: Record<string, unknown[]> = {
    [ADVANCE_TEMPORAL_SEARCH_ATTRIBUTES.projectId]: [input.projectId],
  };

  if (input.changeId) {
    attrs[ADVANCE_TEMPORAL_SEARCH_ATTRIBUTES.changeId] = [input.changeId];
  }
  if (input.changeStatus) {
    attrs[ADVANCE_TEMPORAL_SEARCH_ATTRIBUTES.changeStatus] = [
      input.changeStatus,
    ];
  }
  if (input.activeGate) {
    attrs[ADVANCE_TEMPORAL_SEARCH_ATTRIBUTES.activeGate] = [input.activeGate];
  }
  if (input.doomLoopActive !== undefined) {
    attrs[ADVANCE_TEMPORAL_SEARCH_ATTRIBUTES.doomLoop] = [input.doomLoopActive];
  }

  return attrs;
}
