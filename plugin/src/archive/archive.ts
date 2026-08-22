/**
 * Archive Orchestrator
 *
 * Main entry point for archiving changes.
 * Coordinates delta application, spec updates, and doc generation.
 */

import { join, dirname } from "path";
import { readdir, mkdir } from "fs/promises";
import { atomicWriteFile, syncDir } from "../utils/fs";
import { ChangeSchema, SpecSchema, type Spec, type Change } from "../types";
import {
  buildTerminalArchiveSummary,
  serializeTerminalArchiveSummary,
  sha256HexString,
  TERMINAL_SUMMARY_FILE,
  validateTerminalArchiveSummary,
} from "./terminal-summary";
import type {
  ArchiveContext,
  ArchiveOperationResult,
  SpecUpdateResult,
} from "./types";
import { generateSpecDoc, generateSpecDocFile } from "./docs";
import { SPEC_SCHEMA_URL } from "../schema-registry";
import {
  SpecProjectionManifestSchema,
  canonicalSha256,
  planSpecProjection,
  requirementSha256,
  specSha256,
  type SpecProjectionManifest,
} from "./projection";
import { withArchiveProjectionLock } from "./projection-lock";
import { readBoundedProjectionDocument } from "../storage/change-projection-reader";
import { ARTIFACT_FILENAME, ArtifactKindSchema } from "../types/artifacts";
import {
  addProjectWisdom,
  listProjectWisdom,
  compactProjectWisdom,
} from "../storage/project-wisdom";
import { execGit, getDefaultBranch } from "../utils/git";
import { renderBriefingPacket } from "../utils/briefing-packet-renderer";
import { classifyBriefingFacts } from "../utils/briefing-fact-classifier";
import type { BriefingFact } from "../types";
import { GATE_ORDER, createDefaultGates } from "../types";
import type {
  MultiRepoArchiveMetadata,
  MultiRepoArchiveRepoMetadata,
} from "./types";

/**
 * Serialize an archive-bundle JSON artifact with exactly one trailing newline.
 *
 * Bundle JSON artifacts (`change.json`, `wisdom.json`, `multi-repo-archive.json`)
 * MUST end with a single `\n` so archive EOF is whitespace-clean (SC2/AC3).
 * The newline is owned HERE at the serialization boundary — never by
 * `atomicWriteFile`, which writes content verbatim (C2). `JSON.stringify`
 * never emits a trailing newline, so appending one always yields exactly one.
 */
export function bundleJsonStringify(value: unknown): string {
  const serialized = JSON.stringify(value, null, 2);
  if (serialized === undefined) {
    throw new TypeError("Archive bundle JSON value must be JSON-serializable");
  }
  return `${serialized}\n`;
}

function archiveBundlePath(archiveDir: string, changeId: string): string {
  return join(
    archiveDir,
    `${new Date().toISOString().split("T")[0]}-${changeId}`,
  );
}

async function archiveBundlePathForWrite(
  archiveDir: string,
  changeId: string,
): Promise<string> {
  const existing = await findArchiveBundle(archiveDir, changeId);
  if (existing) {
    return existing;
  }
  const bundlePath = archiveBundlePath(archiveDir, changeId);
  await mkdir(bundlePath, { recursive: true });
  // Durability: fsync the parent directory so the new bundle directory entry
  // is crash-recoverable before any files are written inside it.
  await syncDir(archiveDir);
  return bundlePath;
}

export interface ArchiveBundleWriteResult {
  terminalSummaryDegradation?: {
    reason: string;
    fallback: "legacy_change_json";
  };
}

async function readArchiveBundleArchivedAt(
  changeId: string,
  archivePath: string,
): Promise<string> {
  const summaryRead = await readBoundedProjectionDocument(
    join(archivePath, TERMINAL_SUMMARY_FILE),
  );
  if (summaryRead.kind !== "ok") {
    throw new Error(
      `Cannot preserve archive timestamp for ${changeId}: terminal summary is ${summaryRead.kind}.`,
    );
  }
  const summary = validateTerminalArchiveSummary(
    JSON.parse(summaryRead.content),
  );
  if (summary.change_id !== changeId) {
    throw new Error(
      `Archive bundle identity mismatch: expected ${changeId}, got ${summary.change_id}.`,
    );
  }
  return summary.archived_at;
}

/**
 * Write the generated archive bundle artifacts for a change.
 *
 * This is the single source of truth for the files that are produced from
 * workflow state (change.json, terminal summary, digest, traceability, etc.).
 * Sibling copy loops elsewhere skip GENERATED_BUNDLE_FILES so that hand-written
 * or legacy source files never clobber generated ones.
 */
