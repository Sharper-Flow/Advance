/**
 * Ops Follow-up Promotion Tool
 *
 * Promotes typed ops/enabler follow-ups from structured sources
 * (required_follow_up in sub-agent reports, sidecar report metadata) into
 * linked ADV child changes with an `ops_followup` profile. Agenda items and
 * manual fallback are supported but are explicitly secondary to typed sources.
 *
 * Authority split:
 *   - The child/follow-up change owns `ops_followup` (source, status, evidence).
 *   - The parent/source change owns `ops_followup_links[]` (outbound edges for
 *     release/archive reporting and discovery).
 *
 * Promotion is idempotent by structural source identity. A partial link-write
 * returns a typed diagnostic so the orchestrator can repair from the durable
 * child provenance.
 */

import { z } from "zod";
import { nanoid } from "nanoid";
import type {
  ChangeCreateInitialMetadata,
  Store,
} from "../storage/store-types";
import { getService } from "../temporal/service";
import { getProjectId } from "../utils/project-id";
import { formatToolOutput } from "../utils/tool-output";
import {
  opsFollowupSeededSignal,
  opsFollowupLinkAddedSignal,
} from "../temporal/messages";
import { subagentReportKey } from "../temporal/contracts";
import { fireSignalAndRefresh, getChangeHandle } from "./_adapters";
import {
  withTargetPathStore,
  formatTargetProjectContext,
  type TargetProjectOutputContext,
} from "./target-project";
import {
  OpsFollowupKindSchema,
  OpsRelationshipSchema,
  type OpsFollowupProfile,
  type OpsFollowupSource,
  type OpsFollowupLink,
  type Change,
  type ScopedSubagentReport,
  type RequiredFollowUp,
} from "../types";

const SOURCE_KIND_SCHEMA = z.enum([
  "required_follow_up",
  "report_follow_up",
  "agenda",
  "manual",
]);

