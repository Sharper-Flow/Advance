/**
 * Spec Delta Writer Tool (addSpecDeltaWriter change, roadmap #64)
 *
 * `adv_delta_add` records add-operation deltas, while `adv_delta_modify`
 * records narrow typed changes to an existing requirement. Both write only
 * change-owned deltas through supported store boundaries
 * (`store.specDeltas.add` / `store.specDeltas.modify`); add accepts existing
 * or valid new kebab-case capability keys, and modify validates an existing
 * capability-local target. Archive remains the sole global-spec writer.
 *
 * Scope remains intentionally narrow: add supports additions and modify
 * supports validated, non-empty partial changes to an existing requirement.
 * Remove, rename, full CRUD, direct global-spec writes, and direct disk
 * workarounds remain out of scope; archive applies recorded deltas.
 *
 * Target-path contract mirrors existing change-mutating tools
 * (adv_contract_mint, adv_change_repair_origin): target_path mutations
 * require explicit target_confirmed + confirmationEvidence.
 *
 * Unlike adv_contract_mint, this tool refuses the disk-projection
 * recovery write — a direct disk write for a delta would bypass the
 * workflow reducer's duplicate-detection invariants and the
 * archive-as-sole-writer boundary, so the tool reports the underlying
 * error and instructs the caller to recover the workflow instead.
 */

import { z } from "zod";
import type { Store } from "../storage/store";
import {
  CapabilityKeySchema,
  DeltaAddSchema,
  DeltaModifySchema,
  DeltaRemoveSchema,
  DeltaRenameSchema,
  DeltaSchema,
  type Delta,
  type DeltaAdd,
  type DeltaModify,
  type DeltaRemove,
  type DeltaRename,
} from "../types";
import { formatToolOutput } from "../utils/tool-output";
import {
  formatTargetProjectContext,
  withTargetPathStore,
  type TargetProjectOutputContext,
} from "./target-project";

const DELTA_ID_PATTERN = /^dl-[a-zA-Z0-9]+$/;
const REQUIREMENT_ID_PATTERN = /^rq-[a-zA-Z0-9]+$/;
const SCENARIO_ID_PATTERN = /^rq-[a-zA-Z0-9]+\.\d+$/;

const targetArgs = {
  target_path: z
    .string()
    .optional()
    .describe(
      "Optional absolute path to another ADV project. When provided, routes the add through that project's Temporal-backed target store.",
    ),
  target_confirmed: z
    .literal(true)
    .optional()
    .describe(
      "Required for untrusted target_path mutation. Confirms the target project was explicitly approved.",
    ),
  confirmationEvidence: z
    .string()
    .optional()
    .describe(
      "Required with target_confirmed for untrusted target_path mutation. Cite user approval evidence.",
    ),
};

interface DeltaValidation {
  delta?: unknown;
}

function validateDeltaArg(input: DeltaValidation): {
  delta?: DeltaAdd;
  error?: string;
} {
  if (input.delta === undefined || input.delta === null) {
    return { error: "delta is required and must be an add-operation delta" };
  }
  const parsed = DeltaAddSchema.safeParse(input.delta);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path?.join(".") ?? "delta";
    return {
      error: `Invalid delta: ${path} ${issue?.message ?? "failed schema validation"}`,
    };
  }
  const delta = parsed.data;
  if (!delta.id?.trim()) {
    return { error: "delta.id must be a non-blank string" };
  }
  if (!delta.requirement.id?.trim()) {
    return { error: "delta.requirement.id must be a non-blank string" };
  }
  if (!DELTA_ID_PATTERN.test(delta.id)) {
    return { error: 'delta.id must match the "dl-{nanoid}" format' };
  }
  if (!REQUIREMENT_ID_PATTERN.test(delta.requirement.id)) {
    return {
      error: 'delta.requirement.id must match the "rq-{nanoid}" format',
    };
  }
  const scenarios = delta.requirement.scenarios;
  if (!Array.isArray(scenarios) || scenarios.length === 0) {
    return {
      error:
        "delta.requirement.scenarios must contain at least one Given/When/Then scenario",
    };
  }
  for (const scenario of scenarios) {
    if (!SCENARIO_ID_PATTERN.test(scenario.id)) {
      return {
        error:
          'delta.requirement.scenarios[].id must match the "rq-{parent}.{n}" format',
      };
    }
    if (!scenario.id.startsWith(`${delta.requirement.id}.`)) {
      return {
        error:
          "delta.requirement.scenarios[].id must use the added requirement id as its parent",
      };
    }
  }
  return { delta };
}

function validateModifyDeltaArg(input: DeltaValidation): {
  delta?: DeltaModify;
  error?: string;
} {
  if (input.delta === undefined || input.delta === null) {
    return { error: "delta is required and must be a modify-operation delta" };
  }
  const parsed = DeltaModifySchema.safeParse(input.delta);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path?.join(".") ?? "delta";
    return {
      error: `Invalid modify delta: ${path} ${issue?.message ?? "failed schema validation"}`,
    };
  }
  const delta = parsed.data;
  if (!DELTA_ID_PATTERN.test(delta.id)) {
    return { error: 'delta.id must match the "dl-{nanoid}" format' };
  }
  if (!REQUIREMENT_ID_PATTERN.test(delta.target_id)) {
    return {
      error: 'delta.target_id must match the "rq-{nanoid}" format',
    };
  }
  return { delta };
}

