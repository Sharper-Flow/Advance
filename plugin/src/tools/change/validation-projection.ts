/** Disk-store validation projection. */
import type { Store } from "../../storage/store-types";
import type {
  ConflictInventory,
  ConflictInventoryEntry,
} from "../../validator/types";

export interface ReadDeadline {
  startedAt: number;
  budgetMs: number;
}

export function createReadDeadline(budgetMs: number): ReadDeadline {
  return { startedAt: Date.now(), budgetMs };
}

function remainingDeadlineMs(deadline: ReadDeadline): number {
  return Math.max(0, deadline.budgetMs - (Date.now() - deadline.startedAt));
}

export interface ValidationInventoryOptions {
  deadline?: ReadDeadline;
}

export async function raceWithDeadline<T>(
  op: Promise<T>,
  deadline?: ReadDeadline,
): Promise<T> {
  if (!deadline) return op;
  const remaining = remainingDeadlineMs(deadline);
  if (remaining <= 0) throw new Error("Read deadline exceeded");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      op,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Read deadline exceeded")),
          remaining,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function incomplete(
  list: Awaited<ReturnType<Store["changes"]["list"]>>,
): boolean {
  return Boolean(
    list.hydrationStats?.deadlineExceeded ||
    list.hydrationStats?.boundedOmitted ||
    list.warnings?.some(
      (warning: { code?: string }) =>
        warning.code === "SOURCE_DEADLINE_EXCEEDED" ||
        warning.code === "SOURCE_BOUND_EXCEEDED",
    ),
  );
}

function degraded(
  list: Awaited<ReturnType<Store["changes"]["list"]>>,
): boolean {
  return Boolean(
    list.warnings?.some(
      (warning: { code?: string }) =>
        warning.code === "TERMINAL_SOURCE_DEGRADED" ||
        warning.code === "TERMINAL_CANDIDATE_OMITTED",
    ),
  );
}

export async function loadValidationInventory(
  store: Store,
  changeId: string,
  options?: ValidationInventoryOptions,
): Promise<ConflictInventory> {
  const startMs = Date.now();
  let list: Awaited<ReturnType<Store["changes"]["list"]>>;
  try {
    list = await raceWithDeadline(
      store.changes.list({
        includeArchived: true,
        includeClosed: true,
        validationConcurrency: 4,
      }),
      options?.deadline,
    );
  } catch (error) {
    return {
      entries: [],
      completeness: "blocked",
      warnings: [
        `Change inventory source unreachable: ${error instanceof Error ? error.message : String(error)}`,
      ],
      source: "validation-inventory-projection",
      authorityDiagnostics: {
        source: "disk-change-list",
        activeCandidateCount: null,
        omittedCount: null,
        shadowCount: null,
        elapsedMs: Date.now() - startMs,
      },
      ownChangeId: changeId,
      canConcludeClean: false,
    };
  }
  const warnings: string[] = [];
  if (incomplete(list))
    warnings.push(
      "Store inventory enumeration is incomplete; peer capabilities may be missing.",
    );
  if (degraded(list))
    warnings.push(
      "Store inventory enumeration reported degraded terminal sources; some rows may be incomplete.",
    );
  const entries: ConflictInventoryEntry[] = [...list.changes]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((summary) => ({
      id: summary.id,
      title: summary.title,
      status: summary.status,
      isArchived: summary.status === "archived" || summary.status === "closed",
      isOwnChange: summary.id === changeId,
      ...(summary.capabilities !== undefined
        ? { capabilities: summary.capabilities }
        : {}),
      ...(summary.epic_membership
        ? {
            epic: {
              id: summary.epic_membership.epic_id,
              title: summary.epic_membership.title,
              entry_id: summary.epic_membership.entry_id,
            },
          }
        : {}),
    }));
  const missingCapabilities = entries.filter(
    (entry) =>
      !entry.isArchived &&
      !entry.isOwnChange &&
      entry.capabilities === undefined,
  );
  for (const entry of missingCapabilities)
    warnings.push(
      `Peer change ${entry.id} capabilities not exposed by disk Store list; conflict detection may be incomplete.`,
    );
  let completeness: ConflictInventory["completeness"] = "complete";
  if (missingCapabilities.length > 0) completeness = "degraded";
  if (incomplete(list)) completeness = "non-conclusive";
  if (degraded(list) && completeness === "complete") completeness = "degraded";
  return {
    entries,
    completeness,
    warnings,
    source: "validation-inventory-projection",
    authorityDiagnostics: {
      source: "disk-change-list",
      activeCandidateCount: entries.length,
      omittedCount: missingCapabilities.length,
      shadowCount: null,
      elapsedMs: Date.now() - startMs,
    },
    ownChangeId: changeId,
    canConcludeClean: completeness === "complete",
  };
}
