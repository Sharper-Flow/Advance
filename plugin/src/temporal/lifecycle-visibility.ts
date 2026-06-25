import type { ChangeStatus } from "../types";

const LEGACY_OPEN_STATUSES = new Set<ChangeStatus>([
  "draft",
  "pending",
  "active",
]);

export function escapeVisibilityValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function openLifecycleVisibilityClauses(): string[] {
  return [`AdvLifecycleState = "open"`, `ExecutionStatus = "Running"`];
}

export function isLegacyOpenStatusSet(statuses: readonly ChangeStatus[]): boolean {
  return (
    statuses.length > 0 &&
    statuses.every((status) => LEGACY_OPEN_STATUSES.has(status))
  );
}