const targetArgs = {
  target_path: z
    .string()
    .optional()
    .describe(
      "Optional absolute path to another ADV project. When provided, creates the follow-up change in the target project and links it from the source project.",
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

function sourceIdentityKey(input: {
  source_change_id: string;
  source_artifact?: string;
  source_contract_id?: string;
  source_task_id?: string;
  relationship: string;
  kind: string;
  target_path?: string;
}): string {
  return [
    input.source_change_id,
    input.source_artifact ?? "_",
    input.source_contract_id ?? "_",
    input.source_task_id ?? "_",
    input.relationship,
    input.kind,
    input.target_path ?? "_",
  ].join("|");
}

function findExistingOpsFollowupLink(
  sourceChange: Change,
  input: {
    source_artifact?: string;
    source_contract_id?: string;
    relationship: string;
    target_path?: string;
  },
): OpsFollowupLink | undefined {
  return (sourceChange.ops_followup_links ?? []).find((link) => {
    const artifactMatch = link.source_artifact === input.source_artifact;
    const contractMatch = link.source_contract_id === input.source_contract_id;
    const relationshipMatch = link.relationship === input.relationship;
    const targetMatch = link.target_path === input.target_path;
    return artifactMatch && contractMatch && relationshipMatch && targetMatch;
  });
}

function findReportByKey(
  change: Change,
  reportKey: string,
): ScopedSubagentReport | undefined {
  return (change.subagent_reports ?? []).find(
    (report) => reportId(report) === reportKey,
  );
}

function reportId(report: ScopedSubagentReport): string {
  return subagentReportKey({
    changeId: report.change_id,
    taskId: reportTaskId(report),
    scope: typeof report.scope === "string" ? undefined : report.scope,
    agent: report.agent,
    attempt: report.attempt,
  });
}

function reportTaskId(report: ScopedSubagentReport): string | undefined {
  if (typeof report.scope !== "string" && report.scope.kind === "task") {
    return report.scope.task_id;
  }
  return "task_id" in report ? report.task_id : undefined;
}

function findRequiredFollowUp(
  report: ScopedSubagentReport,
  source_contract_id?: string,
  summary?: string,
): RequiredFollowUp | undefined {
  const followUps =
    "required_follow_ups" in report ? (report.required_follow_ups ?? []) : [];
  if (source_contract_id) {
    return followUps.find((f) => f.source_contract_id === source_contract_id);
  }
  if (summary) {
    return followUps.find((f) => f.text === summary);
  }
  return followUps[0];
}

async function getChangeHandleForChangeId(
  store: Store,
  changeId: string,
): Promise<ReturnType<typeof getChangeHandle>> {
  const bundle = getService();
  if (!bundle) throw new Error("Temporal service not available");
  const projectId =
    store.productContext?.productProjectId ??
    (await getProjectId(store.paths.root));
  if (!projectId) throw new Error("Could not resolve project ID");
  return getChangeHandle(bundle.client, projectId, changeId);
}

async function loadSourceChange(
  store: Store,
  changeId: string,
): Promise<{ ok: true; change: Change } | { ok: false; error: string }> {
  const result = await store.changes.get(changeId);
  if (!result.success) {
    return { ok: false, error: result.error ?? `Failed to load ${changeId}` };
  }
  if (!result.data) {
    return { ok: false, error: `Source change not found: ${changeId}` };
  }
  return { ok: true, change: result.data };
}

interface PromotionInput {
  source_change_id: string;
  source_kind: z.infer<typeof SOURCE_KIND_SCHEMA>;
  source_report_key?: string;
  source_agenda_id?: string;
  source_contract_id?: string;
  source_task_id?: string;
  relationship: z.infer<typeof OpsRelationshipSchema>;
  kind: z.infer<typeof OpsFollowupKindSchema>;
  summary: string;
  capability?: string;
  proposal?: string;
  target_path?: string;
  target_confirmed?: true;
  confirmationEvidence?: string;
  dryRun?: boolean;
}

async function validateSource(
  input: PromotionInput,
  sourceChange: Change,
): Promise<
  | {
      ok: true;
      sourceArtifact: string | undefined;
      matchedRequiredFollowUp?: RequiredFollowUp;
    }
  | { ok: false; error: string }
> {
  const {
    source_kind,
    source_report_key,
    source_agenda_id,
    source_contract_id,
    summary,
  } = input;

  if (source_kind === "manual") {
    if (source_report_key || source_agenda_id) {
      return {
        ok: false,
        error:
          "Manual source cannot include source_report_key or source_agenda_id. Use source_kind 'report_follow_up' or 'agenda' for structured sources.",
      };
    }
    return { ok: true, sourceArtifact: undefined };
  }

  if (source_kind === "agenda") {
    if (!source_agenda_id) {
      return {
        ok: false,
        error: "Agenda source requires source_agenda_id.",
      };
    }
    if (source_report_key) {
      return {
        ok: false,
        error: "Agenda source cannot include source_report_key.",
      };
    }
    return { ok: true, sourceArtifact: source_agenda_id };
  }

  // report_follow_up or required_follow_up
  if (!source_report_key) {
    return {
      ok: false,
      error: `source_kind '${source_kind}' requires source_report_key pointing to the originating sub-agent report.`,
    };
  }

  const report = findReportByKey(sourceChange, source_report_key);
  if (!report) {
    return {
      ok: false,
      error: `Report not found on source change: ${source_report_key}`,
    };
  }

  if (source_kind === "report_follow_up") {
    return { ok: true, sourceArtifact: source_report_key };
  }

  const matched = findRequiredFollowUp(report, source_contract_id, summary);
  if (!matched) {
    const reason = source_contract_id
      ? `No required_follow_up with source_contract_id '${source_contract_id}' found in report ${source_report_key}`
      : `No required_follow_ups found in report ${source_report_key}`;
    return { ok: false, error: reason };
  }

  return {
    ok: true,
    sourceArtifact: source_report_key,
    matchedRequiredFollowUp: matched,
  };
}

function validateArgs(
  args: PromotionInput,
): { ok: true } | { ok: false; error: string } {
  if (!args.summary.trim()) {
    return { ok: false, error: "summary is required and cannot be blank." };
  }
  if (!args.source_change_id.trim()) {
    return { ok: false, error: "source_change_id is required." };
  }
  return { ok: true };
}

async function createChildChange(
  input: PromotionInput,
  store: Store,
  crossProjectOrigin?: Change["cross_project_origin"],
): Promise<
  | { ok: true; result: { changeId: string; path: string } }
  | { ok: false; error: string }
> {
  const artifacts: Record<string, string> = {};
  if (input.proposal !== undefined && input.proposal.trim().length > 0) {
    artifacts.proposal = input.proposal;
  }

  const initialMetadata: ChangeCreateInitialMetadata | undefined =
    crossProjectOrigin
      ? { cross_project_origin: crossProjectOrigin }
      : undefined;

  try {
    const result = await store.changes.create(input.summary, {
      capability: input.capability,
      ...(Object.keys(artifacts).length > 0 ? { artifacts } : {}),
      ...(initialMetadata ? { initialMetadata } : {}),
    });
    return { ok: true, result };
  } catch (err) {
    return {
      ok: false,
      error: `Failed to create follow-up change: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function seedChildOpsFollowup(
  childStore: Store,
  childChangeId: string,
  profile: OpsFollowupProfile,
): Promise<void> {
  const handle = await getChangeHandleForChangeId(childStore, childChangeId);
  await fireSignalAndRefresh(
    handle,
    childStore,
    childChangeId,
    opsFollowupSeededSignal,
    {
      profile,
      seededAt: profile.created_at,
    },
  );
}

async function addParentOpsFollowupLink(
  sourceStore: Store,
  sourceChangeId: string,
  link: OpsFollowupLink,
): Promise<void> {
  const handle = await getChangeHandleForChangeId(sourceStore, sourceChangeId);
  await fireSignalAndRefresh(
    handle,
    sourceStore,
    sourceChangeId,
    opsFollowupLinkAddedSignal,
    {
      link,
      addedAt: link.linked_at,
    },
  );
}

function buildOpsFollowupProfile(
  input: PromotionInput,
  sourceProjectId: string | undefined,
  sourcePath: string,
  sourceArtifact: string | undefined,
  linkedAt: string,
): OpsFollowupProfile {
  const source: OpsFollowupSource = {
    source_change_id: input.source_change_id,
    ...(sourceProjectId ? { source_project_id: sourceProjectId } : {}),
    source_path: sourcePath,
    source_kind: input.source_kind,
    ...(sourceArtifact ? { source_artifact: sourceArtifact } : {}),
    ...(input.source_contract_id
      ? { source_contract_id: input.source_contract_id }
      : {}),
    ...(input.source_task_id ? { source_task_id: input.source_task_id } : {}),
    ...(input.source_kind === "required_follow_up" ||
    input.source_kind === "report_follow_up"
      ? input.source_report_key
        ? { source_report_key: input.source_report_key }
        : {}
      : {}),
    ...(input.source_kind === "agenda" && input.source_agenda_id
      ? { source_agenda_id: input.source_agenda_id }
      : {}),
  };

  return {
    kind: input.kind,
    source,
    relationship: input.relationship,
    status: "not_started",
    created_at: linkedAt,
    evidence: [],
  };
}

async function promoteInStore(
  input: PromotionInput,
  sourceStore: Store,
  childStore: Store,
  sourceProjectId: string | undefined,
  sourcePath: string,
  targetContext?: TargetProjectOutputContext,
): Promise<string> {
  const sourceLoad = await loadSourceChange(
    sourceStore,
    input.source_change_id,
  );
  if (!sourceLoad.ok) return formatToolOutput({ error: sourceLoad.error });
  const sourceChange = sourceLoad.change;

  const sourceValidation = await validateSource(input, sourceChange);
  if (!sourceValidation.ok)
    return formatToolOutput({ error: sourceValidation.error });

  const { sourceArtifact } = sourceValidation;

  const duplicate = findExistingOpsFollowupLink(sourceChange, {
    source_artifact: sourceArtifact,
    source_contract_id: input.source_contract_id,
    relationship: input.relationship,
    target_path: input.target_path,
  });

  if (duplicate) {
    return formatToolOutput({
      success: true,
      duplicate: true,
      source_change_id: input.source_change_id,
      child_change_id: duplicate.changeId,
      link: duplicate,
      message:
        "A follow-up link with the same structural source identity already exists on the source change.",
    });
  }

  if (input.dryRun) {
    return formatToolOutput({
      success: true,
      dryRun: true,
      source_change_id: input.source_change_id,
      source_identity: sourceIdentityKey({
        source_change_id: input.source_change_id,
        source_artifact: sourceArtifact,
        source_contract_id: input.source_contract_id,
        source_task_id: input.source_task_id,
        relationship: input.relationship,
        kind: input.kind,
        target_path: input.target_path,
      }),
      would_create: {
        title: input.summary,
        kind: input.kind,
        relationship: input.relationship,
        target_path: input.target_path,
      },
    });
  }

  const crossProjectOrigin: Change["cross_project_origin"] | undefined =
    targetContext
      ? {
          source_project: sourceStore.config?.name ?? sourcePath,
          source_path: sourcePath,
          source_change_id: input.source_change_id,
          linked_at: new Date().toISOString(),
        }
      : undefined;

  const createResult = await createChildChange(
    input,
    childStore,
    crossProjectOrigin,
  );
  if (!createResult.ok) return formatToolOutput({ error: createResult.error });

  const linkedAt = new Date().toISOString();
  const childProjectId = targetContext?.projectId ?? sourceProjectId;
  const childPath = targetContext?.root ?? sourcePath;

  const profile = buildOpsFollowupProfile(
    input,
    sourceProjectId,
    sourcePath,
    sourceArtifact,
    linkedAt,
  );

  try {
    await seedChildOpsFollowup(
      childStore,
      createResult.result.changeId,
      profile,
    );
  } catch (err) {
    return formatToolOutput({
      error: `Failed to seed ops_followup profile on child change ${createResult.result.changeId}: ${err instanceof Error ? err.message : String(err)}`,
      code: "CHILD_SEED_FAILED",
      child_change_id: createResult.result.changeId,
      child_project_id: childProjectId,
      child_path: childPath,
    });
  }

  const link: OpsFollowupLink = {
    id: `ofl-${nanoid(12)}`,
    changeId: createResult.result.changeId,
    relationship: input.relationship,
    status: "not_started",
    required_handoff: false,
    linked_at: linkedAt,
    ...(input.target_path ? { target_path: input.target_path } : {}),
    ...(childProjectId ? { target_project_id: childProjectId } : {}),
    ...(sourceArtifact ? { source_artifact: sourceArtifact } : {}),
    ...(input.source_contract_id
      ? { source_contract_id: input.source_contract_id }
      : {}),
  };

  try {
    await addParentOpsFollowupLink(sourceStore, input.source_change_id, link);
  } catch (err) {
    return formatToolOutput({
      success: true,
      partial_link: true,
      code: "PARTIAL_LINK",
      source_change_id: input.source_change_id,
      child_change_id: createResult.result.changeId,
      child_project_id: childProjectId,
      child_path: childPath,
      child_ops_followup: profile,
      link,
      error: `Child created and profile seeded, but parent link signal failed: ${err instanceof Error ? err.message : String(err)}`,
      repair_action:
        "Re-fire opsFollowupLinkAddedSignal on the source change with the provided link payload, or retry adv_followup_promote with the same arguments.",
    });
  }

  const output: Record<string, unknown> = {
    success: true,
    source_change_id: input.source_change_id,
    child_change_id: createResult.result.changeId,
    child_project_id: childProjectId,
    child_path: childPath,
    link,
    ops_followup: profile,
  };

  if (targetContext) {
    output._projectContext = formatTargetProjectContext({
      root: targetContext.root,
      projectId: targetContext.projectId,
      trusted: targetContext.trusted,
      trustSource: targetContext.trustSource,
      stateMode: targetContext.stateMode,
      warning: targetContext.warning,
    } as never);
  }

  return formatToolOutput(output);
}

export const followupTools = {
  adv_followup_promote: {
    description:
      "Promote an ops/enabler follow-up into a linked ADV child change with a typed ops_followup profile. " +
      "Prefers structured sources (required_follow_up from sub-agent reports, report metadata) over agenda text or manual fallback. " +
      "Creates the child change, seeds its ops_followup profile, and records an outbound ops_followup_link on the source change.",
    args: {
      source_change_id: z
        .string()
        .describe("Change ID that originated the follow-up."),
      source_kind: SOURCE_KIND_SCHEMA.describe(
        "Structured source kind. required_follow_up/report_follow_up use source_report_key; agenda uses source_agenda_id; manual has no artifact.",
      ),
      source_report_key: z
        .string()
        .optional()
        .describe(
          "Sub-agent report key when source_kind is required_follow_up or report_follow_up.",
        ),
      source_agenda_id: z
        .string()
        .optional()
        .describe("Agenda item ID when source_kind is agenda. Fallback only."),
      source_contract_id: z
        .string()
        .optional()
        .describe(
          "Contract item ID that motivated the follow-up, when applicable (typically from a required_follow_up).",
        ),
      source_task_id: z
        .string()
        .optional()
        .describe("Originating task ID in the source change, when applicable."),
      relationship: OpsRelationshipSchema.describe(
        "Ops relationship from source to child. 'blocks' is the hard-blocking release-safety path; 'follows_release', 'monitors', and 'cleanup_after' support release-first sequencing.",
      ),
      kind: OpsFollowupKindSchema.describe(
        "Kind of ops/enabler follow-up work.",
      ),
      summary: z
        .string()
        .describe(
          "2-5 word title for the new follow-up change. Start with an action verb.",
        ),
      capability: z
        .string()
        .optional()
        .describe("Primary capability affected."),
      proposal: z
        .string()
        .optional()
        .describe("Optional proposal.md content for the new follow-up change."),
      dryRun: z
        .boolean()
        .optional()
        .describe(
          "When true, returns a preview without creating or linking any changes.",
        ),
      ...targetArgs,
    },
    execute: async (
      {
        source_change_id,
        source_kind,
        source_report_key,
        source_agenda_id,
        source_contract_id,
        source_task_id,
        relationship,
        kind,
        summary,
        capability,
        proposal,
        dryRun,
        target_path,
        target_confirmed,
        confirmationEvidence,
      }: {
        source_change_id: string;
        source_kind: z.infer<typeof SOURCE_KIND_SCHEMA>;
        source_report_key?: string;
        source_agenda_id?: string;
        source_contract_id?: string;
        source_task_id?: string;
        relationship: z.infer<typeof OpsRelationshipSchema>;
        kind: z.infer<typeof OpsFollowupKindSchema>;
        summary: string;
        capability?: string;
        proposal?: string;
        dryRun?: boolean;
        target_path?: string;
        target_confirmed?: true;
        confirmationEvidence?: string;
      },
      store: Store,
    ) => {
      const argValidation = validateArgs({
        source_change_id,
        source_kind,
        summary,
        relationship,
        kind,
      });
      if (!argValidation.ok)
        return formatToolOutput({ error: argValidation.error });

      const sourceProjectId =
        store.productContext?.productProjectId ??
        (await getProjectId(store.paths.root)) ??
        undefined;
      const sourcePath = store.paths.root;

      if (target_path) {
        return withTargetPathStore(
          {
            currentProjectPath: sourcePath,
            target_path,
            stateRequirement: "temporal-required",
            target_confirmed,
            confirmationEvidence,
          },
          async ({ context, store: targetStore }) =>
            promoteInStore(
              {
                source_change_id,
                source_kind,
                source_report_key,
                source_agenda_id,
                source_contract_id,
                source_task_id,
                relationship,
                kind,
                summary,
                capability,
                proposal,
                dryRun,
                target_path,
                target_confirmed,
                confirmationEvidence,
              },
              store,
              targetStore,
              sourceProjectId,
              sourcePath,
              formatTargetProjectContext(context),
            ),
        );
      }

      return promoteInStore(
        {
          source_change_id,
          source_kind,
          source_report_key,
          source_agenda_id,
          source_contract_id,
          source_task_id,
          relationship,
          kind,
          summary,
          capability,
          proposal,
          dryRun,
          target_path,
          target_confirmed,
          confirmationEvidence,
        },
        store,
        store,
        sourceProjectId,
        sourcePath,
      );
    },
  },
};
