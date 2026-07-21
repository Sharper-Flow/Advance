/**
 * recovery helpers extracted from change.ts.
 */
import { execGit } from "../../utils/git.js";
import { parseGitRemoteUrl } from "../../utils/git-remote";
import { execGh } from "../../integrations/gh-cli";
import { readGitHubProjectConfig } from "../../storage/github-project-config";
import type { Spec } from "../../types";
import {
  createDefaultGates,
  allGatesSatisfied,
  GATE_ORDER,
  type GateId,
  type Change,
} from "../../types";
import type { Store } from "../../storage/store";
import { loadChange } from "../../storage/json";
import { ChangeSchema } from "../../types/changes";
import { ZodError } from "zod";
import { formatZodError } from "../../utils/safe-execute";
import { findArchiveBundle } from "../../archive/archive";
import { readFile } from "fs/promises";
import { join } from "path";
import { formatToolOutput } from "../../utils/tool-output";
import { buildChangeContextSnapshot } from "../../utils/context-snapshot";
import { changeToDirectiveState } from "../../temporal/change-state";
import { deriveDirectiveSafe } from "../../utils/workflow-directive";
import { collectErrorText } from "../../temporal/retry-wrapper";
import { loadProposalForContext } from "../change/artifacts";
/**
 * Detect disk/Temporal gate divergence for the incomplete-gates archive
 * preflight path. If the on-disk change.json shows all gates satisfied but
 * the store-backed change object does not, the Temporal workflow state is
 * stale relative to disk — typically after a manual gate fix or recovery.
 */
export async function getGateDivergenceHint(
  store: Store,
  changeId: string,
  change: {
    gates?: ReturnType<typeof createDefaultGates>;
  },
): Promise<string | null> {
  const storeGates = change.gates ?? createDefaultGates();
  if (allGatesSatisfied(storeGates)) {
    return null; // No divergence — store already sees gates done
  }
  const diskResult = await loadChange(store.paths.changes, changeId);
  if (!diskResult.success || !diskResult.data) {
    return null; // Can't read disk — degrade gracefully
  }
  const diskGates = diskResult.data.gates ?? createDefaultGates();
  if (allGatesSatisfied(diskGates)) {
    return `Disk shows gates done but Temporal sees them incomplete. Run \`adv_change_show changeId: ${changeId}\` and \`adv_gate_status changeId: ${changeId}\` to inspect, then \`adv_temporal_diagnose changeId: ${changeId}\` for recovery guidance.`;
  }
  return null; // Both agree gates are incomplete
}
export const ARCHIVE_SEARCH_ATTRIBUTE_RECOVERY_HINT =
  "Run adv_temporal_diagnose. If search attributes are missing or unverified, run adv_temporal_register_search_attributes, then adv_temporal_worker_restart (worker process only), then retry archive. Restart OpenCode for plugin tool-code drift; worker restart does not reload plugin/src/tools/*.ts.";
export function isSearchAttributeArchiveFailure(errorText: string): boolean {
  return /search attribute|SearchAttribute|upsertSearchAttributes|AdvChangeStatus|AdvChangeId/i.test(
    errorText,
  );
}
export type StatusRepairReadback = {
  showStatus?: Change["status"];
  /**
   * rq-shippedWorkflowTermination01 D6: lifecycleState readback. The read
   * normalizer (`normalizeChangeLifecycleState`) trusts the stored literal
   * first, so a stale `lifecycleState:"open"` survives status-only writes.
   * Terminal recovery paths assert both status and lifecycleState.
   */
  showLifecycleState?: Change["lifecycleState"];
  inFlightCount: number;
  archivedCount: number;
};
export type StatusRepairReadbackResult =
  | {
      ok: true;
      readback: StatusRepairReadback;
    }
  | {
      ok: false;
      error: string;
      readback: StatusRepairReadback;
    };
