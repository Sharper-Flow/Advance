import { z } from "zod";
import type { Store } from "../storage/store-types";
import type { Change } from "../types";
import { formatToolOutput } from "../utils/tool-output";
import { coordinateChangeMutation } from "./change-mutation-coordinator";
import {
  formatTargetProjectContext,
  withTargetPathStore,
  type TargetProjectOutputContext,
} from "./target-project";

export const DISPOSITION_VERBS = [
  "fixed",
  "rejected_with_evidence",
  "split",
  "fast_follow",
] as const;

type DispositionRecord = {
  taskId: string;
  concernKey: string;
  disposition: string;
  evidence: string;
};

type DispositionField =
  | "design_concern_dispositions"
  | "verification_evidence_dispositions";

type DispositionArgs<TDisposition extends DispositionRecord> = {
  changeId: string;
  taskId: string;
  concernKey: string;
  disposition: TDisposition["disposition"];
  evidence: string;
  dryRun?: boolean;
  priorApprovalEvidence?: string;
  target_path?: string;
  target_confirmed?: true;
  confirmationEvidence?: string;
};

export interface DispositionToolConfig<
  TDisposition extends DispositionRecord,
  TName extends string,
> {
  toolName: TName;
  dispositionVerbs: readonly [string, ...string[]];
  dispositionSchema: z.ZodType<TDisposition>;
  description: string;
  argumentDescriptions: {
    changeId: string;
    taskId: string;
    concernKey: string;
    disposition: string;
    evidence: string;
    dryRun: string;
    priorApprovalEvidence: string;
  };
  dispositionField: DispositionField;
  mutationKind: string;
  authorityReason: string;
  messages: {
    invalid: string;
    unverified: (reason: string) => string;
    staleRevision: (expected: number, actual: number) => string;
    operatorRequired: (reason: string) => string;
    unexpected: (outcome: unknown) => string;
    failed: string;
  };
  errorCodes: {
    unverified: string;
    staleRevision: string;
    operatorRequired: string;
  };
}

type DispositionTool<
  TName extends string,
  TDisposition extends DispositionRecord,
> = {
  [K in TName]: {
    description: string;
    args: Record<string, z.ZodType>;
    execute: (
      args: DispositionArgs<TDisposition>,
      store: Store,
    ) => Promise<string>;
  };
};

