/**
 * Spec Delta Writer Tool (addSpecDeltaWriter change, roadmap #64)
 *
 * Internal staged-delta validation and reducer helpers. Archive remains the
 * sole global-spec writer.
 *
 * Scope remains intentionally narrow: add supports additions and modify
 * supports validated, non-empty partial changes to an existing requirement.
 * Remove, rename, full CRUD, direct global-spec writes, and direct disk
 * workarounds remain out of scope; archive applies recorded deltas.
 *
 * Target-path contract mirrors existing change-mutating tools
 * (adv_contract_mint): target_path mutations
 * require explicit target_confirmed + confirmationEvidence.
 *
 * Unlike adv_contract_mint, this tool refuses the disk-projection
 * recovery write — a direct disk write for a delta would bypass the
 * workflow reducer's duplicate-detection invariants and the
 * archive-as-sole-writer boundary, so the tool reports the underlying
 * error and instructs the caller to recover the workflow instead.
 */

import { isDeepStrictEqual } from "node:util";
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
import type { TargetProjectOutputContext } from "./target-project";

const DELTA_ID_PATTERN = /^dl-[a-zA-Z0-9]+$/;
const REQUIREMENT_ID_PATTERN = /^rq-[a-zA-Z0-9]+$/;
const SCENARIO_ID_PATTERN = /^rq-[a-zA-Z0-9]+\.\d+$/;

interface DeltaValidation {
  delta?: unknown;
}

function assertAddReceipt(observed: unknown, expected: DeltaAdd): DeltaAdd {
  const parsed = DeltaAddSchema.safeParse(observed);
  if (!parsed.success) {
    throw new Error(
      `Spec delta add store receipt was malformed: ${parsed.error.message}`,
    );
  }
  if (!isDeepStrictEqual(parsed.data, expected)) {
    throw new Error(
      `Spec delta add store receipt payload mismatch for delta ${expected.id}`,
    );
  }
  return parsed.data;
}

function assertModifyReceipt(
  observed: unknown,
  expected: DeltaModify,
): DeltaModify {
  const parsed = DeltaModifySchema.safeParse(observed);
  if (!parsed.success) {
    throw new Error(
      `Spec delta modify store receipt was malformed: ${parsed.error.message}`,
    );
  }
  if (!isDeepStrictEqual(parsed.data, expected)) {
    throw new Error(
      `Spec delta modify store receipt payload mismatch for delta ${expected.id}`,
    );
  }
  return parsed.data;
}

export function validateDeltaArg(input: DeltaValidation): {
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

export function validateModifyDeltaArg(input: DeltaValidation): {
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

export function validateAmendDeltaArg(
  input: DeltaValidation & { deltaId?: string },
): {
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

export function validateRemoveDeltaArg(input: DeltaValidation): {
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

export function validateRenameDeltaArg(input: DeltaValidation): {
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

export function validateCapabilityArg(input: CapabilityValidation): {
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

export async function runAdd(
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
    const appendedReceipt = await activeStore.specDeltas.add(
      input.changeId,
      input.capability,
      input.delta,
      input.addedBy ? { addedBy: input.addedBy } : undefined,
    );
    const appended = assertAddReceipt(appendedReceipt, input.delta);
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

export async function runModify(
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
    const appendedReceipt = await activeStore.specDeltas.modify(
      input.changeId,
      input.capability,
      input.delta,
      input.modifiedBy ? { modifiedBy: input.modifiedBy } : undefined,
    );
    const appended = assertModifyReceipt(appendedReceipt, input.delta);
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

export async function runAmend(
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

export async function runRetract(
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
// surfaces staged delta ids for internal archive/reducer consumers.
export async function runList(
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
export async function runShow(
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

export async function runRemove(
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

export async function runRename(
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

/** The retired public delta tool surface. Internal helpers above remain available. */
export const specDeltaTools = {};
