/**
 * @deprecated Validation-only artifact for `validateTemporalStorageShapeIs`.
 * Remove in `migrateAdvStateTemporalRetire` once the Temporal cutover
 * decision is made.
 */

import type { Store } from "../storage/store";
import type { SpecScenario } from "./parity-harness";

function scenarioChangeTitle(
  base: string,
  backend: "legacy" | "temporal",
): string {
  return `[parity:${backend}] ${base}`;
}

export const STORAGE_LAYER_SCENARIO_GROUPS = {
  changes: [
    {
      id: "changes-create-get-roundtrip",
      title: "change create/get roundtrip preserves title and draft status",
      requirementIds: ["rq-advprop01", "rq-advprop02"],
      run: async ({ store, backend, projectDir }) => {
        const created = await store.changes.create(
          scenarioChangeTitle("change roundtrip", backend),
        );
        const loaded = await store.changes.get(created.changeId);
        return {
          projectDir,
          changeId: created.changeId,
          title: loaded.data?.title,
          status: loaded.data?.status,
        };
      },
    },
  ],
  tasks: [
    {
      id: "tasks-add-list-ready-roundtrip",
      title: "task add/list/ready preserves metadata and readiness",
      requirementIds: ["rq-advmeta01"],
      run: async ({ store, backend }) => {
        const created = await store.changes.create(
          scenarioChangeTitle("task parity", backend),
        );
        const task = await store.tasks.add(created.changeId, "parity task", {
          metadata: { owner: backend, bucket: "parity" },
        });
        const listed = await store.tasks.list(created.changeId);
        const ready = await store.tasks.ready(created.changeId);
        return {
          taskId: task.id,
          listedCount: listed.length,
          readyCount: ready.ready.length,
          metadata: listed[0]?.metadata,
        };
      },
    },
  ],
  gates: [
    {
      id: "gates-complete-proposal-roundtrip",
      title: "gate completion persists proposal completion",
      requirementIds: ["rq-gatemodel01"],
      run: async ({ store, backend }) => {
        const created = await store.changes.create(
          scenarioChangeTitle("gate parity", backend),
        );
        await store.gates.complete(created.changeId, "proposal", "parity note");
        const gates = await store.gates.get(created.changeId);
        return {
          proposalStatus: gates?.proposal.status,
          proposalNotes: gates?.proposal.notes,
        };
      },
    },
  ],
  wisdom: [
    {
      id: "wisdom-add-list-roundtrip",
      title: "wisdom add/list roundtrip preserves content and type",
      requirementIds: ["rq-W1sD0mR1"],
      run: async ({ store, backend }) => {
        const created = await store.changes.create(
          scenarioChangeTitle("wisdom parity", backend),
        );
        await store.wisdom.add(
          created.changeId,
          "pattern",
          `wisdom-${backend}`,
        );
        const wisdom = await store.wisdom.list(created.changeId);
        return {
          count: wisdom.length,
          firstType: wisdom[0]?.type,
          firstContent: wisdom[0]?.content,
        };
      },
    },
  ],
  reentry: [
    {
      id: "reentry-resets-downstream-gates",
      title: "re-entry resets downstream gates and records history",
      requirementIds: ["rq-scopeReentry01", "rq-scopeReentry02"],
      run: async ({ store, backend }) => {
        const created = await store.changes.create(
          scenarioChangeTitle("reentry parity", backend),
        );
        await store.gates.complete(created.changeId, "proposal", "done");
        await store.gates.reopenFrom(
          created.changeId,
          "proposal",
          "scope changed",
          "extra scope",
          "agent",
          "validation parity run",
        );
        const loaded = await store.changes.get(created.changeId);
        return {
          proposalStatus: loaded.data?.gates?.proposal.status,
          discoveryStatus: loaded.data?.gates?.discovery.status,
          reentryCount: loaded.data?.reentry_history?.length ?? 0,
        };
      },
    },
  ],
  shutdown: [
    {
      id: "shutdown-surface-exists",
      title: "store exposes flush + close lifecycle surface",
      requirementIds: ["rq-advshut1"],
      run: async ({ store }) => {
        await store.flush();
        store.close();
        return {
          hasFlush: typeof store.flush === "function",
          hasClose: typeof store.close === "function",
        };
      },
    },
  ],
} as const satisfies Record<string, SpecScenario[]>;

export const STORAGE_LAYER_SCENARIOS: SpecScenario[] = Object.values(
  STORAGE_LAYER_SCENARIO_GROUPS,
).flat();

export async function createLegacyAndTemporalStoresForScenario(input: {
  projectDir: string;
  createLegacyStore: (args: { projectDir: string }) => Promise<Store>;
  createTemporalStore: (args: {
    projectDir: string;
    environment: unknown;
  }) => Promise<Store>;
  environment: unknown;
}): Promise<{ legacy: Store; temporal: Store }> {
  const legacy = await input.createLegacyStore({
    projectDir: input.projectDir,
  });
  const temporal = await input.createTemporalStore({
    projectDir: input.projectDir,
    environment: input.environment,
  });
  return { legacy, temporal };
}
