/**
 * Change Import Tool
 *
 * Seeds a Temporal workflow + external state from a disk directory
 * containing `change.json` + `proposal.md`. Distinct from
 * `adv_workflow_repair` (which fixes existing changes): import creates
 * a new change from scratch when the change does not exist in Temporal.
 */

import { z } from "zod";
import { basename, join } from "path";
import { cp, readFile, rm, stat } from "fs/promises";
import { ChangeSchema, createDefaultGates } from "../types";
import type { Change } from "../types";
import { loadChange } from "../storage/json";
import {
  ensureChangeWorkflowStarted,
  type WorkflowHandleLike,
} from "../temporal/workflow-start";
import { getService } from "../temporal/service";
import { formatToolOutput } from "../utils/tool-output";
import type { Store } from "../storage/store";
import {
  formatTargetProjectContext,
  type TargetProjectOutputContext,
  withTargetPathStore,
} from "./target-project";

interface ImportResult {
  success: boolean;
  changeId: string;
  importedFields: string[];
  seededAtTemporal: boolean;
  message?: string;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function detectDefaultedFields(raw: Record<string, unknown>): string[] {
  const defaulted: string[] = [];
  if (!("tasks" in raw)) defaulted.push("tasks");
  if (!("deltas" in raw)) defaulted.push("deltas");
  if (!("gates" in raw)) defaulted.push("gates");
  return defaulted;
}

async function runImport(
  args: {
    source_path: string;
    overwrite?: boolean;
  },
  activeStore: Store,
  projectContext?: TargetProjectOutputContext,
): Promise<string> {
  const sourceChangePath = join(args.source_path, "change.json");

  // 1. Verify source directory exists and contains change.json
  if (!(await exists(sourceChangePath))) {
    return formatToolOutput({
      success: false,
      error: `Source change.json not found: ${sourceChangePath}`,
    });
  }

  // 2. Read and parse raw JSON to detect defaulted fields
  let rawJson: Record<string, unknown>;
  try {
    const rawContent = await readFile(sourceChangePath, "utf-8");
    rawJson = JSON.parse(rawContent) as Record<string, unknown>;
  } catch (err) {
    return formatToolOutput({
      success: false,
      error: `Failed to parse source change.json: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  // 3. Validate via lenient ChangeSchema (F3: tasks/deltas optional with defaults)
  let change: Change;
  try {
    change = ChangeSchema.parse(rawJson);
  } catch (err) {
    return formatToolOutput({
      success: false,
      error: `Source change.json failed schema validation: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  const changeId = change.id;
  const importedFields = detectDefaultedFields(rawJson);

  // 4. Check if change already exists in target
  const existing = await activeStore.changes.get(changeId);
  if (existing.success && existing.data) {
    if (!args.overwrite) {
      return formatToolOutput({
        success: false,
        changeId,
        error: `Change "${changeId}" already exists in target. Set overwrite: true to replace.`,
      });
    }
    // Remove existing target directory before overwrite
    const existingDir = join(activeStore.paths.changes, changeId);
    try {
      await rm(existingDir, { recursive: true, force: true });
    } catch (err) {
      return formatToolOutput({
        success: false,
        changeId,
        error: `Failed to remove existing change directory: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  // 5. Copy source dir to target changes dir
  const targetChangeDir = join(activeStore.paths.changes, changeId);
  try {
    await cp(args.source_path, targetChangeDir, { recursive: true });
  } catch (err) {
    return formatToolOutput({
      success: false,
      changeId,
      error: `Failed to copy source directory to target: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  // 6. Verify the copy succeeded by reloading from target
  const verifyLoad = await loadChange(activeStore.paths.changes, changeId);
  if (!verifyLoad.success || !verifyLoad.data) {
    return formatToolOutput({
      success: false,
      changeId,
      error: `Copy succeeded but reload from target failed: ${verifyLoad.success === false ? verifyLoad.error : "unknown error"}`,
    });
  }

  // 7. Seed Temporal workflow
  const bundle = getService();
  if (!bundle) {
    return formatToolOutput({
      success: false,
      changeId,
      importedFields,
      seededAtTemporal: false,
      error:
        "Temporal service layer not initialized — cannot seed change workflow. Disk import succeeded; run adv_workflow_repair after Temporal is available.",
    });
  }

  try {
    const projectId = basename(
      activeStore.paths.external ?? activeStore.paths.root,
    );
    await ensureChangeWorkflowStarted(
      {
        workflow: bundle.client.workflow as {
          start: (...args: unknown[]) => Promise<WorkflowHandleLike>;
          getHandle: (workflowId: string) => WorkflowHandleLike;
        },
      },
      {
        projectId,
        changeId: change.id,
        title: change.title,
        initializedAt: change.created_at,
        seedState: {
          status: change.status,
          tasks: change.tasks ?? [],
          wisdom: change.wisdom ?? [],
          gates: change.gates ?? createDefaultGates(),
          reentry_history: change.reentry_history ?? [],
        },
      },
    );
  } catch (err) {
    return formatToolOutput({
      success: false,
      changeId,
      importedFields,
      seededAtTemporal: false,
      error: `Disk import succeeded but Temporal workflow seed failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  // If the catch block didn't return, Temporal seed succeeded.
  const result: ImportResult = {
    success: true,
    changeId,
    importedFields,
    seededAtTemporal: true,
    message: `Imported change "${changeId}" from ${args.source_path}. Defaulted fields: [${importedFields.join(", ")}].`,
  };

  if (projectContext) {
    return formatToolOutput({
      ...result,
      _projectContext: projectContext,
    });
  }

  return formatToolOutput(result);
}

export const changeImportTools = {
  adv_change_import: {
    description:
      "Import a change from a disk directory into ADV state. Reads change.json + proposal.md from source_path, copies to target external state, and seeds a Temporal workflow. Distinct from adv_workflow_repair (which fixes existing changes): import creates a new change from scratch when the change does not exist in Temporal.",
    args: {
      source_path: z
        .string()
        .describe(
          "Absolute path to directory containing change.json + proposal.md",
        ),
      overwrite: z
        .boolean()
        .optional()
        .describe("If true, replace existing change with same ID"),
      target_path: z
        .string()
        .optional()
        .describe("Optional absolute path to target ADV project"),
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
    },
    execute: async (
      args: {
        source_path: string;
        overwrite?: boolean;
        target_path?: string;
        target_confirmed?: true;
        confirmationEvidence?: string;
      },
      store: Store,
    ) => {
      if (args.target_path) {
        return withTargetPathStore(
          {
            currentProjectPath: store.paths.root,
            target_path: args.target_path,
            stateRequirement: "temporal-required",
            target_confirmed: args.target_confirmed,
            confirmationEvidence: args.confirmationEvidence,
          },
          async ({ context, store: targetStore }) =>
            runImport(
              { source_path: args.source_path, overwrite: args.overwrite },
              targetStore,
              formatTargetProjectContext(context),
            ),
        );
      }

      return runImport(
        { source_path: args.source_path, overwrite: args.overwrite },
        store,
      );
    },
  },
};