function validateAmendDeltaArg(input: DeltaValidation & { deltaId?: string }): {
  delta?: Delta;
  error?: string;
} {
  if (input.delta === undefined || input.delta === null) {
    return { error: "delta is required" };
  }
  const parsed = DeltaSchema.safeParse(input.delta);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path?.join(".") ?? "delta";
    return {
      error: `Invalid delta: ${path} ${issue?.message ?? "failed schema validation"}`,
    };
  }
  const delta = parsed.data;
  if (!DELTA_ID_PATTERN.test(delta.id)) {
    return { error: 'delta.id must match the "dl-{nanoid}" format' };
  }
  if (input.deltaId !== undefined && delta.id !== input.deltaId) {
    return {
      error: `delta.id ${delta.id} does not match deltaId ${input.deltaId}`,
    };
  }
  return { delta };
}

function validateRemoveDeltaArg(input: DeltaValidation): {
  delta?: DeltaRemove;
  error?: string;
} {
  if (input.delta === undefined || input.delta === null) {
    return { error: "delta is required and must be a remove-operation delta" };
  }
  const parsed = DeltaRemoveSchema.safeParse(input.delta);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path?.join(".") ?? "delta";
    return {
      error: `Invalid remove delta: ${path} ${issue?.message ?? "failed schema validation"}`,
    };
  }
  const delta = parsed.data;
  if (!DELTA_ID_PATTERN.test(delta.id)) {
    return { error: 'delta.id must match the "dl-{nanoid}" format' };
  }
  if (!REQUIREMENT_ID_PATTERN.test(delta.target_id)) {
    return {
      error: 'delta.target_id must match the "rq-{nanoid}" format',
    };
  }
  return { delta };
}

function validateRenameDeltaArg(input: DeltaValidation): {
  delta?: DeltaRename;
  error?: string;
} {
  if (input.delta === undefined || input.delta === null) {
    return { error: "delta is required and must be a rename-operation delta" };
  }
  const parsed = DeltaRenameSchema.safeParse(input.delta);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path?.join(".") ?? "delta";
    return {
      error: `Invalid rename delta: ${path} ${issue?.message ?? "failed schema validation"}`,
    };
  }
  const delta = parsed.data;
  if (!DELTA_ID_PATTERN.test(delta.id)) {
    return { error: 'delta.id must match the "dl-{nanoid}" format' };
  }
  if (!REQUIREMENT_ID_PATTERN.test(delta.target_id)) {
    return {
      error: 'delta.target_id must match the "rq-{nanoid}" format',
    };
  }
  return { delta };
}

interface CapabilityValidation {
  capability?: unknown;
}

function validateCapabilityArg(input: CapabilityValidation): {
  capability?: string;
  error?: string;
} {
  if (typeof input.capability !== "string" || input.capability.length === 0) {
    return { error: "capability is required and must be a kebab-case string" };
  }
  const parsed = CapabilityKeySchema.safeParse(input.capability);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      error: `Invalid capability: ${issue?.message ?? "must be kebab-case"}`,
    };
  }
  return { capability: parsed.data };
}

