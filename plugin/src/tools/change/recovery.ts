/** Disk-state repair and archive support helpers. */
import { execGit } from "../../utils/git.js";
import { parseGitRemoteUrl } from "../../utils/git-remote";
import { execGh } from "../../integrations/gh-cli";
import { readGitHubProjectConfig } from "../../storage/github-project-config";
import type { Spec, Change } from "../../types";
import { type GateId } from "../../types";
import type { Store } from "../../storage/store";
import { formatToolOutput } from "../../utils/tool-output";
import { buildChangeContextSnapshot } from "../../utils/context-snapshot";
import { deriveDirectiveSafe } from "../../utils/workflow-directive";
import { loadProposalForContext } from "./artifacts";

/** Read-back proof for genuine disk status repair. */
export type StatusRepairReadback = {
  showStatus?: Change["status"];
  showLifecycleState?: Change["lifecycleState"];
  inFlightCount: number;
  archivedCount: number;
};

export type StatusRepairReadbackResult =
  | { ok: true; readback: StatusRepairReadback }
  | { ok: false; error: string; readback: StatusRepairReadback };

export async function verifyStatusRepairReadAfterWrite(input: {
  store: Store;
  changeId: string;
  requireLifecycleState?: boolean;
}): Promise<StatusRepairReadbackResult> {
  let showResult: Awaited<ReturnType<Store["changes"]["get"]>>;
  let inFlight: Awaited<ReturnType<Store["changes"]["list"]>>;
  let archived: Awaited<ReturnType<Store["changes"]["list"]>>;
  try {
    showResult = await input.store.changes.get(input.changeId);
    inFlight = await input.store.changes.list({});
    archived = await input.store.changes.list({
      status: "archived",
      includeArchived: true,
    });
  } catch (error) {
    const readback = {
      inFlightCount: -1,
      archivedCount: -1,
    } satisfies StatusRepairReadback;
    return {
      ok: false,
      error: `readback threw: ${error instanceof Error ? error.message : String(error)}`,
      readback,
    };
  }
  const readback: StatusRepairReadback = {
    showStatus: showResult.success ? showResult.data?.status : undefined,
    showLifecycleState: showResult.success
      ? showResult.data?.lifecycleState
      : undefined,
    inFlightCount: inFlight.changes.filter(
      (change) =>
        change.id === input.changeId &&
        change.status !== "archived" &&
        change.status !== "closed",
    ).length,
    archivedCount: archived.changes.filter(
      (change) => change.id === input.changeId,
    ).length,
  };
  const failures: string[] = [];
  if (readback.showStatus !== "archived")
    failures.push(
      `adv_change_show-equivalent status is ${readback.showStatus ?? "missing"}`,
    );
  if (input.requireLifecycleState && readback.showLifecycleState !== "archived")
    failures.push(
      `adv_change_show-equivalent lifecycleState is ${readback.showLifecycleState ?? "missing"} (expected archived)`,
    );
  if (readback.inFlightCount !== 0)
    failures.push(
      `in-flight list contains ${input.changeId} ${readback.inFlightCount} time(s)`,
    );
  if (readback.archivedCount !== 1)
    failures.push(
      `archived list contains ${input.changeId} ${readback.archivedCount} time(s)`,
    );
  return failures.length > 0
    ? { ok: false, error: failures.join("; "), readback }
    : { ok: true, readback };
}

export async function loadSpecsMap(store: Store): Promise<Map<string, Spec>> {
  const specList = await store.specs.list();
  const specs = new Map<string, Spec>();
  for (const specInfo of specList.specs) {
    const result = await store.specs.get(specInfo.name);
    if (result.success && result.data) specs.set(specInfo.name, result.data);
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
  const updated = await store.changes.get(changeId);
  const history =
    updated.success && updated.data ? (updated.data.reentry_history ?? []) : [];
  const latest = history[history.length - 1];
  let contextSnapshot: string | undefined;
  if (updated.success && updated.data) {
    const { content: proposalText } = await loadProposalForContext(
      store,
      changeId,
      updated.data.title,
    );
    const directive = deriveDirectiveSafe(
      {
        ...updated.data,
        projectId: updated.data.adv_project_id ?? "unknown",
        gates: gates ?? updated.data.gates,
      } as never,
      Date.now(),
    );
    contextSnapshot = buildChangeContextSnapshot({
      change: updated.data,
      proposalText,
      gates: gates ?? undefined,
      workdir: store.paths.root,
      directive,
    });
  }
  const output: Record<string, unknown> = {
    success: true,
    message: `Re-entry from ${fromGate}: gates reset to pending. ${latest?.gates_reset?.length ?? 0} gate(s) reopened.`,
    gates,
    reentry: latest,
  };
  if (contextSnapshot && includeSnapshot)
    output._contextSnapshot = contextSnapshot;
  return formatToolOutput(output);
}

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
  if (
    !issueNumber ||
    issueNumber <= 0 ||
    !originKind ||
    !new Set(["roadmap", "triage"]).has(originKind)
  )
    return { issue_closed: [] };
  if (noCloseIssue) return { close_eligible: true, issue_closed: [] };
  if (dryRun) return { close_eligible: true, issue_closed: [], dryRun: true };
  const config = await readGitHubProjectConfig(
    store.paths.root,
    store.paths.external ?? null,
  );
  const cwd = worktreePath ?? store.paths.root;
  let repoFlag: string | undefined;
  if (config?.owner && config.repository_filter) {
    const configRepo = `${config.owner}/${config.repository_filter}`;
    try {
      const parsed = parseGitRemoteUrl(
        (await execGit(["remote", "get-url", "origin"], cwd)).trim(),
      );
      if (!parsed || `${parsed.owner}/${parsed.name}` !== configRepo)
        repoFlag = configRepo;
    } catch {
      repoFlag = configRepo;
    }
  }
  let shortSha = "unknown";
  try {
    shortSha = (await execGit(["rev-parse", "--short", "HEAD"], cwd)).trim();
  } catch {
    /* diagnostic only */
  }
  if (!existingBundlePath) {
    const commentArgs = [
      "issue",
      "comment",
      String(issueNumber),
      "--body",
      `Shipped via ${change.id} (${shortSha})`,
    ];
    if (repoFlag) commentArgs.push("--repo", repoFlag);
    await execGh(commentArgs, cwd);
  }
  const closeArgs = [
    "issue",
    "close",
    String(issueNumber),
    "--reason",
    "completed",
  ];
  if (repoFlag) closeArgs.push("--repo", repoFlag);
  const result = await execGh(closeArgs, cwd);
  if (result.ghNotFound) return { close_eligible: true, issue_closed: [] };
  if (result.exitCode !== 0)
    return {
      issue_closed: [],
      issue_closure_error: {
        issue_number: issueNumber,
        exitCode: result.exitCode,
        stderr: result.stderr,
        manualCommand: `gh issue close ${issueNumber} --reason completed${repoFlag ? ` --repo ${repoFlag}` : ""}`,
      },
    };
  return { close_eligible: true, issue_closed: [issueNumber] };
}

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