async function writeArchiveBundleFiles(
  change: Change,
  archivePath: string,
  multiRepo: MultiRepoArchiveMetadata | undefined,
  archivedAt: string,
  projectionManifest?: SpecProjectionManifest,
): Promise<ArchiveBundleWriteResult> {
  const archivedChange: Change = { ...change, status: "archived" };

  // Sentinel: change.json is the durable archive authority and is written first.
  const changeJson = bundleJsonStringify(archivedChange);
  await atomicWriteFile(join(archivePath, "change.json"), changeJson);
  const changeHash = sha256HexString(changeJson);
  if (projectionManifest) {
    await atomicWriteFile(
      join(archivePath, "spec-projection.json"),
      bundleJsonStringify(
        SpecProjectionManifestSchema.parse(projectionManifest),
      ),
    );
  }

  // Terminal summary is derived from the validated archived Change and bound to
  // the exact change.json bytes via changeHash. Summary failure does NOT
  // invalidate the archived change.json authority; it yields typed
  // terminal-summary degradation and a legacy change.json fallback.
  const validatedChange = ChangeSchema.parse(archivedChange);
  const terminalSummary = buildTerminalArchiveSummary({
    change: validatedChange,
    archivedAt,
    changeHash,
  });
  try {
    await atomicWriteFile(
      join(archivePath, TERMINAL_SUMMARY_FILE),
      serializeTerminalArchiveSummary(terminalSummary),
    );
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      terminalSummaryDegradation: {
        reason: `Terminal summary write failed: ${reason}`,
        fallback: "legacy_change_json",
      },
    };
  }

  // Human-readable archive summary.
  const summary = generateArchiveSummary(change, archivedAt);
  await atomicWriteFile(join(archivePath, "ARCHIVE_SUMMARY.md"), summary);

  // Archive-lane briefing digest (idempotent overwrite).
  const digest = generateBriefingDigest(change);
  await atomicWriteFile(join(archivePath, BRIEFING_DIGEST_FILE), digest);

  // Contract traceability, when present.
  const traceability = generateContractTraceability(change);
  if (traceability) {
    await atomicWriteFile(
      join(archivePath, "CONTRACT_TRACEABILITY.md"),
      traceability,
    );
  }

  // Wisdom sidecar, when present.
  if (change.wisdom && change.wisdom.length > 0) {
    await atomicWriteFile(
      join(archivePath, "wisdom.json"),
      bundleJsonStringify({
        entries: change.wisdom,
        count: change.wisdom.length,
      }),
    );
  }

  // Multi-repo archive metadata, when present.
  if (multiRepo) {
    await atomicWriteFile(
      join(archivePath, "multi-repo-archive.json"),
      bundleJsonStringify(multiRepo),
    );
  }

  // KD1 (AC8): writeArchiveBundleFiles is the sole projection-sourced
  // production point for the six narrative artifacts from change.documents.
  // The sourceChangeDir copies in callers only fill kinds absent from the
  // projection (legacy pre-cutover changes). This makes the archive
  // reproducible from the projection and prevents stale active-dir .md from
  // overwriting current content for transitional changes (#403).
  for (const kind of ArtifactKindSchema.options) {
    const content = change.documents?.[kind];
    if (typeof content === "string" && content.length > 0) {
      await atomicWriteFile(
        join(archivePath, ARTIFACT_FILENAME[kind]),
        content,
      );
    }
  }

  return {};
}

/**
 * Regenerate projection-derived files for an existing archive bundle.
 *
 * Caller holds the archive projection lock. When no timestamp is supplied, the
 * existing terminal summary supplies the archive timestamp so reconciliation
 * cannot make the bundle appear newly archived.
 */
export async function refreshArchiveBundleProjectionUnderLock(input: {
  change: Change;
  archivePath: string;
  archivedAt?: string;
}): Promise<ArchiveBundleWriteResult> {
  const archivedAt =
    input.archivedAt ??
    (await readArchiveBundleArchivedAt(input.change.id, input.archivePath));

  const result = await writeArchiveBundleFiles(
    input.change,
    input.archivePath,
    undefined,
    archivedAt,
  );
  await syncDir(input.archivePath);
  return result;
}

function sortedScopeRepos(change: Change): NonNullable<Change["scope_repos"]> {
  return [...(change.scope_repos ?? [])].sort((a, b) => {
    const aOrder = a.merge_order ?? Number.MAX_SAFE_INTEGER;
    const bOrder = b.merge_order ?? Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.repo_id.localeCompare(b.repo_id);
  });
}

const BRIEFING_DIGEST_FILE = "BRIEFING_DIGEST.md";

const GENERATED_BUNDLE_FILES = new Set([
  "change.json",
  TERMINAL_SUMMARY_FILE,
  "ARCHIVE_SUMMARY.md",
  "BRIEFING_DIGEST.md",
  "CONTRACT_TRACEABILITY.md",
  "wisdom.json",
  "multi-repo-archive.json",
  "spec-projection.json",
]);

/**
 * Narrative-artifact filenames present in the projection. The sourceChangeDir
 * legacy copy skips these so it cannot overwrite projection-sourced bundle
 * content with stale active-dir .md (transitional-change hazard, #403).
 */
function projectionArtifactFilenames(change: Change): Set<string> {
  return new Set(
    ArtifactKindSchema.options
      .filter(
        (k) =>
          typeof change.documents?.[k] === "string" &&
          change.documents[k]!.length > 0,
      )
      .map((k) => ARTIFACT_FILENAME[k]),
  );
}

function buildTerminalGateSummary(change: Change): Record<string, string> {
  const gates = change.gates ?? createDefaultGates();
  const summary: Record<string, string> = {};
  for (const gateId of GATE_ORDER) {
    summary[gateId] = gates[gateId]?.status ?? "pending";
  }
  return summary;
}

function collectArchiveBriefingFacts(change: Change): BriefingFact[] {
  const facts: BriefingFact[] = [];
  const seenIds = new Set<string>();

  const pushUnique = (fact: BriefingFact): void => {
    if (seenIds.has(fact.id)) return;
    seenIds.add(fact.id);
    facts.push(fact);
  };

  for (const task of change.tasks ?? []) {
    for (const report of task.subagent_reports ?? []) {
      for (const fact of classifyBriefingFacts({ report })) {
        pushUnique(fact);
      }
    }
  }

  for (const report of change.subagent_reports ?? []) {
    for (const fact of classifyBriefingFacts({ report })) {
      pushUnique(fact);
    }
  }

  if (change.epic_membership) {
    pushUnique({
      id: `epic.membership:${change.epic_membership.epic_id}`,
      outcome: "epic_terminal_note",
      source_label: "epic.membership",
      content: `${change.epic_membership.epic_id} · ${change.epic_membership.title} (order ${change.epic_membership.order})`,
      dispositioned: false,
    });
  }

  return facts;
}

