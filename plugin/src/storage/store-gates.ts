/**
 * Gates Domain Operations
 *
 * Factory function that returns the `gates` namespace of the Store interface.
 * Extracted from store.ts to keep domain logic co-located and testable.
 *
 * Inlines the normalizeGates and maybeMigrateLegacyGates helpers since they
 * are only used by the gates domain.
 */

import type { Change, GateCompletion, Gates } from "../types";
import {
  GATE_ORDER,
  canCompleteGate,
  createDefaultGates,
  createLegacyGates,
} from "../types";
import { needsGateMigration, migrateGates } from "./gate-migration";
import { withChangeLock, loadChangeOrNull } from "./store-locks";
import type { StoreContext } from "./store-context";
import type { Store } from "./store";

// ---------------------------------------------------------------------------
// Local helpers (only used by gates domain)
// ---------------------------------------------------------------------------

type GateCompletionRecord = Partial<Record<string, GateCompletion>>;

/**
 * Fill in any missing keys in a partial gates record with default pending
 * entries. Ensures the returned object is structurally a valid Gates.
 */
function normalizeGates(gates: GateCompletionRecord): Gates {
  const defaults = createDefaultGates();
  return { ...defaults, ...gates } as Gates;
}

async function maybeMigrateLegacyGates(
  ctx: StoreContext,
  changeId: string,
  gates: GateCompletionRecord,
  saveFn: (change: Change) => Promise<void>,
): Promise<Gates> {
  if (!needsGateMigration(gates)) {
    return normalizeGates(gates);
  }

  return withChangeLock(ctx, changeId, async (change) => {
    const latestGates = change.gates ?? createDefaultGates();
    if (!needsGateMigration(latestGates)) {
      return normalizeGates(latestGates);
    }

    const migrated = migrateGates(latestGates);
    change.gates = migrated;
    await saveFn(change);
    return migrated;
  });
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createGatesOps(
  ctx: StoreContext,
  ensureChangeSynced: (id: string) => Promise<void>,
  saveFn: (change: Change) => Promise<void>,
): Store["gates"] {
  return {
    get: async (changeId) => {
      // Lazy sync: only sync this specific change
      await ensureChangeSynced(changeId);

      const change = await loadChangeOrNull(ctx, changeId);
      if (!change) return null;

      const gates: GateCompletionRecord = change.gates ?? createDefaultGates();

      // Auto-migrate old 6-gate format to new 7-gate format
      return maybeMigrateLegacyGates(ctx, changeId, gates, saveFn);
    },

    complete: async (changeId, gateId) => {
      return withChangeLock(ctx, changeId, async (change) => {
        if (!change.gates) {
          change.gates = createDefaultGates();
        }

        const gates = change.gates!;

        if (!canCompleteGate(gates, gateId)) {
          const prevIdx = GATE_ORDER.indexOf(gateId);
          const prevGateId = GATE_ORDER[prevIdx - 1];
          const prevStatus = gates[prevGateId].status;

          const reason = `Cannot complete ${gateId} gate: previous gate ${
            prevGateId
          } is not satisfied (status: ${prevStatus})`;
          throw new Error(reason);
        }

        const oldStatus = gates[gateId].status;
        const now = new Date().toISOString();

        gates[gateId].status = "done";
        gates[gateId].completed_at = now;
        gates[gateId].completed_by = "agent";

        // Structured log for gate transition
        if (process.env.ADV_DEBUG) {
          console.log(
            JSON.stringify({
              event: "gate_complete",
              changeId,
              gateId,
              oldStatus,
              newStatus: "done",
              timestamp: now,
            }),
          );
        }

        await saveFn(change);
      });
    },

    migrate: async (changeId) => {
      return withChangeLock(ctx, changeId, async (change) => {
        const now = new Date().toISOString();
        change.gates = createLegacyGates();

        // Structured log for gate migration
        if (process.env.ADV_DEBUG) {
          console.log(
            JSON.stringify({
              event: "gates_migrated",
              changeId,
              status: "legacy",
              timestamp: now,
            }),
          );
        }

        await saveFn(change);
      });
    },
  };
}