async function runAdd(
  activeStore: Store,
  input: {
    changeId: string;
    capability: string;
    delta: DeltaAdd;
    addedBy?: string;
  },
  projectContext?: TargetProjectOutputContext,
): Promise<string> {
  try {
    const change = await activeStore.changes.get(input.changeId);
    if (!change.success) {
      throw new Error(
        `Unable to load change ${input.changeId}: ${change.error}`,
      );
    }
    if (!change.data) {
      throw new Error(`Change ${input.changeId} not found`);
    }
    if (change.data.status !== "draft") {
      throw new Error(
        `Spec delta add requires a draft change; ${input.changeId} is ${change.data.status}`,
      );
    }
    const existingSpec = await activeStore.specs.get(input.capability);
    if (!existingSpec.success) {
      throw new Error(
        `Unable to validate existing spec for capability ${input.capability}: ${existingSpec.error}`,
      );
    }
    if (
      existingSpec.data?.requirements.some(
        (requirement) => requirement.id === input.delta.requirement.id,
      )
    ) {
      throw new Error(
        `Requirement ${input.delta.requirement.id} already exists in spec ${input.capability}`,
      );
    }
    const appended = await activeStore.specDeltas.add(
      input.changeId,
      input.capability,
      input.delta,
      input.addedBy ? { addedBy: input.addedBy } : undefined,
    );
    return formatToolOutput({
      success: true,
      changeId: input.changeId,
      capability: input.capability,
      delta: appended,
      ...(projectContext ? { _projectContext: projectContext } : {}),
      message: `Recorded add-only spec delta ${appended.id} for change ${input.changeId} under capability ${input.capability}`,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to add spec delta";
    return formatToolOutput({
      success: false,
      error: message,
      changeId: input.changeId,
      capability: input.capability,
      ...(projectContext ? { _projectContext: projectContext } : {}),
    });
  }
}

async function runModify(
  activeStore: Store,
  input: {
    changeId: string;
    capability: string;
    delta: DeltaModify;
    modifiedBy?: string;
  },
  projectContext?: TargetProjectOutputContext,
): Promise<string> {
  try {
    const change = await activeStore.changes.get(input.changeId);
    if (!change.success) {
      throw new Error(
        `Unable to load change ${input.changeId}: ${change.error}`,
      );
    }
    if (!change.data) throw new Error(`Change ${input.changeId} not found`);
    if (change.data.status !== "draft") {
      throw new Error(
        `Spec delta modify requires a draft change; ${input.changeId} is ${change.data.status}`,
      );
    }
    const existingSpec = await activeStore.specs.get(input.capability);
    if (!existingSpec.success) {
      throw new Error(
        `Unable to validate existing spec for capability ${input.capability}: ${existingSpec.error}`,
      );
    }
    if (!existingSpec.data) {
      throw new Error(
        `Spec ${input.capability} not found; modify requires an existing capability`,
      );
    }
    if (
      !existingSpec.data.requirements.some(
        (requirement) => requirement.id === input.delta.target_id,
      )
    ) {
      throw new Error(
        `Requirement ${input.delta.target_id} not found in spec ${input.capability}`,
      );
    }
    for (const [existingCapability, entries] of Object.entries(
      change.data.deltas ?? {},
    )) {
      for (const entry of entries) {
        if (entry.id === input.delta.id) {
          throw new Error(
            `Duplicate spec delta id ${input.delta.id} under capability ${existingCapability}`,
          );
        }
        if (
          existingCapability === input.capability &&
          entry.operation === "modify" &&
          entry.target_id === input.delta.target_id
        ) {
          throw new Error(
            `Conflicting modify delta target ${input.delta.target_id} under capability ${input.capability}`,
          );
        }
      }
    }
    const appended = await activeStore.specDeltas.modify(
      input.changeId,
      input.capability,
      input.delta,
      input.modifiedBy ? { modifiedBy: input.modifiedBy } : undefined,
    );
    return formatToolOutput({
      success: true,
      changeId: input.changeId,
      capability: input.capability,
      delta: appended,
      ...(projectContext ? { _projectContext: projectContext } : {}),
      message: `Recorded modify-only spec delta ${appended.id} for requirement ${appended.target_id} under capability ${input.capability}`,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to modify spec delta";
    return formatToolOutput({
      success: false,
      error: message,
      changeId: input.changeId,
      capability: input.capability,
      ...(projectContext ? { _projectContext: projectContext } : {}),
    });
  }
}

async function runAmend(
  activeStore: Store,
  input: {
    changeId: string;
    capability: string;
    deltaId: string;
    delta: Delta;
    amendedBy?: string;
  },
  projectContext?: TargetProjectOutputContext,
): Promise<string> {
  try {
    const change = await activeStore.changes.get(input.changeId);
    if (!change.success) {
      throw new Error(
        `Unable to load change ${input.changeId}: ${change.error}`,
      );
    }
    if (!change.data) throw new Error(`Change ${input.changeId} not found`);
    if (change.data.status !== "draft") {
      throw new Error(
        `Spec delta amend requires a draft change; ${input.changeId} is ${change.data.status}`,
      );
    }
    const capabilityDeltas = change.data.deltas?.[input.capability] ?? [];
    if (!capabilityDeltas.some((entry) => entry.id === input.deltaId)) {
      throw new Error(
        `Spec delta ${input.deltaId} not found under capability ${input.capability}`,
      );
    }
    const amended = await activeStore.specDeltas.amend(
      input.changeId,
      input.capability,
      input.deltaId,
      input.delta,
      input.amendedBy ? { amendedBy: input.amendedBy } : undefined,
    );
    return formatToolOutput({
      success: true,
      changeId: input.changeId,
      capability: input.capability,
      deltaId: input.deltaId,
      delta: amended,
      ...(projectContext ? { _projectContext: projectContext } : {}),
      message: `Amended spec delta ${input.deltaId} for change ${input.changeId} under capability ${input.capability}`,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to amend spec delta";
    return formatToolOutput({
      success: false,
      error: message,
      changeId: input.changeId,
      capability: input.capability,
      ...(projectContext ? { _projectContext: projectContext } : {}),
    });
  }
}

async function runRetract(
  activeStore: Store,
  input: {
    changeId: string;
    capability: string;
    deltaId: string;
    retractedBy?: string;
  },
  projectContext?: TargetProjectOutputContext,
): Promise<string> {
  try {
    const change = await activeStore.changes.get(input.changeId);
    if (!change.success) {
      throw new Error(
        `Unable to load change ${input.changeId}: ${change.error}`,
      );
    }
    if (!change.data) throw new Error(`Change ${input.changeId} not found`);
    if (change.data.status !== "draft") {
      throw new Error(
        `Spec delta retract requires a draft change; ${input.changeId} is ${change.data.status}`,
      );
    }
    const capabilityDeltas = change.data.deltas?.[input.capability] ?? [];
    if (!capabilityDeltas.some((entry) => entry.id === input.deltaId)) {
      throw new Error(
        `Spec delta ${input.deltaId} not found under capability ${input.capability}`,
      );
    }
    await activeStore.specDeltas.retract(
      input.changeId,
      input.capability,
      input.deltaId,
      input.retractedBy ? { retractedBy: input.retractedBy } : undefined,
    );
    return formatToolOutput({
      success: true,
      changeId: input.changeId,
      capability: input.capability,
      deltaId: input.deltaId,
      ...(projectContext ? { _projectContext: projectContext } : {}),
      message: `Retracted spec delta ${input.deltaId} for change ${input.changeId} under capability ${input.capability}`,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to retract spec delta";
    return formatToolOutput({
      success: false,
      error: message,
      changeId: input.changeId,
      capability: input.capability,
      ...(projectContext ? { _projectContext: projectContext } : {}),
    });
  }
}

// Read-only: enumerate staged deltas as bounded summary rows. Reads
// change.deltas[] disk-first (survives orphaned workflows); no mutation.
// Fixes the adv_change_show truncation gap for delta-heavy changes and
// surfaces the delta ids that adv_delta_amend/retract require.
async function runList(
  activeStore: Store,
  input: {
    changeId: string;
    capability?: string;
    offset?: number;
    limit?: number;
  },
): Promise<string> {
  try {
    const change = await activeStore.changes.get(input.changeId);
    if (!change.success) {
      throw new Error(
        `Unable to load change ${input.changeId}: ${change.error}`,
      );
    }
    if (!change.data) throw new Error(`Change ${input.changeId} not found`);
    const deltasByCap = change.data.deltas ?? {};
    const rows: Array<{
      id: string;
      operation: string;
      capability: string;
      target?: string;
      title?: string;
    }> = [];
    for (const [cap, entries] of Object.entries(deltasByCap)) {
      if (input.capability && cap !== input.capability) continue;
      for (const d of entries) {
        rows.push({
          id: d.id,
          operation: d.operation,
          capability: cap,
          target:
            "target_id" in d
              ? d.target_id
              : "requirement" in d
                ? d.requirement.id
                : undefined,
          title:
            "requirement" in d
              ? d.requirement.title
              : "new_title" in d
                ? d.new_title
                : "changes" in d
                  ? d.changes.title
                  : undefined,
        });
      }
    }
    const total = rows.length;
    const offset = input.offset ?? 0;
    const limit = Math.min(input.limit ?? 25, 100);
    const page = rows.slice(offset, offset + limit);
    return formatToolOutput({
      success: true,
      changeId: input.changeId,
      ...(input.capability ? { capability: input.capability } : {}),
      rows: page,
      pagination: {
        total,
        returned: page.length,
        offset,
        limit,
        hasMore: offset + page.length < total,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list spec deltas";
    return formatToolOutput({
      success: false,
      error: message,
      changeId: input.changeId,
    });
  }
}

// Read-only: return the full staged delta by id under a capability. Typed
// not-found on unknown id; no mutation.
async function runShow(
  activeStore: Store,
  input: { changeId: string; capability: string; deltaId: string },
): Promise<string> {
  try {
    const change = await activeStore.changes.get(input.changeId);
    if (!change.success) {
      throw new Error(
        `Unable to load change ${input.changeId}: ${change.error}`,
      );
    }
    if (!change.data) throw new Error(`Change ${input.changeId} not found`);
    const capabilityDeltas = change.data.deltas?.[input.capability] ?? [];
    const delta = capabilityDeltas.find((entry) => entry.id === input.deltaId);
    if (!delta) {
      throw new Error(
        `Spec delta ${input.deltaId} not found under capability ${input.capability}`,
      );
    }
    return formatToolOutput({
      success: true,
      changeId: input.changeId,
      capability: input.capability,
      delta,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to show spec delta";
    return formatToolOutput({
      success: false,
      error: message,
      changeId: input.changeId,
      capability: input.capability,
    });
  }
}

async function runRemove(
  activeStore: Store,
  input: {
    changeId: string;
    capability: string;
    delta: DeltaRemove;
    removedBy?: string;
  },
  projectContext?: TargetProjectOutputContext,
): Promise<string> {
  try {
    const change = await activeStore.changes.get(input.changeId);
    if (!change.success) {
      throw new Error(
        `Unable to load change ${input.changeId}: ${change.error}`,
      );
    }
    if (!change.data) throw new Error(`Change ${input.changeId} not found`);
    if (change.data.status !== "draft") {
      throw new Error(
        `Spec delta remove requires a draft change; ${input.changeId} is ${change.data.status}`,
      );
    }
    const existingSpec = await activeStore.specs.get(input.capability);
    if (!existingSpec.success) {
      throw new Error(
        `Unable to validate existing spec for capability ${input.capability}: ${existingSpec.error}`,
      );
    }
    if (!existingSpec.data) {
      throw new Error(
        `Spec ${input.capability} not found; remove requires an existing capability`,
      );
    }
    if (
      !existingSpec.data.requirements.some(
        (requirement) => requirement.id === input.delta.target_id,
      )
    ) {
      throw new Error(
        `Requirement ${input.delta.target_id} not found in spec ${input.capability}`,
      );
    }
    for (const [existingCapability, entries] of Object.entries(
      change.data.deltas ?? {},
    )) {
      for (const entry of entries) {
        if (entry.id === input.delta.id) {
          throw new Error(
            `Duplicate spec delta id ${input.delta.id} under capability ${existingCapability}`,
          );
        }
        if (
          existingCapability === input.capability &&
          entry.operation === "remove" &&
          entry.target_id === input.delta.target_id
        ) {
          throw new Error(
            `Conflicting remove delta target ${input.delta.target_id} under capability ${input.capability}`,
          );
        }
      }
    }
    const appended = await activeStore.specDeltas.remove(
      input.changeId,
      input.capability,
      input.delta,
      input.removedBy ? { removedBy: input.removedBy } : undefined,
    );
    return formatToolOutput({
      success: true,
      changeId: input.changeId,
      capability: input.capability,
      delta: appended,
      ...(projectContext ? { _projectContext: projectContext } : {}),
      message: `Recorded remove-only spec delta ${appended.id} for requirement ${appended.target_id} under capability ${input.capability}`,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to remove spec delta";
    return formatToolOutput({
      success: false,
      error: message,
      changeId: input.changeId,
      capability: input.capability,
      ...(projectContext ? { _projectContext: projectContext } : {}),
    });
  }
}

async function runRename(
  activeStore: Store,
  input: {
    changeId: string;
    capability: string;
    delta: DeltaRename;
    renamedBy?: string;
  },
  projectContext?: TargetProjectOutputContext,
): Promise<string> {
  try {
    const change = await activeStore.changes.get(input.changeId);
    if (!change.success) {
      throw new Error(
        `Unable to load change ${input.changeId}: ${change.error}`,
      );
    }
    if (!change.data) throw new Error(`Change ${input.changeId} not found`);
    if (change.data.status !== "draft") {
      throw new Error(
        `Spec delta rename requires a draft change; ${input.changeId} is ${change.data.status}`,
      );
    }
    const existingSpec = await activeStore.specs.get(input.capability);
    if (!existingSpec.success) {
      throw new Error(
        `Unable to validate existing spec for capability ${input.capability}: ${existingSpec.error}`,
      );
    }
    if (!existingSpec.data) {
      throw new Error(
        `Spec ${input.capability} not found; rename requires an existing capability`,
      );
    }
    if (
      !existingSpec.data.requirements.some(
        (requirement) => requirement.id === input.delta.target_id,
      )
    ) {
      throw new Error(
        `Requirement ${input.delta.target_id} not found in spec ${input.capability}`,
      );
    }
    for (const [existingCapability, entries] of Object.entries(
      change.data.deltas ?? {},
    )) {
      for (const entry of entries) {
        if (entry.id === input.delta.id) {
          throw new Error(
            `Duplicate spec delta id ${input.delta.id} under capability ${existingCapability}`,
          );
        }
      }
    }
    const appended = await activeStore.specDeltas.rename(
      input.changeId,
      input.capability,
      input.delta,
      input.renamedBy ? { renamedBy: input.renamedBy } : undefined,
    );
    return formatToolOutput({
      success: true,
      changeId: input.changeId,
      capability: input.capability,
      delta: appended,
      ...(projectContext ? { _projectContext: projectContext } : {}),
      message: `Recorded rename-only spec delta ${appended.id} for requirement ${appended.target_id} under capability ${input.capability}`,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to rename spec delta";
    return formatToolOutput({
      success: false,
      error: message,
      changeId: input.changeId,
      capability: input.capability,
      ...(projectContext ? { _projectContext: projectContext } : {}),
    });
  }
}

export const specDeltaTools = {
  adv_delta_add: {
    description:
      "Record an append-only add-operation spec delta under `change.deltas[capability]`. Accepts existing or valid new kebab-case capability keys; rejects malformed capability identifiers, malformed requirement/delta shape, missing scenarios, and duplicate requirement/delta IDs atomically. Archive remains the sole global-spec writer; this tool only mutates the change-owned durable delta record. Modify/remove/rename deltas and direct global-spec writes are out of scope.",
    args: {
      changeId: z
        .string()
        .min(1)
        .describe("Change ID whose delta record the add is appended to"),
      capability: CapabilityKeySchema.describe(
        "Kebab-case capability key (spec directory name). Existing capabilities and valid new capability slugs are both accepted; archive creates the first spec for new capabilities on apply.",
      ),
      delta: DeltaAddSchema.describe(
        "Add-operation delta. operation must be 'add'; requirement must include at least one Given/When/Then scenario. Duplicate delta ids and duplicate add-requirement ids are rejected atomically.",
      ),
      addedBy: z
        .string()
        .optional()
        .describe(
          "Optional audit identity recorded on the signal (defaults to the calling tool context).",
        ),
      ...targetArgs,
    },
    execute: async (
      {
        changeId,
        capability,
        delta,
        addedBy,
        target_path,
        target_confirmed,
        confirmationEvidence,
      }: {
        changeId: string;
        capability: string;
        delta: DeltaAdd;
        addedBy?: string;
        target_path?: string;
        target_confirmed?: true;
        confirmationEvidence?: string;
      },
      store: Store,
    ) => {
      const capabilityCheck = validateCapabilityArg({ capability });
      if (capabilityCheck.error || !capabilityCheck.capability) {
        return formatToolOutput({
          success: false,
          error: capabilityCheck.error ?? "Invalid capability",
          changeId,
        });
      }
      const deltaCheck = validateDeltaArg({ delta });
      if (deltaCheck.error || !deltaCheck.delta) {
        return formatToolOutput({
          success: false,
          error: deltaCheck.error ?? "Invalid delta",
          changeId,
          capability: capabilityCheck.capability,
        });
      }
      // Capture validated values into const locals so TS narrowing survives
      // closure capture below (target_path branch + runAdd call).
      const validatedCapability = capabilityCheck.capability;
      const validatedDelta = deltaCheck.delta;
      if (target_path) {
        try {
          return await withTargetPathStore(
            {
              currentProjectPath: store.paths.root,
              target_path,
              stateRequirement: "temporal-required",
              target_confirmed,
              confirmationEvidence,
            },
            async ({ context, store: targetStore }) =>
              runAdd(
                targetStore,
                {
                  changeId,
                  capability: validatedCapability,
                  delta: validatedDelta,
                  addedBy,
                },
                formatTargetProjectContext(context),
              ),
          );
        } catch (error) {
          const errorText =
            error instanceof Error ? error.message : String(error);
          return formatToolOutput({
            success: false,
            error: `Target project spec delta add unavailable: ${errorText}`,
            changeId,
            capability: validatedCapability,
            target_path,
          });
        }
      }
      return runAdd(store, {
        changeId,
        capability: validatedCapability,
        delta: validatedDelta,
        addedBy,
      });
    },
  },
  adv_delta_modify: {
    description:
      "Record a typed modify-operation spec delta for an existing requirement under `change.deltas[capability]`. Rejects empty or malformed changes, unknown requirements, duplicate delta IDs, and conflicting capability-local modify targets atomically. Archive remains the sole global-spec writer; remove, rename, and direct global-spec writes are out of scope.",
    args: {
      changeId: z
        .string()
        .min(1)
        .describe("Change ID whose modification delta is appended"),
      capability: CapabilityKeySchema.describe(
        "Existing kebab-case capability key whose global spec contains the target requirement.",
      ),
      delta: DeltaModifySchema.describe(
        "Modify-operation delta. target_id must name an existing requirement and changes must be a non-empty strict partial requirement update.",
      ),
      modifiedBy: z
        .string()
        .optional()
        .describe("Optional audit identity recorded on the signal."),
      ...targetArgs,
    },
    execute: async (
      {
        changeId,
        capability,
        delta,
        modifiedBy,
        target_path,
        target_confirmed,
        confirmationEvidence,
      }: {
        changeId: string;
        capability: string;
        delta: DeltaModify;
        modifiedBy?: string;
        target_path?: string;
        target_confirmed?: true;
        confirmationEvidence?: string;
      },
      store: Store,
    ) => {
      const capabilityCheck = validateCapabilityArg({ capability });
      if (capabilityCheck.error || !capabilityCheck.capability) {
        return formatToolOutput({
          success: false,
          error: capabilityCheck.error ?? "Invalid capability",
          changeId,
        });
      }
      const deltaCheck = validateModifyDeltaArg({ delta });
      if (deltaCheck.error || !deltaCheck.delta) {
        return formatToolOutput({
          success: false,
          error: deltaCheck.error ?? "Invalid modify delta",
          changeId,
          capability: capabilityCheck.capability,
        });
      }
      const validatedCapability = capabilityCheck.capability;
      const validatedDelta = deltaCheck.delta;
      if (target_path) {
        try {
          return await withTargetPathStore(
            {
              currentProjectPath: store.paths.root,
              target_path,
              stateRequirement: "temporal-required",
              target_confirmed,
              confirmationEvidence,
            },
            async ({ context, store: targetStore }) =>
              runModify(
                targetStore,
                {
                  changeId,
                  capability: validatedCapability,
                  delta: validatedDelta,
                  modifiedBy,
                },
                formatTargetProjectContext(context),
              ),
          );
        } catch (error) {
          const errorText =
            error instanceof Error ? error.message : String(error);
          return formatToolOutput({
            success: false,
            error: `Target project spec delta modify unavailable: ${errorText}`,
            changeId,
            capability: validatedCapability,
            target_path,
          });
        }
      }
      return runModify(store, {
        changeId,
        capability: validatedCapability,
        delta: validatedDelta,
        modifiedBy,
      });
    },
  },
  adv_delta_amend: {
    description:
      "Full-replacement amend of an existing staged spec delta under `change.deltas[capability]`. The new delta must be a complete Delta and its id must match the provided deltaId. Rejects unknown delta ids, malformed capability, and invalid delta shape atomically. Archive remains the sole global-spec writer.",
    args: {
      changeId: z
        .string()
        .min(1)
        .describe("Change ID whose delta record contains the delta to amend"),
      capability: CapabilityKeySchema.describe(
        "Existing kebab-case capability key containing the delta to amend.",
      ),
      deltaId: z
        .string()
        .min(1)
        .describe("Id of the staged delta to replace in place."),
      delta: DeltaSchema.describe(
        "Complete replacement delta. Its id must match deltaId; for a modify replacement it must name an existing requirement.",
      ),
      amendedBy: z
        .string()
        .optional()
        .describe("Optional audit identity recorded on the signal."),
      ...targetArgs,
    },
    execute: async (
      {
        changeId,
        capability,
        deltaId,
        delta,
        amendedBy,
        target_path,
        target_confirmed,
        confirmationEvidence,
      }: {
        changeId: string;
        capability: string;
        deltaId: string;
        delta: Delta;
        amendedBy?: string;
        target_path?: string;
        target_confirmed?: true;
        confirmationEvidence?: string;
      },
      store: Store,
    ) => {
      const capabilityCheck = validateCapabilityArg({ capability });
      if (capabilityCheck.error || !capabilityCheck.capability) {
        return formatToolOutput({
          success: false,
          error: capabilityCheck.error ?? "Invalid capability",
          changeId,
        });
      }
      const deltaCheck = validateAmendDeltaArg({ delta, deltaId });
      if (deltaCheck.error || !deltaCheck.delta) {
        return formatToolOutput({
          success: false,
          error: deltaCheck.error ?? "Invalid delta",
          changeId,
          capability: capabilityCheck.capability,
        });
      }
      const validatedCapability = capabilityCheck.capability;
      const validatedDelta = deltaCheck.delta;
      if (target_path) {
        try {
          return await withTargetPathStore(
            {
              currentProjectPath: store.paths.root,
              target_path,
              stateRequirement: "temporal-required",
              target_confirmed,
              confirmationEvidence,
            },
            async ({ context, store: targetStore }) =>
              runAmend(
                targetStore,
                {
                  changeId,
                  capability: validatedCapability,
                  deltaId,
                  delta: validatedDelta,
                  amendedBy,
                },
                formatTargetProjectContext(context),
              ),
          );
        } catch (error) {
          const errorText =
            error instanceof Error ? error.message : String(error);
          return formatToolOutput({
            success: false,
            error: `Target project spec delta amend unavailable: ${errorText}`,
            changeId,
            capability: validatedCapability,
            target_path,
          });
        }
      }
      return runAmend(store, {
        changeId,
        capability: validatedCapability,
        deltaId,
        delta: validatedDelta,
        amendedBy,
      });
    },
  },
  adv_delta_retract: {
    description:
      "Retract (remove) an existing staged spec delta by id from `change.deltas[capability]`. Rejects unknown delta ids and non-draft changes atomically. Archive remains the sole global-spec writer.",
    args: {
      changeId: z
        .string()
        .min(1)
        .describe("Change ID whose delta record contains the delta to retract"),
      capability: CapabilityKeySchema.describe(
        "Existing kebab-case capability key containing the delta to retract.",
      ),
      deltaId: z.string().min(1).describe("Id of the staged delta to retract."),
      retractedBy: z
        .string()
        .optional()
        .describe("Optional audit identity recorded on the signal."),
      ...targetArgs,
    },
    execute: async (
      {
        changeId,
        capability,
        deltaId,
        retractedBy,
        target_path,
        target_confirmed,
        confirmationEvidence,
      }: {
        changeId: string;
        capability: string;
        deltaId: string;
        retractedBy?: string;
        target_path?: string;
        target_confirmed?: true;
        confirmationEvidence?: string;
      },
      store: Store,
    ) => {
      const capabilityCheck = validateCapabilityArg({ capability });
      if (capabilityCheck.error || !capabilityCheck.capability) {
        return formatToolOutput({
          success: false,
          error: capabilityCheck.error ?? "Invalid capability",
          changeId,
        });
      }
      const validatedCapability = capabilityCheck.capability;
      if (target_path) {
        try {
          return await withTargetPathStore(
            {
              currentProjectPath: store.paths.root,
              target_path,
              stateRequirement: "temporal-required",
              target_confirmed,
              confirmationEvidence,
            },
            async ({ context, store: targetStore }) =>
              runRetract(
                targetStore,
                {
                  changeId,
                  capability: validatedCapability,
                  deltaId,
                  retractedBy,
                },
                formatTargetProjectContext(context),
              ),
          );
        } catch (error) {
          const errorText =
            error instanceof Error ? error.message : String(error);
          return formatToolOutput({
            success: false,
            error: `Target project spec delta retract unavailable: ${errorText}`,
            changeId,
            capability: validatedCapability,
            target_path,
          });
        }
      }
      return runRetract(store, {
        changeId,
        capability: validatedCapability,
        deltaId,
        retractedBy,
      });
    },
  },
  adv_delta_remove: {
    description:
      "Record a remove-operation spec delta for an existing requirement under `change.deltas[capability]`. Rejects unknown requirements, duplicate delta IDs, and conflicting capability-local remove targets atomically. Archive remains the sole global-spec writer; direct global-spec writes are out of scope.",
    args: {
      changeId: z
        .string()
        .min(1)
        .describe("Change ID whose removal delta is appended"),
      capability: CapabilityKeySchema.describe(
        "Existing kebab-case capability key whose global spec contains the target requirement.",
      ),
      delta: DeltaRemoveSchema.describe(
        "Remove-operation delta. target_id must name an existing requirement and reason must be non-empty.",
      ),
      removedBy: z
        .string()
        .optional()
        .describe("Optional audit identity recorded on the signal."),
      ...targetArgs,
    },
    execute: async (
      {
        changeId,
        capability,
        delta,
        removedBy,
        target_path,
        target_confirmed,
        confirmationEvidence,
      }: {
        changeId: string;
        capability: string;
        delta: DeltaRemove;
        removedBy?: string;
        target_path?: string;
        target_confirmed?: true;
        confirmationEvidence?: string;
      },
      store: Store,
    ) => {
      const capabilityCheck = validateCapabilityArg({ capability });
      if (capabilityCheck.error || !capabilityCheck.capability) {
        return formatToolOutput({
          success: false,
          error: capabilityCheck.error ?? "Invalid capability",
          changeId,
        });
      }
      const deltaCheck = validateRemoveDeltaArg({ delta });
      if (deltaCheck.error || !deltaCheck.delta) {
        return formatToolOutput({
          success: false,
          error: deltaCheck.error ?? "Invalid remove delta",
          changeId,
          capability: capabilityCheck.capability,
        });
      }
      const validatedCapability = capabilityCheck.capability;
      const validatedDelta = deltaCheck.delta;
      if (target_path) {
        try {
          return await withTargetPathStore(
            {
              currentProjectPath: store.paths.root,
              target_path,
              stateRequirement: "temporal-required",
              target_confirmed,
              confirmationEvidence,
            },
            async ({ context, store: targetStore }) =>
              runRemove(
                targetStore,
                {
                  changeId,
                  capability: validatedCapability,
                  delta: validatedDelta,
                  removedBy,
                },
                formatTargetProjectContext(context),
              ),
          );
        } catch (error) {
          const errorText =
            error instanceof Error ? error.message : String(error);
          return formatToolOutput({
            success: false,
            error: `Target project spec delta remove unavailable: ${errorText}`,
            changeId,
            capability: validatedCapability,
            target_path,
          });
        }
      }
      return runRemove(store, {
        changeId,
        capability: validatedCapability,
        delta: validatedDelta,
        removedBy,
      });
    },
  },
  adv_delta_rename: {
    description:
      "Record a rename-operation spec delta for an existing requirement under `change.deltas[capability]`. Rejects unknown requirements, duplicate delta IDs, and malformed rename shape atomically. Archive remains the sole global-spec writer; direct global-spec writes are out of scope.",
    args: {
      changeId: z
        .string()
        .min(1)
        .describe("Change ID whose rename delta is appended"),
      capability: CapabilityKeySchema.describe(
        "Existing kebab-case capability key whose global spec contains the target requirement.",
      ),
      delta: DeltaRenameSchema.describe(
        "Rename-operation delta. target_id must name an existing requirement and new_title must be non-empty.",
      ),
      renamedBy: z
        .string()
        .optional()
        .describe("Optional audit identity recorded on the signal."),
      ...targetArgs,
    },
    execute: async (
      {
        changeId,
        capability,
        delta,
        renamedBy,
        target_path,
        target_confirmed,
        confirmationEvidence,
      }: {
        changeId: string;
        capability: string;
        delta: DeltaRename;
        renamedBy?: string;
        target_path?: string;
        target_confirmed?: true;
        confirmationEvidence?: string;
      },
      store: Store,
    ) => {
      const capabilityCheck = validateCapabilityArg({ capability });
      if (capabilityCheck.error || !capabilityCheck.capability) {
        return formatToolOutput({
          success: false,
          error: capabilityCheck.error ?? "Invalid capability",
          changeId,
        });
      }
      const deltaCheck = validateRenameDeltaArg({ delta });
      if (deltaCheck.error || !deltaCheck.delta) {
        return formatToolOutput({
          success: false,
          error: deltaCheck.error ?? "Invalid rename delta",
          changeId,
          capability: capabilityCheck.capability,
        });
      }
      const validatedCapability = capabilityCheck.capability;
      const validatedDelta = deltaCheck.delta;
      if (target_path) {
        try {
          return await withTargetPathStore(
            {
              currentProjectPath: store.paths.root,
              target_path,
              stateRequirement: "temporal-required",
              target_confirmed,
              confirmationEvidence,
            },
            async ({ context, store: targetStore }) =>
              runRename(
                targetStore,
                {
                  changeId,
                  capability: validatedCapability,
                  delta: validatedDelta,
                  renamedBy,
                },
                formatTargetProjectContext(context),
              ),
          );
        } catch (error) {
          const errorText =
            error instanceof Error ? error.message : String(error);
          return formatToolOutput({
            success: false,
            error: `Target project spec delta rename unavailable: ${errorText}`,
            changeId,
            capability: validatedCapability,
            target_path,
          });
        }
      }
      return runRename(store, {
        changeId,
        capability: validatedCapability,
        delta: validatedDelta,
        renamedBy,
      });
    },
  },
  adv_delta_list: {
    description:
      "List staged spec deltas on a change as bounded, paginated summary rows under `change.deltas[capability]`. Read-only: surfaces each staged delta's id, operation, capability, target (requirement id), and title so their ids can be passed to adv_delta_amend/retract. Fixes the adv_change_show truncation gap for delta-heavy changes. Reads disk-first and works even when the change workflow is orphaned.",
    args: {
      changeId: z
        .string()
        .min(1)
        .describe("Change ID whose staged deltas to list"),
      capability: CapabilityKeySchema.optional().describe(
        "Optional capability filter; when omitted, lists deltas across all capabilities.",
      ),
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Pagination offset (default 0)."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Max rows to return (default 25, cap 100)."),
    },
    execute: async (
      {
        changeId,
        capability,
        offset,
        limit,
      }: {
        changeId: string;
        capability?: string;
        offset?: number;
        limit?: number;
      },
      store: Store,
    ) => {
      return runList(store, { changeId, capability, offset, limit });
    },
  },
  adv_delta_show: {
    description:
      "Show the full content of a single staged spec delta by id under `change.deltas[capability]`. Read-only: returns the complete delta object for exact-postimage verification; typed not-found error on unknown delta id. Reads disk-first and works even when the change workflow is orphaned.",
    args: {
      changeId: z
        .string()
        .min(1)
        .describe("Change ID whose staged delta to show"),
      capability: CapabilityKeySchema.describe(
        "Capability key containing the delta.",
      ),
      deltaId: z.string().min(1).describe("Id of the staged delta to show."),
    },
    execute: async (
      {
        changeId,
        capability,
        deltaId,
      }: {
        changeId: string;
        capability: string;
        deltaId: string;
      },
      store: Store,
    ) => {
      return runShow(store, { changeId, capability, deltaId });
    },
  },
};