function renderBriefingDigestMarkdown(
  packet: ReturnType<typeof renderBriefingPacket>,
  change: Change,
): string {
  const lines: string[] = [];

  lines.push("# Archive Briefing Digest");
  lines.push("");
  lines.push(`**Change ID:** ${packet.change_id}`);
  lines.push(`**Title:** ${change.title}`);
  lines.push(
    `**Status:** ${packet.lane === "archive" ? "archived" : packet.lane}`,
  );
  lines.push(
    `**Generated:** ${packet.generated_at ?? new Date().toISOString()}`,
  );
  lines.push("");

  for (const section of packet.sections) {
    const title = section.kind
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    lines.push(`## ${title}`);
    lines.push("");

    if (section.kind === "identity_anchors") {
      const content = section.content as {
        anchors?: string[];
        origin?: unknown;
      };
      for (const anchor of content.anchors ?? []) {
        lines.push(`- ${anchor}`);
      }
      if (content.origin && typeof content.origin === "object") {
        const origin = content.origin as {
          kind?: string;
          issue_number?: number;
        };
        if (origin.kind) {
          lines.push(
            `- Origin: ${origin.kind}${origin.issue_number ? ` #${origin.issue_number}` : ""}`,
          );
        }
      }
    } else if (section.kind === "archive_digest") {
      const content = section.content as {
        status?: string;
        terminal_gate_summary?: Record<string, string>;
      };
      lines.push(`**Status:** ${content.status ?? "unknown"}`);
      lines.push("");
      lines.push("| Gate | Status |");
      lines.push("| --- | --- |");
      for (const [gate, status] of Object.entries(
        content.terminal_gate_summary ?? {},
      )) {
        lines.push(`| ${gate} | ${status} |`);
      }
    } else if (section.kind === "epic_context") {
      const content = section.content as {
        present: boolean;
        epic_id?: string;
        title?: string;
        order?: number;
        summary?: string;
      };
      if (content.present && content.epic_id) {
        lines.push(
          `Epic: ${content.epic_id} · ${content.title} (order ${content.order})`,
        );
      } else {
        lines.push(content.summary ?? "No Epic membership");
      }
    } else if (section.kind === "durable_facts") {
      const content = section.content as {
        total?: number;
        included?: number;
        omitted?: number;
        facts?: BriefingFact[];
      };
      if (content.total !== undefined && content.included !== undefined) {
        lines.push(
          `Showing ${content.included} of ${content.total} durable facts${content.omitted ? ` (${content.omitted} omitted)` : ""}.`,
        );
        lines.push("");
      }
      for (const fact of content.facts ?? []) {
        lines.push(
          `- **[${fact.outcome}]** ${fact.source_label}: ${fact.content}`,
        );
      }
    } else if (section.kind === "unavailable_state") {
      const content = section.content as {
        missing?: Array<{ label: string; reason: string }>;
      };
      if (content.missing && content.missing.length > 0) {
        for (const item of content.missing) {
          lines.push(`- ${item.label}: ${item.reason}`);
        }
      } else {
        lines.push("None");
      }
    } else {
      lines.push("```json");
      lines.push(JSON.stringify(section.content, null, 2));
      lines.push("```");
    }

    lines.push("");
  }

  // Contract / AC coverage summary is rendered separately because the archive
  // lane intentionally excludes transient live slices (scope, contract, tasks).
  const contract = change.contract;
  lines.push("## Contract / AC Coverage");
  lines.push("");
  if (contract && contract.items.length > 0) {
    const rowsById = new Map(
      contract.reviewMatrix?.rows.map((row) => [row.contractId, row]) ?? [],
    );
    lines.push("| ID | Kind | Status |");
    lines.push("| --- | --- | --- |");
    for (const item of contract.items) {
      const row = rowsById.get(item.id);
      lines.push(`| ${item.id} | ${item.kind} | ${row?.status ?? "missing"} |`);
    }
  } else {
    lines.push("No contract items.");
  }
  lines.push("");

  // Unresolved actions are rendered explicitly so the digest always reports
  // "none" when no actions remain — satisfying the archive digest contract.
  const unresolvedActions = packet.facts.filter(
    (f) => f.outcome === "unresolved_action",
  );
  lines.push("## Unresolved Actions");
  lines.push("");
  if (unresolvedActions.length > 0) {
    for (const action of unresolvedActions) {
      lines.push(`- ${action.content}`);
    }
  } else {
    lines.push("None");
  }
  lines.push("");

  return lines.join("\n");
}

export function generateBriefingDigest(change: Change): string {
  const facts = collectArchiveBriefingFacts(change);
  const durableFacts = facts.filter(
    (f) => f.outcome !== "transient_prompt_context",
  );

  const packet = renderBriefingPacket({
    change_id: change.id,
    title: change.title,
    lane: "archive",
    origin: change.origin
      ? {
          kind: change.origin.kind,
          issue_number: change.origin.issue_number,
          source_artifact: change.origin.source_artifact,
        }
      : undefined,
    epic_membership: change.epic_membership
      ? {
          epic_id: change.epic_membership.epic_id,
          entry_id: change.epic_membership.entry_id,
          title: change.epic_membership.title,
          order: change.epic_membership.order,
          linked_at: change.epic_membership.linked_at,
        }
      : null,
    durable_facts: durableFacts,
    archive_digest: {
      status: "archived",
      terminal_gate_summary: buildTerminalGateSummary(change),
    },
    unavailable: [],
    generated_at: new Date().toISOString(),
  });

  return renderBriefingDigestMarkdown(packet, change);
}

function collectVerificationEvidence(
  change: Change,
): MultiRepoArchiveMetadata["verification_evidence"] {
  return change.tasks
    .filter((task) => task.status === "done" && task.verification)
    .map((task) => ({
      task_id: task.id,
      verification: task.verification as string,
    }));
}

async function gitTrim(args: string[], cwd: string): Promise<string> {
  return (await execGit(args, cwd)).trim();
}

async function revParseOptional(
  repoPath: string,
  ref: string,
): Promise<string | undefined> {
  try {
    return await gitTrim(["rev-parse", ref], repoPath);
  } catch {
    return undefined;
  }
}