export async function verifyStatusRepairReadAfterWrite(input: {
  store: Store;
  changeId: string;
  /**
   * rq-shippedWorkflowTermination01 D6: when true (caller is converging
   * terminal authority after a pinned-run termination), the readback also
   * asserts `showLifecycleState === "archived"`. Existing callers
   * (adv_change_status_repair) omit this flag and retain status-only
   * assertions.
   */
  requireLifecycleState?: boolean;
}): Promise<StatusRepairReadbackResult> {
  let showResult: Awaited<ReturnType<Store["changes"]["get"]>>;
  let inFlight: Awaited<ReturnType<Store["changes"]["list"]>>;
  let archived: Awaited<ReturnType<Store["changes"]["list"]>>;
  try {
    showResult = await input.store.changes.get(input.changeId);
    // AC3 parity: verify the warm-path summary list (adv_change_list) first
    // when the store exposes it, because that is the public read path most
    // likely to read a stale memo/cache entry after a disk-only status repair.
    const inFlightList = input.store.changes.listSummary
      ? await input.store.changes.listSummary({})
      : await input.store.changes.list({});
    archived = await input.store.changes.list({
      status: "archived",
      includeArchived: true,
    });
    inFlight = inFlightList;
  } catch (error) {
    const readback = {
      inFlightCount: -1,
      archivedCount: -1,
    } satisfies StatusRepairReadback;
    return {
      ok: false,
      error: `readback threw: ${collectErrorText(error)}`,
      readback,
    };
  }
  const showStatus = showResult.success
    ? (showResult.data?.status as Change["status"] | undefined)
    : undefined;
  const showLifecycleState = showResult.success
    ? (showResult.data?.lifecycleState as Change["lifecycleState"] | undefined)
    : undefined;
  const inFlightCount = inFlight.changes.filter(
    (change) => change.id === input.changeId,
  ).length;
  const archivedCount = archived.changes.filter(
    (change) => change.id === input.changeId,
  ).length;
  const readback: StatusRepairReadback = {
    showStatus,
    showLifecycleState,
    inFlightCount,
    archivedCount,
  };
  const failures: string[] = [];
  if (showStatus !== "archived") {
    failures.push(
      `adv_change_show-equivalent status is ${showStatus ?? "missing"}`,
    );
  }
  if (input.requireLifecycleState && showLifecycleState !== "archived") {
    failures.push(
      `adv_change_show-equivalent lifecycleState is ${showLifecycleState ?? "missing"} (expected archived)`,
    );
  }
  if (inFlightCount !== 0) {
    failures.push(
      `in-flight list contains ${input.changeId} ${inFlightCount} time(s)`,
    );
  }
  if (archivedCount !== 1) {
    failures.push(
      `archived list contains ${input.changeId} ${archivedCount} time(s)`,
    );
  }
  if (failures.length > 0) {
    return { ok: false, error: failures.join("; "), readback };
  }
  return { ok: true, readback };
}

// =============================================================================
// Shipped-terminal proof (rq-shippedWorkflowTermination01)
// =============================================================================
//
// Pure helper that computes structural shipped-terminal proof for
// adv_change_workflow_terminate's alternate eligibility branch. Loads the
// durable disk projection and archive bundle, parses both via ChangeSchema,
// verifies all seven disk gates are done, phase9_status is done, and the
// bundle's embedded change.id strictly equals the requested changeId.
//
// The helper performs NO mutations — neither termination, cache refresh, nor
// projection writes. Refusals return typed codes so the operator-facing tool
// can produce precise diagnostics.

export type ShippedTerminalProofRefusalCode =
  | "PROOF_INVALID_DISK_PROJECTION"
  | "PROOF_MISSING_GATES"
  | "PROOF_MISSING_PHASE9"
  | "PROOF_NO_BUNDLE"
  | "PROOF_INVALID_BUNDLE"
  | "PROOF_BUNDLE_ID_MISMATCH";

export type ShippedTerminalProofResult =
  | {
      ok: true;
      diskChange: Change;
      bundlePath: string;
      bundleChange: Change;
    }
  | {
      ok: false;
      refusalCode: ShippedTerminalProofRefusalCode;
      evidence: string;
    };

/**
 * Compute structural shipped-terminal proof from the durable disk projection
 * and archive bundle. Used by adv_change_workflow_terminate to authorize
 * exact-run termination of a live RUNNING/PAUSED workflow whose describe()
 * carries no poisoned-history evidence.
 *
 * Refusal codes (each returns zero-mutation typed evidence):
 * - PROOF_INVALID_DISK_PROJECTION: loadChange fails OR ChangeSchema.parse fails
 * - PROOF_MISSING_GATES: any of seven disk gates not done
 * - PROOF_MISSING_PHASE9: phase9_status.status !== "done"
 * - PROOF_NO_BUNDLE: findArchiveBundle returns null
 * - PROOF_INVALID_BUNDLE: bundle change.json fails ChangeSchema.parse
 * - PROOF_BUNDLE_ID_MISMATCH: parsed bundle change.id !== requested changeId
 */