const targetArgs = {
  target_path: z
    .string()
    .optional()
    .describe(
      "Optional absolute path to another ADV project. When provided, routes the operation through that project's target store.",
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

async function loadChange(store: Store, changeId: string): Promise<Change> {
  const result = await store.changes.get(changeId);
  if (!result.success) throw new Error(result.error);
  if (!result.data) throw new Error(`Change not found: ${changeId}`);
  return result.data;
}

function upsertDisposition<TDisposition extends DispositionRecord>(
  existing: TDisposition[] | undefined,
  disposition: TDisposition,
): TDisposition[] {
  const next = (existing ?? []).filter(
    (item) =>
      !(
        item.taskId === disposition.taskId &&
        item.concernKey === disposition.concernKey
      ),
  );
  next.push(disposition);
  return next;
}

function dispositionPostcondition<TDisposition extends DispositionRecord>(
  list: TDisposition[] | undefined,
  expected: TDisposition,
): boolean {
  const found = (list ?? []).find(
    (item) =>
      item.taskId === expected.taskId &&
      item.concernKey === expected.concernKey,
  );
  if (!found) return false;
  return (
    found.disposition === expected.disposition &&
    found.evidence === expected.evidence
  );
}

export function createDispositionTool<
  TDisposition extends DispositionRecord,
  const TName extends string,
>(
  config: DispositionToolConfig<TDisposition, TName>,
): DispositionTool<TName, TDisposition> {
  const tool = {
    description: config.description,
    args: {
      changeId: z.string().describe(config.argumentDescriptions.changeId),
      taskId: z.string().describe(config.argumentDescriptions.taskId),
      concernKey: z.string().describe(config.argumentDescriptions.concernKey),
      disposition: z
        .enum(config.dispositionVerbs)
        .describe(config.argumentDescriptions.disposition),
      evidence: z.string().describe(config.argumentDescriptions.evidence),
      dryRun: z
        .boolean()
        .optional()
        .describe(config.argumentDescriptions.dryRun),
      priorApprovalEvidence: z
        .string()
        .optional()
        .describe(config.argumentDescriptions.priorApprovalEvidence),
      ...targetArgs,
    },
    execute: async (
      args: DispositionArgs<TDisposition>,
      store: Store,
    ): Promise<string> => {
      const executeDisposition = async (
        dispositionArgs: DispositionArgs<TDisposition>,
        targetStore: Store,
        projectContext?: TargetProjectOutputContext,
      ): Promise<string> => {
        const proj = projectContext ? { _projectContext: projectContext } : {};
        const change = await loadChange(targetStore, dispositionArgs.changeId);
        const taskExists = (change.tasks ?? []).some(
          (task) => task.id === dispositionArgs.taskId,
        );
        if (!taskExists) {
          return formatToolOutput({
            error: `Task not found in change ${dispositionArgs.changeId}: ${dispositionArgs.taskId}`,
            changeId: dispositionArgs.changeId,
            ...proj,
          });
        }

        // Structural validation owns correctness: the typed schema rejects blank
        // evidence/keys and any non-enumerated disposition verb.
        const parsed = config.dispositionSchema.safeParse({
          taskId: dispositionArgs.taskId,
          concernKey: dispositionArgs.concernKey,
          disposition: dispositionArgs.disposition,
          evidence: dispositionArgs.evidence,
          dispositionedAt: new Date().toISOString(),
        });
        if (!parsed.success) {
          return formatToolOutput({
            error: `${config.messages.invalid}: ${parsed.error.issues
              .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
              .join("; ")}`,
            changeId: dispositionArgs.changeId,
            ...proj,
          });
        }
        const disposition = parsed.data;

        if (dispositionArgs.dryRun) {
          return formatToolOutput({
            success: true,
            dryRun: true,
            changeId: dispositionArgs.changeId,
            disposition,
            ...proj,
          });
        }

        const outcome = await coordinateChangeMutation<Change>({
          authority: {
            reason: config.authorityReason,
            evidence: dispositionArgs.evidence,
          },
          changesDir: targetStore.paths.changes,
          intent: {
            changeId: dispositionArgs.changeId,
            mutationKind: config.mutationKind,
            mutateLatestProjection: (latest) => ({
              ...latest,
              [config.dispositionField]: upsertDisposition(
                latest[config.dispositionField] as TDisposition[] | undefined,
                disposition,
              ),
            }),
            verifyProjection: (readback) =>
              dispositionPostcondition(
                readback[config.dispositionField] as TDisposition[] | undefined,
                disposition,
              ),
          },
        });

        switch (outcome.kind) {
          case "verified":
            return formatToolOutput({
              success: true,
              changeId: dispositionArgs.changeId,
              disposition,
              ...proj,
            });
          case "unverified":
            return formatToolOutput({
              error: config.messages.unverified(outcome.reason),
              code: config.errorCodes.unverified,
              changeId: dispositionArgs.changeId,
              ...proj,
            });
          case "stale_revision":
            return formatToolOutput({
              error: config.messages.staleRevision(
                outcome.expected,
                outcome.actual,
              ),
              code: config.errorCodes.staleRevision,
              changeId: dispositionArgs.changeId,
              ...proj,
            });
          case "operator_required":
            return formatToolOutput({
              error: config.messages.operatorRequired(outcome.reason),
              code: config.errorCodes.operatorRequired,
              changeId: dispositionArgs.changeId,
              ...proj,
            });
          default: {
            const _exhaustive: never = outcome;
            throw new Error(config.messages.unexpected(_exhaustive));
          }
        }
      };

      try {
        if (args.target_path) {
          return await withTargetPathStore(
            {
              currentProjectPath: store.paths.root,
              target_path: args.target_path,
              target_confirmed: args.target_confirmed,
              confirmationEvidence: args.confirmationEvidence,
              stateRequirement: "authoritative",
            },
            async ({ context, store: targetStore }) =>
              executeDisposition(
                { ...args, target_path: undefined },
                targetStore,
                formatTargetProjectContext(context),
              ),
          );
        }
        return await executeDisposition(args, store);
      } catch (error) {
        return formatToolOutput({
          error:
            error instanceof Error ? error.message : config.messages.failed,
        });
      }
    },
  };

  return { [config.toolName]: tool } as unknown as DispositionTool<
    TName,
    TDisposition
  >;
}