async function resolveDefaultBranchRef(
  repoPath: string,
): Promise<{ branch: string; head?: string }> {
  const configured = await getDefaultBranch(repoPath);
  const candidates = [...new Set([configured, "main", "master"])]
    .map((candidate) => candidate.trim())
    .filter(Boolean);

  for (const candidate of candidates) {
    const head =
      (await revParseOptional(repoPath, candidate)) ??
      (await revParseOptional(repoPath, `origin/${candidate}`));
    if (head) return { branch: candidate, head };
  }

  return { branch: configured };
}

async function collectRepoArchiveMetadata(
  repo: NonNullable<Change["scope_repos"]>[number],
): Promise<MultiRepoArchiveRepoMetadata> {
  if (!repo.path) {
    throw new Error(`scope_repos entry ${repo.repo_id} is missing path`);
  }

  const branch = await gitTrim(["branch", "--show-current"], repo.path);
  const headBefore = await gitTrim(["rev-parse", "HEAD"], repo.path);
  const defaultRef = await resolveDefaultBranchRef(repo.path);
  const defaultBranch = defaultRef.branch;
  const defaultHead = defaultRef.head;

  let passed = false;
  let error: string | undefined;
  const command = defaultHead
    ? `git merge-base --is-ancestor ${defaultHead} ${headBefore}`
    : `git rev-parse ${defaultBranch}`;

  if (!defaultHead) {
    error = `default branch ref ${defaultBranch} could not be resolved`;
  } else {
    try {
      await execGit(
        ["merge-base", "--is-ancestor", defaultHead, headBefore],
        repo.path,
      );
      passed = true;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  const headAfter = await gitTrim(["rev-parse", "HEAD"], repo.path);

  return {
    repo_id: repo.repo_id,
    role: repo.role,
    path: repo.path,
    repo_project_id: repo.repo_project_id,
    required: repo.required ?? true,
    merge_order: repo.merge_order,
    branch,
    default_branch: defaultBranch,
    default_head: defaultHead,
    head_before: headBefore,
    head_after: headAfter,
    ff_only_preflight: {
      passed,
      command,
      ...(error ? { error } : {}),
    },
  };
}

async function collectMultiRepoArchiveMetadata(
  change: Change,
  productId?: string,
): Promise<{ metadata?: MultiRepoArchiveMetadata; errors: string[] }> {
  const repos = sortedScopeRepos(change);
  if (repos.length === 0) return { errors: [] };

  const metadata: MultiRepoArchiveMetadata = {
    product_id: productId,
    collected_at: new Date().toISOString(),
    repos: [],
    verification_evidence: collectVerificationEvidence(change),
  };
  const errors: string[] = [];

  for (const repo of repos) {
    try {
      const repoMetadata = await collectRepoArchiveMetadata(repo);
      metadata.repos.push(repoMetadata);
      if ((repo.required ?? true) && !repoMetadata.ff_only_preflight.passed) {
        errors.push(
          `Repo ${repo.repo_id} ff-only preflight failed: ${repoMetadata.ff_only_preflight.error ?? "unknown error"}`,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`Repo ${repo.repo_id} archive metadata failed: ${message}`);
    }
  }

  return { metadata, errors };
}

function contractTaskRefs(task: Change["tasks"][number]): string[] {
  const refs = task.contract_refs;
  if (!refs) return [];
  return [
    ...(refs.implements ?? []),
    ...(refs.verifies ?? []),
    ...(refs.respects ?? []),
  ];
}

function isRequiredContractItem(
  item: NonNullable<Change["contract"]>["items"][number],
): boolean {
  return (
    item.verificationRequired !== false &&
    item.status !== "waived" &&
    item.status !== "superseded"
  );
}

function hasAmendmentAudit(change: Change, contractId: string): boolean {
  return (
    change.contract?.amendments.some(
      (amendment) =>
        amendment.affectedIds.includes(contractId) &&
        amendment.reason.trim().length > 0 &&
        (amendment.approvalEvidence?.trim().length ?? 0) > 0,
    ) ?? false
  );
}

function matrixPredatesInvalidatingAmendment(change: Change): boolean {
  const contract = change.contract;
  if (!contract?.reviewMatrix) return false;
  const reviewedAt = Date.parse(contract.reviewMatrix.reviewedAt);
  if (Number.isNaN(reviewedAt)) return false;
  return contract.amendments.some((amendment) => {
    if (amendment.invalidatesReviewMatrix === false) return false;
    const amendedAt = Date.parse(amendment.amendedAt);
    return !Number.isNaN(amendedAt) && amendedAt > reviewedAt;
  });
}

export function getArchiveContractProofErrors(change: Change): string[] {
  const contract = change.contract;
  if (!contract) return [];

  const errors: string[] = [];
  const contractIds = new Set(contract.items.map((item) => item.id));
  const requiredItems = contract.items.filter(isRequiredContractItem);

  for (const task of change.tasks) {
    for (const ref of contractTaskRefs(task)) {
      if (!contractIds.has(ref)) {
        errors.push(
          `Contract task ref unknown: task ${task.id} references ${ref}`,
        );
      }
    }
  }

  for (const item of contract.items) {
    if (["amended", "waived", "superseded"].includes(item.status)) {
      if (!hasAmendmentAudit(change, item.id)) {
        errors.push(`Contract amendment audit missing: ${item.id}`);
      }
    }
  }

  if (requiredItems.length > 0 && !contract.reviewMatrix) {
    errors.push(
      "Contract proof missing: change has required contract items but no review matrix",
    );
    return errors;
  }

  if (matrixPredatesInvalidatingAmendment(change)) {
    errors.push(
      "Contract proof stale: review matrix predates a substantive contract amendment",
    );
  }

  const rowsById = new Map(
    contract.reviewMatrix?.rows.map((row) => [row.contractId, row]) ?? [],
  );

  for (const row of contract.reviewMatrix?.rows ?? []) {
    if (!contractIds.has(row.contractId)) {
      errors.push(`Contract review ref unknown: ${row.contractId}`);
    }
  }

  for (const item of requiredItems) {
    const row = rowsById.get(item.id);
    if (!row) {
      errors.push(`Contract proof missing: ${item.id} has no review row`);
      continue;
    }
    if (["fail", "violated", "unknown"].includes(row.status)) {
      errors.push(
        `Contract proof unresolved: ${item.id} has status "${row.status}"`,
      );
    }
    if (
      row.status === "not_applicable" &&
      row.evidence.trim().length === 0 &&
      (row.notes?.trim().length ?? 0) === 0
    ) {
      errors.push(`Contract proof rationale missing: ${item.id}`);
    }
  }

  return errors;
}

export function generateContractTraceability(change: Change): string | null {
  const contract = change.contract;
  if (!contract) return null;

  const rowsById = new Map(
    contract.reviewMatrix?.rows.map((row) => [row.contractId, row]) ?? [],
  );
  const lines: string[] = [];

  lines.push("# Contract Traceability");
  lines.push("");
  lines.push(`**Change ID:** ${change.id}`);
  lines.push(`**Contract Version:** ${contract.version}`);
  lines.push(`**Rigor:** ${contract.rigor}`);
  lines.push(
    `**Reviewed:** ${contract.reviewMatrix?.reviewedAt ?? "not reviewed"}`,
  );
  lines.push("");
  lines.push("## Contract Items");
  lines.push("");
  lines.push("| ID | Kind | Status | Evidence Policy | Evidence |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const item of contract.items) {
    const row = rowsById.get(item.id);
    lines.push(
      `| ${item.id} | ${item.kind} | ${row?.status ?? "missing"} | ${item.evidencePolicy} | ${row?.evidence ?? ""} |`,
    );
  }
  lines.push("");
  lines.push("## Task References");
  lines.push("");
  lines.push("| Task | Implements | Verifies | Respects | N/A Reason |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const task of change.tasks) {
    const refs = task.contract_refs;
    lines.push(
      `| ${task.id} | ${refs?.implements?.join(", ") ?? ""} | ${refs?.verifies?.join(", ") ?? ""} | ${refs?.respects?.join(", ") ?? ""} | ${refs?.not_applicable_reason ?? ""} |`,
    );
  }
  lines.push("");
  if (contract.amendments.length > 0) {
    lines.push("## Amendments");
    lines.push("");
    for (const amendment of contract.amendments) {
      lines.push(
        `- **${amendment.id}** (${amendment.amendedAt}) — ${amendment.reason}`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Archive a change - applies deltas to specs and generates documentation.
 */
function emptySpecForProjection(capability: string, projectedAt: string): Spec {
  const title = capability
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return {
    $schema: SPEC_SCHEMA_URL,
    name: capability,
    title,
    purpose: `Capability: ${title}`,
    version: "0.0.0",
    updated_at: projectedAt,
    requirements: [],
  };
}

function projectionUpdateResult(
  capability: string,
  originalVersion: string,
  newVersion: string,
  dispositions: ReturnType<typeof planSpecProjection>["dispositions"],
  updatedSpec?: Spec,
): SpecUpdateResult {
  return {
    capability,
    originalVersion,
    newVersion,
    deltaResults: dispositions.map((row) => ({
      success: row.status === "missing" || row.status === "identical",
      deltaId: row.deltaId,
      operation: row.operation,
      targetId: row.targetId,
      ...(row.operation === "add" && row.targetId
        ? { newId: row.targetId }
        : {}),
      ...(row.status === "conflicting" || row.status === "unverified"
        ? { error: `${row.status}: ${row.reason ?? "projection proof failed"}` }
        : {}),
    })),
    ...(updatedSpec ? { updatedSpec } : {}),
  };
}

async function archiveChangeUnderLock(
  context: ArchiveContext,
): Promise<ArchiveOperationResult> {
  const { change, specs, paths, dryRun = false } = context;
  const errors: string[] = [];
  const specsUpdated: SpecUpdateResult[] = [];
  const docsGenerated: string[] = [];
  const commitPaths: string[] = [];
  const targetArchivePath =
    context.reuseExistingBundlePath ??
    archiveBundlePath(paths.archive, change.id);
  let archivedAt: string;
  if (context.reuseExistingBundlePath) {
    try {
      archivedAt = await readArchiveBundleArchivedAt(
        change.id,
        context.reuseExistingBundlePath,
      );
    } catch (error) {
      return {
        success: false,
        changeId: change.id,
        specsUpdated,
        docsGenerated,
        commitPaths,
        archivePath: targetArchivePath,
        errors: [error instanceof Error ? error.message : String(error)],
        requirement: "rq-archiveTerminalDurability01.1",
        archivedAt: "",
      };
    }
  } else {
    archivedAt = new Date().toISOString();
  }

  const contractProofErrors = getArchiveContractProofErrors(change);
  if (contractProofErrors.length > 0) {
    return {
      success: false,
      changeId: change.id,
      specsUpdated,
      docsGenerated,
      commitPaths,
      archivePath: targetArchivePath,
      errors: contractProofErrors,
      archivedAt,
    };
  }

  const multiRepo = await collectMultiRepoArchiveMetadata(
    change,
    context.productId,
  );
  if (multiRepo.errors.length > 0) {
    return {
      success: false,
      changeId: change.id,
      specsUpdated,
      docsGenerated,
      commitPaths,
      archivePath: targetArchivePath,
      errors: multiRepo.errors,
      archivedAt,
      ...(multiRepo.metadata ? { multiRepo: multiRepo.metadata } : {}),
    };
  }

  const planned: Array<{
    capability: string;
    targetSpec: Spec;
    result: SpecUpdateResult;
    dispositions: ReturnType<typeof planSpecProjection>["dispositions"];
  }> = [];

  // Semantic preflight is whole-change: no spec, doc, or bundle write occurs
  // until every affected capability has a safe target projection.
  for (const [capability, deltas] of Object.entries(change.deltas)) {
    if (deltas.length === 0) continue;
    const existing = specs.get(capability);
    const base = existing
      ? structuredClone(existing)
      : emptySpecForProjection(capability, archivedAt);
    const plan = planSpecProjection({
      spec: base,
      deltas,
      authority: { kind: "current" },
      projectedAt: archivedAt,
    });
    if (!existing && plan.status === "safe" && plan.targetSpec) {
      plan.targetSpec.version = "1.0.0";
      plan.targetVersion = "1.0.0";
    }
    const result = projectionUpdateResult(
      capability,
      base.version,
      plan.targetVersion,
      plan.dispositions,
      plan.targetSpec,
    );
    specsUpdated.push(result);
    if (plan.status === "blocked" || !plan.targetSpec) {
      const blockedRows = plan.dispositions
        .filter(
          (row) => row.status === "conflicting" || row.status === "unverified",
        )
        .map(
          (row) =>
            `${row.deltaId}=${row.status}${row.reason ? ` (${row.reason})` : ""}`,
        );
      errors.push(
        `Failed to reconcile deltas for ${capability}: ${blockedRows.join(", ")}`,
      );
      continue;
    }
    planned.push({
      capability,
      targetSpec: plan.targetSpec,
      result,
      dispositions: plan.dispositions,
    });
  }

  if (errors.length > 0) {
    return {
      success: false,
      changeId: change.id,
      specsUpdated,
      docsGenerated,
      commitPaths,
      archivePath: targetArchivePath,
      errors,
      archivedAt,
      ...(multiRepo.metadata ? { multiRepo: multiRepo.metadata } : {}),
    };
  }

  const capabilityManifests: SpecProjectionManifest["capabilities"] = [];
  for (const projection of planned) {
    const specPath = join(paths.specs, projection.capability, "spec.json");
    const docPath = join(paths.docs, `${projection.capability}.md`);
    let docContent: string;

    if (!dryRun) {
      try {
        await writeSpecToDisk(projection.targetSpec, paths.specs);
        const boundedSpec = await readBoundedProjectionDocument(specPath);
        if (boundedSpec.kind !== "ok") {
          throw new Error(
            `spec readback failed: ${boundedSpec.kind}${boundedSpec.kind === "oversized" ? ` (${boundedSpec.actual} > ${boundedSpec.limit} bytes)` : ""}`,
          );
        }
        const readback = SpecSchema.parse(JSON.parse(boundedSpec.content));
        if (specSha256(readback) !== specSha256(projection.targetSpec)) {
          throw new Error("spec readback digest mismatch");
        }
        specs.set(projection.capability, readback);
        commitPaths.push(specPath);
      } catch (err) {
        errors.push(`Failed to write spec ${projection.capability}: ${err}`);
        continue;
      }

      try {
        const doc = await generateSpecDocFile(
          projection.targetSpec,
          paths.docs,
        );
        docContent = doc.content;
        const boundedDoc = await readBoundedProjectionDocument(doc.filePath);
        if (boundedDoc.kind !== "ok") {
          throw new Error(
            `generated doc readback failed: ${boundedDoc.kind}${boundedDoc.kind === "oversized" ? ` (${boundedDoc.actual} > ${boundedDoc.limit} bytes)` : ""}`,
          );
        }
        if (
          canonicalSha256(boundedDoc.content) !== canonicalSha256(doc.content)
        ) {
          throw new Error("generated doc readback digest mismatch");
        }
        docsGenerated.push(doc.filePath);
        commitPaths.push(doc.filePath);
      } catch (err) {
        errors.push(
          `Failed to generate docs for ${projection.capability}: ${err}`,
        );
        continue;
      }
    } else {
      docContent = generateSpecDoc(projection.targetSpec);
      docsGenerated.push(docPath);
      commitPaths.push(specPath, docPath);
    }

    capabilityManifests.push({
      capability: projection.capability,
      base_version: projection.result.originalVersion,
      target_version: projection.result.newVersion,
      spec_sha256: specSha256(projection.targetSpec),
      document_sha256: canonicalSha256(docContent),
      requirement_sha256: Object.fromEntries(
        projection.targetSpec.requirements.map((requirement) => [
          requirement.id,
          requirementSha256(requirement),
        ]),
      ),
      dispositions: projection.dispositions,
    });
  }

  // A projection write/readback failure cannot create a durable bundle that a
  // later retry could mistake for complete archive work.
  if (errors.length > 0) {
    return {
      success: false,
      changeId: change.id,
      specsUpdated,
      docsGenerated,
      commitPaths,
      archivePath: targetArchivePath,
      errors,
      archivedAt,
      ...(multiRepo.metadata ? { multiRepo: multiRepo.metadata } : {}),
    };
  }

  const projectionManifest = SpecProjectionManifestSchema.parse({
    schema_version: 1,
    change_id: change.id,
    delta_set_sha256: canonicalSha256(change.deltas),
    capabilities: capabilityManifests,
  });

  // Auto-promote convention/pattern wisdom to project level.
  let wisdomPromoted = 0;
  if (!dryRun && paths.wisdom && change.wisdom && change.wisdom.length > 0) {
    const promotableTypes = new Set(["convention", "pattern"]);
    const promotable = change.wisdom.filter((w) => promotableTypes.has(w.type));
    if (promotable.length > 0) {
      const projectDir = dirname(dirname(paths.wisdom));
      const existing = await listProjectWisdom(projectDir, {
        wisdomPath: paths.wisdom,
      });
      const existingContents = new Set(existing.map((entry) => entry.content));
      for (const entry of promotable) {
        if (existingContents.has(entry.content)) continue;
        try {
          await addProjectWisdom(projectDir, {
            type: entry.type,
            content: entry.content,
            sourceChange: change.id,
            sourceTask: entry.source_task,
            wisdomPath: paths.wisdom,
          });
          wisdomPromoted++;
        } catch (err) {
          errors.push(`Failed to promote wisdom "${entry.content}": ${err}`);
        }
      }
      if (wisdomPromoted > 0) {
        try {
          await compactProjectWisdom(projectDir, { wisdomPath: paths.wisdom });
        } catch (err) {
          errors.push(`Failed to compact project wisdom: ${err}`);
        }
      }
    }
  }

  const sourceChangeDir = paths.changes
    ? join(paths.changes, change.id)
    : undefined;
  const { path: archivePath, terminalSummaryDegradation } =
    context.reuseExistingBundlePath
      ? { path: context.reuseExistingBundlePath }
      : await createArchive(
          change,
          paths.archive,
          dryRun,
          sourceChangeDir,
          errors,
          multiRepo.metadata,
          archivedAt,
          projectionManifest,
        );
  if (context.reuseExistingBundlePath && projectionManifest && !dryRun) {
    await atomicWriteFile(
      join(archivePath, "spec-projection.json"),
      bundleJsonStringify(
        SpecProjectionManifestSchema.parse(projectionManifest),
      ),
    );
    await syncDir(archivePath);
  }

  if (paths.inRepoArchive) {
    if (!dryRun) {
      try {
        const inRepoPath = await createInRepoArchive(
          change,
          paths.inRepoArchive,
          sourceChangeDir,
          multiRepo.metadata,
          archivedAt,
          projectionManifest,
        );
        commitPaths.push(inRepoPath);
      } catch (err) {
        errors.push(`Failed to write in-repo archive bundle: ${err}`);
      }
    } else {
      commitPaths.push(archiveBundlePath(paths.inRepoArchive, change.id));
    }
  }

  return {
    success: errors.length === 0,
    changeId: change.id,
    specsUpdated,
    docsGenerated,
    commitPaths,
    projectionManifest,
    archivePath,
    errors,
    archivedAt,
    ...(multiRepo.metadata ? { multiRepo: multiRepo.metadata } : {}),
    ...(wisdomPromoted > 0 && { wisdomPromoted }),
    ...(terminalSummaryDegradation && { terminalSummaryDegradation }),
  };
}

export async function archiveChange(
  context: ArchiveContext,
): Promise<ArchiveOperationResult> {
  const worktree = dirname(dirname(context.paths.specs));
  return withArchiveProjectionLock(worktree, () =>
    archiveChangeUnderLock(context),
  );
}

/**
 * Write a spec to disk.
 */
async function writeSpecToDisk(spec: Spec, specsDir: string): Promise<void> {
  const specDir = join(specsDir, spec.name);
  const specPath = join(specDir, "spec.json");

  await atomicWriteFile(specPath, JSON.stringify(spec, null, 2));
}

/**
 * Create archive directory with change copy.
 */
async function createArchive(
  change: Change,
  archiveDir: string,
  dryRun: boolean,
  sourceChangeDir: string | undefined,
  errors: string[],
  multiRepo: MultiRepoArchiveMetadata | undefined,
  archivedAt: string,
  projectionManifest?: SpecProjectionManifest,
): Promise<{
  path: string;
  terminalSummaryDegradation?: {
    reason: string;
    fallback: "legacy_change_json";
  };
}> {
  const archivePath = dryRun
    ? archiveBundlePath(archiveDir, change.id)
    : await archiveBundlePathForWrite(archiveDir, change.id);

  let terminalSummaryDegradation:
    | { reason: string; fallback: "legacy_change_json" }
    | undefined;

  if (!dryRun) {
    const writeResult = await writeArchiveBundleFiles(
      change,
      archivePath,
      multiRepo,
      archivedAt,
      projectionManifest,
    );
    terminalSummaryDegradation = writeResult.terminalSummaryDegradation;

    // Copy sibling files from source change directory (proposal.md, problem-statement.md, etc.)
    if (sourceChangeDir) {
      const projectionArtifactFiles = projectionArtifactFilenames(change);
      try {
        const entries = await readdir(sourceChangeDir, { withFileTypes: true });
        for (const entry of entries) {
          // Skip generated bundle files (already written from validated state)
          // and narrative artifacts already written from the projection (KD1).
          if (
            GENERATED_BUNDLE_FILES.has(entry.name) ||
            !entry.isFile() ||
            projectionArtifactFiles.has(entry.name)
          )
            continue;
          try {
            const bounded = await readBoundedProjectionDocument(
              join(sourceChangeDir, entry.name),
            );
            if (bounded.kind !== "ok") {
              throw new Error(
                `artifact exceeds bounded projection limit: ${bounded.kind}${bounded.kind === "oversized" ? ` (${bounded.actual} > ${bounded.limit} bytes)` : ""}`,
              );
            }
            await atomicWriteFile(
              join(archivePath, entry.name),
              bounded.content,
            );
          } catch (err) {
            errors?.push(
              `Failed to copy change artifact ${entry.name}: ${err}`,
            );
          }
        }
      } catch {
        // Source directory may not exist for legacy changes — not an error
      }
    }
  }

  return { path: archivePath, terminalSummaryDegradation };
}

/**
 * Generate a summary markdown file for the archive.
 */
function generateArchiveSummary(change: Change, archivedAt: string): string {
  const lines: string[] = [];

  lines.push(`# Archive: ${change.title}`);
  lines.push("");
  lines.push(`**Change ID:** ${change.id}`);
  lines.push(`**Archived:** ${archivedAt}`);
  lines.push(`**Created:** ${change.created_at}`);
  if (change.created_by) {
    lines.push(`**Created By:** ${change.created_by}`);
  }
  lines.push("");

  lines.push("## Tasks Completed");
  lines.push("");

  for (const task of change.tasks) {
    const status =
      task.status === "done" ? "✅" : task.status === "cancelled" ? "⏭️" : "❓";
    lines.push(`- ${status} ${task.title}`);
    // Include implementation summary if present
    if (task.implementation_summary) {
      lines.push(`  > ${task.implementation_summary}`);
    }
  }
  lines.push("");

  lines.push("## Specs Modified");
  lines.push("");

  for (const capability of Object.keys(change.deltas)) {
    const deltaCount = change.deltas[capability].length;
    lines.push(`- **${capability}**: ${deltaCount} delta(s)`);
  }
  lines.push("");

  // Include wisdom summary if present
  if (change.wisdom && change.wisdom.length > 0) {
    lines.push("## Wisdom Accumulated");
    lines.push("");
    for (const entry of change.wisdom) {
      lines.push(`- **[${entry.type}]** ${entry.content}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Create an identical archive bundle inside the repository.
 * Writes the same files as createArchive() but to an in-repo path.
 * Failure is warning-only — the caller logs it but does not fail the archive.
 *
 * `archivedAt` is required: callers MUST resolve the authoritative timestamp
 * (from a sibling/source bundle's terminal summary, or from a real archive
 * dispatch). A silent `new Date()` fallback would silently re-stamp the
 * bundle's archive date on every reconcile, breaking cross-bundle identity
 * invariants (rq-fixReconcileArchivedAt).
 */
export async function createInRepoArchive(
  change: Change,
  inRepoArchiveDir: string,
  sourceChangeDir: string | undefined,
  multiRepo: MultiRepoArchiveMetadata | undefined,
  archivedAt: string,
  projectionManifest?: SpecProjectionManifest,
): Promise<string> {
  const archivePath = await archiveBundlePathForWrite(
    inRepoArchiveDir,
    change.id,
  );

  await writeArchiveBundleFiles(
    change,
    archivePath,
    multiRepo,
    archivedAt,
    projectionManifest,
  );

  // Copy sibling files from source change directory
  if (sourceChangeDir) {
    const projectionArtifactFiles = projectionArtifactFilenames(change);
    try {
      const entries = await readdir(sourceChangeDir, { withFileTypes: true });
      for (const entry of entries) {
        if (
          GENERATED_BUNDLE_FILES.has(entry.name) ||
          !entry.isFile() ||
          projectionArtifactFiles.has(entry.name)
        )
          continue;
        try {
          const bounded = await readBoundedProjectionDocument(
            join(sourceChangeDir, entry.name),
          );
          if (bounded.kind !== "ok") {
            throw new Error(
              `artifact exceeds bounded projection limit: ${bounded.kind}${bounded.kind === "oversized" ? ` (${bounded.actual} > ${bounded.limit} bytes)` : ""}`,
            );
          }
          await atomicWriteFile(join(archivePath, entry.name), bounded.content);
        } catch {
          // Non-fatal — sibling file copy failure is a warning
        }
      }
    } catch {
      // Source directory may not exist — not an error
    }
  }

  return archivePath;
}

/**
 * Reconcile in-repo archive after a previous attempt already wrote an external
 * archive bundle but skipped/failed before in-repo bundle creation.
 *
 * The in-repo bundle's archived_at MUST match the source bundle's terminal
 * summary — never the current wall-clock — so cross-bundle identity and
 * downstream tooling can rely on the original archive timestamp. If the
 * source bundle's terminal summary is missing or unreadable, this throws
 * (rq-fixReconcileArchivedAt): silently inventing a new timestamp would
 * make the in-repo bundle appear to be a freshly archived change.
 */
export async function reconcileInRepoArchive(
  change: Change,
  externalArchiveDir: string,
  inRepoArchiveDir: string,
  sourceChangeDir?: string,
  multiRepo?: MultiRepoArchiveMetadata,
): Promise<string> {
  const existing = await findArchiveBundle(inRepoArchiveDir, change.id);
  if (existing) {
    return existing;
  }

  const sourceBundle = await findArchiveBundle(externalArchiveDir, change.id);
  if (!sourceBundle) {
    throw new Error(
      `Cannot reconcile in-repo archive for ${change.id}: source archive bundle not found under ${externalArchiveDir}.`,
    );
  }
  return createInRepoArchive(
    change,
    inRepoArchiveDir,
    sourceChangeDir,
    multiRepo,
    await readArchiveBundleArchivedAt(change.id, sourceBundle),
  );
}

/**
 * Check whether an archive bundle already exists on disk for a given change.
 *
 * Bundles are written by createArchive() at `{archiveDir}/{date}-{changeId}/`.
 * Returns the path to the bundle when one exists with a readable
 * `change.json` manifest, otherwise null.
 *
 * If multiple bundles exist for the same change (e.g. partial retries on
 * different days), the lexically last one is returned — `YYYY-MM-DD-`
 * prefixes sort to the most recent bundle.
 */
export async function findArchiveBundle(
  archiveDir: string,
  changeId: string,
): Promise<string | null> {
  let entries: string[];
  try {
    entries = await readdir(archiveDir);
  } catch {
    return null;
  }

  const matches = entries
    .filter((name) => name.endsWith(`-${changeId}`))
    .sort((a, b) => a.localeCompare(b));

  for (let i = matches.length - 1; i >= 0; i--) {
    const candidate = join(archiveDir, matches[i]);
    try {
      const result = await readBoundedProjectionDocument(
        join(candidate, "change.json"),
      );
      if (result.kind === "ok") return candidate;
    } catch {
      // Manifest missing or unreadable — try next candidate.
    }
  }

  return null;
}

/**
 * Boolean variant of findArchiveBundle for callers that only need to know
 * whether a bundle exists.
 */
export async function archiveBundleExists(
  archiveDir: string,
  changeId: string,
): Promise<boolean> {
  const path = await findArchiveBundle(archiveDir, changeId);
  return path !== null;
}