export async function computeShippedTerminalProof(input: {
  changesDir: string;
  archiveDir: string;
  changeId: string;
}): Promise<ShippedTerminalProofResult> {
  const { changesDir, archiveDir, changeId } = input;

  // Step 1: load durable disk projection. loadChange returns success:false
  // for read errors, success:true with null data for ENOENT, and success:true
  // with parsed data for valid change.json. ChangeSchema.parse is applied
  // internally by loadChange; we re-parse here so a future schema-drift
  // between loadChange and ChangeSchema is caught explicitly.
  const loadResult = await loadChange(changesDir, changeId);
  if (!loadResult.success) {
    return {
      ok: false,
      refusalCode: "PROOF_INVALID_DISK_PROJECTION",
      evidence: `loadChange failed: ${loadResult.error ?? "unknown error"}`,
    };
  }
  if (!loadResult.data) {
    return {
      ok: false,
      refusalCode: "PROOF_INVALID_DISK_PROJECTION",
      evidence: `loadChange returned no data (change.json missing under ${changesDir}/${changeId})`,
    };
  }

  // Re-validate via ChangeSchema so schema drift is caught with a precise
  // Zod issue path rather than a generic loadChange error.
  let diskChange: Change;
  try {
    diskChange = ChangeSchema.parse(loadResult.data);
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        ok: false,
        refusalCode: "PROOF_INVALID_DISK_PROJECTION",
        evidence: `disk ChangeSchema parse failed: ${formatZodError(error)}`,
      };
    }
    return {
      ok: false,
      refusalCode: "PROOF_INVALID_DISK_PROJECTION",
      evidence: `disk ChangeSchema parse threw non-Zod error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  // Step 2: all seven gates done on disk projection.
  const diskGates = diskChange.gates ?? createDefaultGates();
  const incompleteGates = GATE_ORDER.filter(
    (gateId) => diskGates[gateId]?.status !== "done",
  );
  if (incompleteGates.length > 0) {
    return {
      ok: false,
      refusalCode: "PROOF_MISSING_GATES",
      evidence: `gates not done: ${incompleteGates.join(", ")}`,
    };
  }

  // Step 3: phase9_status.status === "done".
  if (diskChange.phase9_status?.status !== "done") {
    return {
      ok: false,
      refusalCode: "PROOF_MISSING_PHASE9",
      evidence: `phase9_status.status: ${diskChange.phase9_status?.status ?? "undefined"}`,
    };
  }

  // Step 4: archive bundle exists.
  const bundlePath = await findArchiveBundle(archiveDir, changeId);
  if (!bundlePath) {
    return {
      ok: false,
      refusalCode: "PROOF_NO_BUNDLE",
      evidence: `no archive bundle found under ${archiveDir} for ${changeId}`,
    };
  }

  // Step 5: bundle change.json is readable and schema-valid.
  let bundleJsonText: string;
  try {
    bundleJsonText = await readFile(join(bundlePath, "change.json"), "utf-8");
  } catch (error) {
    return {
      ok: false,
      refusalCode: "PROOF_INVALID_BUNDLE",
      evidence: `bundle change.json unreadable at ${bundlePath}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  let bundleParsed: unknown;
  try {
    bundleParsed = JSON.parse(bundleJsonText);
  } catch (error) {
    return {
      ok: false,
      refusalCode: "PROOF_INVALID_BUNDLE",
      evidence: `bundle change.json JSON parse failed at ${bundlePath}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  let bundleChange: Change;
  try {
    bundleChange = ChangeSchema.parse(bundleParsed);
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        ok: false,
        refusalCode: "PROOF_INVALID_BUNDLE",
        evidence: `bundle ChangeSchema parse failed: ${formatZodError(error)}`,
      };
    }
    return {
      ok: false,
      refusalCode: "PROOF_INVALID_BUNDLE",
      evidence: `bundle ChangeSchema parse threw non-Zod error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  // Step 6: bundle's embedded change.id strictly equals requested changeId.
  if (bundleChange.id !== changeId) {
    return {
      ok: false,
      refusalCode: "PROOF_BUNDLE_ID_MISMATCH",
      evidence: `bundle change.id: "${bundleChange.id}", requested: "${changeId}"`,
    };
  }

  return { ok: true, diskChange, bundlePath, bundleChange };
}
export async function loadSpecsMap(store: Store): Promise<Map<string, Spec>> {
  const specList = await store.specs.list();
  const specs = new Map<string, Spec>();
  for (const specInfo of specList.specs) {
    const specResult = await store.specs.get(specInfo.name);
    if (specResult.success && specResult.data) {
      specs.set(specInfo.name, specResult.data);
    }
  }
  return specs;
}
export async function buildReentryResult(
  store: Store,
  changeId: string,
  fromGate: GateId,
  includeSnapshot = false,
): Promise<string> {
  const gates = await store.gates.get(changeId);
  const updatedChange = await store.changes.get(changeId);
  const reentryHistory =
    updatedChange.success && updatedChange.data
      ? (updatedChange.data.reentry_history ?? [])
      : [];
  const latestEntry = reentryHistory[reentryHistory.length - 1];
  // Build context snapshot showing the reset gate state
  let contextSnapshot: string | undefined;
  if (updatedChange.success && updatedChange.data) {
    const { content: proposalText } = await loadProposalForContext(
      store,
      changeId,
      updatedChange.data.title,
    );
    // AC5: re-entry/recovery handoff snapshot carries the `Next:` orientation
    // line so a resumed change tells the agent which gate/command is next.
    // Best effort: a derivation failure must not break the handoff snapshot;
    // the snapshot omits the `Next:` line.
    const directive = deriveDirectiveSafe(
      changeToDirectiveState({
        projectId: updatedChange.data.adv_project_id ?? "unknown",
        change: updatedChange.data,
        gates: gates ?? undefined,
      }),
      Date.now(),
    );
    contextSnapshot = buildChangeContextSnapshot({
      change: updatedChange.data,
      proposalText,
      gates: gates ?? undefined,
      workdir: store.paths.root,
      directive,
    });
  }
  const output: Record<string, unknown> = {
    success: true,
    message: `Re-entry from ${fromGate}: gates reset to pending. ${latestEntry?.gates_reset?.length ?? 0} gate(s) reopened.`,
    gates,
    reentry: latestEntry,
  };
  if (contextSnapshot && includeSnapshot) {
    output._contextSnapshot = contextSnapshot;
  }
  return formatToolOutput(output);
}
// =============================================================================
// Linked Issue Closure
// =============================================================================
export interface CloseLinkedIssueResult {
  close_eligible?: boolean;
  issue_closed: number[];
  issue_closure_error?: {
    issue_number: number;
    exitCode: number;
    stderr: string;
    manualCommand: string;
  };
  dryRun?: boolean;
}
export async function closeLinkedIssue(options: {
  change: Change;
  store: Store;
  noCloseIssue?: boolean;
  dryRun?: boolean;
  existingBundlePath?: string;
  worktreePath?: string;
}): Promise<CloseLinkedIssueResult> {
  const {
    change,
    store,
    noCloseIssue,
    dryRun,
    existingBundlePath,
    worktreePath,
  } = options;
  const issueNumber = change.origin?.issue_number;
  const originKind = change.origin?.kind;
  // Close-eligibility requires BOTH an issue link AND an issue-driven origin
  // kind. `roadmap` (legacy) and `triage` origins are issue-driven and
  // auto-close on archive. `discovery` and `adhoc` origins are not
  // issue-driven — an `issue_number` on those is an incidental reference,
  // not a fix-target link, so auto-closing would surprise the operator.
  // See `change.test.ts > ineligible origin: discovery/adhoc origin`.
  const ISSUE_DRIVEN_ORIGIN_KINDS = new Set(["roadmap", "triage"]);
  if (
    !issueNumber ||
    issueNumber <= 0 ||
    !originKind ||
    !ISSUE_DRIVEN_ORIGIN_KINDS.has(originKind)
  ) {
    return { issue_closed: [] };
  }
  if (noCloseIssue) {
    return { close_eligible: true, issue_closed: [] };
  }
  if (dryRun) {
    return { close_eligible: true, issue_closed: [], dryRun: true };
  }
  const ghConfig = await readGitHubProjectConfig(
    store.paths.root,
    store.paths.external ?? null,
  );
  const cwd = worktreePath ?? store.paths.root;
  // Determine if --repo flag is needed
  let repoFlag: string | undefined;
  if (ghConfig?.owner && ghConfig?.repository_filter) {
    const configRepo = `${ghConfig.owner}/${ghConfig.repository_filter}`;
    let currentRepoStr: string | undefined;
    try {
      const remoteUrl = (
        await execGit(["remote", "get-url", "origin"], cwd)
      ).trim();
      const parsed = parseGitRemoteUrl(remoteUrl);
      if (parsed) {
        currentRepoStr = `${parsed.owner}/${parsed.name}`;
      }
    } catch {
      // ignore
    }
    if (!currentRepoStr || currentRepoStr !== configRepo) {
      repoFlag = configRepo;
    }
  }
  // Get short SHA for comment
  let shortSha = "unknown";
  try {
    shortSha = (await execGit(["rev-parse", "--short", "HEAD"], cwd)).trim();
  } catch {
    // silently use "unknown"
  }
  // Post comment unless re-archive
  if (!existingBundlePath) {
    const commentText = `Shipped via ${change.id} (${shortSha})`;
    const commentArgs = [
      "issue",
      "comment",
      String(issueNumber),
      "--body",
      commentText,
    ];
    if (repoFlag) {
      commentArgs.push("--repo", repoFlag);
    }
    await execGh(commentArgs, cwd);
    // Comment errors are non-fatal; continue to close
  }
  // Close the issue
  const closeArgs = [
    "issue",
    "close",
    String(issueNumber),
    "--reason",
    "completed",
  ];
  if (repoFlag) {
    closeArgs.push("--repo", repoFlag);
  }
  const closeResult = await execGh(closeArgs, cwd);
  if (closeResult.ghNotFound) {
    return { close_eligible: true, issue_closed: [] };
  }
  if (closeResult.exitCode !== 0) {
    const manualCommand = `gh issue close ${issueNumber} --reason completed${repoFlag ? ` --repo ${repoFlag}` : ""}`;
    return {
      issue_closed: [],
      issue_closure_error: {
        issue_number: issueNumber,
        exitCode: closeResult.exitCode,
        stderr: closeResult.stderr,
        manualCommand,
      },
    };
  }
  return { close_eligible: true, issue_closed: [issueNumber] };
}
export type ChangeCloseRecoveryMode = "normal" | "poisoned_history";
export interface ChangeClosePayloadInput {
  approvalEvidence: string;
  reason: "cancelled" | "superseded" | "not_planned";
  supersededBy?: string;
  cancelledAt: string;
}
export function buildChangeClosePayload(input: ChangeClosePayloadInput) {
  return {
    approvalEvidence: input.approvalEvidence,
    reason: input.reason,
    supersededBy: input.supersededBy,
    cancelledBy: "agent",
    cancelledAt: input.cancelledAt,
  };
}
export function buildChangeClosure(
  input: ChangeClosePayloadInput,
): Change["closure"] {
  return {
    reason: input.reason,
    approved_by_user: true,
    approval_evidence: input.approvalEvidence,
    approved_at: input.cancelledAt,
    superseded_by: input.supersededBy,
  };
}
export async function validateChangeCloseRecoveryArgs(input: {
  changeId?: string;
  recoveryMode?: ChangeCloseRecoveryMode;
  recoveryEvidence?: string;
}): Promise<Record<string, unknown> | null> {
  if (input.recoveryMode !== "poisoned_history") return null;
  const { isPreciseWorkflowRecoveryEvidence } =
    await import("../../temporal/recovery-classification");
  if (!input.recoveryEvidence?.trim()) {
    return {
      error:
        "change close recovery requires non-empty recoveryEvidence when recoveryMode='poisoned_history'",
      ...(input.changeId ? { changeId: input.changeId } : {}),
    };
  }
  if (!isPreciseWorkflowRecoveryEvidence(input.recoveryEvidence)) {
    return {
      error:
        "change close recoveryEvidence must cite precise poisoned-history or completed-workflow evidence",
      ...(input.changeId ? { changeId: input.changeId } : {}),
    };
  }
  return null;
}
export async function recoverCompletedWorkflowClose(input: {
  store: Store;
  change: Change;
  closeInput: ChangeClosePayloadInput;
  recoveryMode?: ChangeCloseRecoveryMode;
  recoveryEvidence?: string;
  signalError: unknown;
}): Promise<{
  recovered: boolean;
  error?: string;
}> {
  if (input.recoveryMode !== "poisoned_history") {
    return {
      recovered: false,
      error:
        input.signalError instanceof Error
          ? input.signalError.message
          : String(input.signalError),
    };
  }
  const { isWorkflowCompletedError } =
    await import("../../temporal/recovery-classification");
  if (!isWorkflowCompletedError(input.signalError)) {
    return {
      recovered: false,
      error:
        input.signalError instanceof Error
          ? input.signalError.message
          : String(input.signalError),
    };
  }
  const { saveRecoveredChangeStatus } = await import("../_recovery-writers");
  await saveRecoveredChangeStatus({
    store: input.store,
    change: input.change,
    authorization: {
      reason: "completed_workflow_close_recovery",
      evidence: input.recoveryEvidence ?? String(input.signalError),
    },
    status: "closed",
    closure: buildChangeClosure(input.closeInput),
  });
  return { recovered: true };
}
