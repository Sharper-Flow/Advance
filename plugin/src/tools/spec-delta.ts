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
 * Target-path and recovery contract mirrors existing change-mutating tools
 * (adv_contract_mint, adv_change_repair_origin): target_path mutations
 * require explicit target_confirmed + confirmationEvidence, and
 * recoveryMode='poisoned_history' requires precise evidence.
 *
 * Unlike adv_contract_mint, this tool refuses the disk-projection
 * recovery write even with valid evidence — a direct disk write for a
 * delta would bypass the workflow reducer's duplicate-detection invariants
 * and the archive-as-sole-writer boundary, so the tool reports a typed
 * refusal and instructs the caller to recover the workflow instead.
 */

import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import type { Store } from "../storage/store";
import {
  CapabilityKeySchema,
  DeltaAddSchema,
  DeltaModifySchema,
  type DeltaAdd,
  type DeltaModify,
} from "../types";
import { formatToolOutput } from "../utils/tool-output";
import { isPreciseWorkflowRecoveryEvidence } from "../temporal/recovery-classification";
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

const recoveryArgs = {
  recoveryMode: z
    .enum(["normal", "poisoned_history"])
    .optional()
    .describe(
      "Optional recovery mode. 'poisoned_history' documents audited completed/poisoned-workflow evidence; this tool does not perform disk-projection recovery writes and refuses the operation instead.",
    ),
  recoveryEvidence: z
    .string()
    .optional()
    .describe(
      "Required when recoveryMode='poisoned_history'. Must cite precise poisoned-history or completed-workflow evidence (e.g. WorkflowExecutionAlreadyCompleted, WorkflowNotFoundError, TMPRL1100).",
    ),
  recoveryReason: z
    .string()
    .optional()
    .describe(
      "Required non-blank rationale when recoveryMode='poisoned_history'. Explains why the recovery was requested.",
    ),
};

interface RecoveryValidation {
  recoveryMode?: "normal" | "poisoned_history";
  recoveryEvidence?: string;
  recoveryReason?: string;
}

function validateRecoveryArgs(input: RecoveryValidation): string | undefined {
  if (input.recoveryMode !== "poisoned_history") return undefined;
  if (!input.recoveryEvidence?.trim()) {
    return "poisoned_history recovery requires non-empty recoveryEvidence";
  }
  if (!isPreciseWorkflowRecoveryEvidence(input.recoveryEvidence)) {
    return "poisoned_history recoveryEvidence must cite precise poisoned-history or completed-workflow evidence";
  }
  if (!input.recoveryReason?.trim()) {
    return "poisoned_history recovery requires a non-blank recoveryReason";
  }
  return undefined;
}

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
    recoveryMode?: "normal" | "poisoned_history";
    recoveryEvidence?: string;
    recoveryReason?: string;
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
    if (input.recoveryMode === "poisoned_history") {
      return formatToolOutput({
        success: false,
        error: `Spec delta add failed and recovery was requested, but adv_delta_add refuses the disk-projection recovery write because it would bypass the workflow reducer's duplicate-detection invariants and the archive-as-sole-global-writer boundary. Recover the workflow (see adv_temporal_diagnose / adv_change_status_repair) and retry the add from a healthy workflow. Underlying error: ${message}`,
        changeId: input.changeId,
        capability: input.capability,
        recoveryMode: input.recoveryMode,
        recoveryEvidence: input.recoveryEvidence,
        recoveryReason: input.recoveryReason,
        ...(projectContext ? { _projectContext: projectContext } : {}),
      });
    }
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
    recoveryMode?: "normal" | "poisoned_history";
    recoveryEvidence?: string;
    recoveryReason?: string;
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
    if (input.recoveryMode === "poisoned_history") {
      return formatToolOutput({
        success: false,
        error: `Spec delta modify failed and recovery was requested, but adv_delta_modify refuses the disk-projection recovery write because it would bypass the workflow reducer's conflict-detection invariants and the archive-as-sole-global-writer boundary. Recover the workflow and retry the modification from a healthy workflow. Underlying error: ${message}`,
        changeId: input.changeId,
        capability: input.capability,
        recoveryMode: input.recoveryMode,
        recoveryEvidence: input.recoveryEvidence,
        recoveryReason: input.recoveryReason,
        ...(projectContext ? { _projectContext: projectContext } : {}),
      });
    }
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
      ...recoveryArgs,
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
        recoveryMode,
        recoveryEvidence,
        recoveryReason,
      }: {
        changeId: string;
        capability: string;
        delta: DeltaAdd;
        addedBy?: string;
        target_path?: string;
        target_confirmed?: true;
        confirmationEvidence?: string;
        recoveryMode?: "normal" | "poisoned_history";
        recoveryEvidence?: string;
        recoveryReason?: string;
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
      const recoveryError = validateRecoveryArgs({
        recoveryMode,
        recoveryEvidence,
        recoveryReason,
      });
      if (recoveryError) {
        return formatToolOutput({
          success: false,
          error: recoveryError,
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
                  recoveryMode,
                  recoveryEvidence,
                  recoveryReason,
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
        recoveryMode,
        recoveryEvidence,
        recoveryReason,
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
      ...recoveryArgs,
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
        recoveryMode,
        recoveryEvidence,
        recoveryReason,
      }: {
        changeId: string;
        capability: string;
        delta: DeltaModify;
        modifiedBy?: string;
        target_path?: string;
        target_confirmed?: true;
        confirmationEvidence?: string;
        recoveryMode?: "normal" | "poisoned_history";
        recoveryEvidence?: string;
        recoveryReason?: string;
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
      const recoveryError = validateRecoveryArgs({
        recoveryMode,
        recoveryEvidence,
        recoveryReason,
      });
      if (recoveryError) {
        return formatToolOutput({
          success: false,
          error: recoveryError,
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
                  recoveryMode,
                  recoveryEvidence,
                  recoveryReason,
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
        recoveryMode,
        recoveryEvidence,
        recoveryReason,
      });
    },
  },
};
