/**
 * Archive Orchestrator
 *
 * Main entry point for archiving changes.
 * Coordinates delta application, spec updates, and doc generation.
 */

import { join, dirname } from "path";
import { readdir, readFile } from "fs/promises";
import { atomicWriteFile } from "../utils/fs";
import type { Spec, Change } from "../types";
import type {
  ArchiveContext,
  ArchiveOperationResult,
  SpecUpdateResult,
} from "./types";
import { applyDeltasToSpec, createSpecFromDeltas } from "./delta";
import { generateSpecDocFile } from "./docs";
import {
  addProjectWisdom,
  listProjectWisdom,
  compactProjectWisdom,
} from "../storage/project-wisdom";
import { execGit, getDefaultBranch } from "../utils/git";
import type {
  MultiRepoArchiveMetadata,
  MultiRepoArchiveRepoMetadata,
} from "./types";

function archiveBundlePath(archiveDir: string, changeId: string): string {
  return join(
    archiveDir,
    `${new Date().toISOString().split("T")[0]}-${changeId}`,
  );
}

function sortedScopeRepos(change: Change): NonNullable<Change["scope_repos"]> {
  return [...(change.scope_repos ?? [])].sort((a, b) => {
    const aOrder = a.merge_order ?? Number.MAX_SAFE_INTEGER;
    const bOrder = b.merge_order ?? Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.repo_id.localeCompare(b.repo_id);
  });
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
export async function archiveChange(
  context: ArchiveContext,
): Promise<ArchiveOperationResult> {
  const { change, specs, paths, dryRun = false } = context;
  const errors: string[] = [];
  const specsUpdated: SpecUpdateResult[] = [];
  const docsGenerated: string[] = [];
  const targetArchivePath = archiveBundlePath(paths.archive, change.id);

  const contractProofErrors = getArchiveContractProofErrors(change);
  if (contractProofErrors.length > 0) {
    return {
      success: false,
      changeId: change.id,
      specsUpdated,
      docsGenerated,
      archivePath: targetArchivePath,
      errors: contractProofErrors,
      archivedAt: new Date().toISOString(),
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
      archivePath: targetArchivePath,
      errors: multiRepo.errors,
      archivedAt: new Date().toISOString(),
      ...(multiRepo.metadata ? { multiRepo: multiRepo.metadata } : {}),
    };
  }

  // Process each capability's deltas
  for (const [capability, deltas] of Object.entries(change.deltas)) {
    if (deltas.length === 0) continue;

    let spec = specs.get(capability);
    let result: SpecUpdateResult;

    if (spec) {
      // Apply deltas to existing spec
      const originalVersion = spec.version;
      result = applyDeltasToSpec(
        structuredClone(spec),
        deltas,
        originalVersion,
      );

      if (result.updatedSpec) {
        spec = result.updatedSpec;
        specs.set(capability, spec);
      } else {
        errors.push(
          `Failed to apply deltas to ${capability}: ${result.deltaResults.find((r) => !r.success)?.error ?? "unknown error"}`,
        );
        continue;
      }
    } else {
      // Create new spec from deltas
      const { spec: newSpec, result: createResult } = createSpecFromDeltas(
        capability,
        deltas,
      );
      spec = newSpec;
      result = createResult;
      specs.set(capability, spec);
    }

    specsUpdated.push(result);

    // Write updated spec to disk
    if (!dryRun) {
      try {
        await writeSpecToDisk(spec, paths.specs);
      } catch (err) {
        errors.push(`Failed to write spec ${capability}: ${err}`);
      }
    }

    // Generate documentation
    if (!dryRun) {
      try {
        const doc = await generateSpecDocFile(spec, paths.docs);
        docsGenerated.push(doc.filePath);
      } catch (err) {
        errors.push(`Failed to generate docs for ${capability}: ${err}`);
      }
    } else {
      // In dry run, still record what would be generated
      docsGenerated.push(join(paths.docs, `${capability}.md`));
    }
  }

  // Auto-promote convention/pattern wisdom to project level
  let wisdomPromoted = 0;
  if (!dryRun && paths.wisdom && change.wisdom && change.wisdom.length > 0) {
    // Types eligible for promotion: convention and pattern only
    const promotableTypes = new Set(["convention", "pattern"]);
    const promotable = change.wisdom.filter((w) => promotableTypes.has(w.type));

    if (promotable.length > 0) {
      // Load existing project wisdom to avoid duplicates
      const projectDir = dirname(dirname(paths.wisdom)); // project dir derived from wisdom path
      const existing = await listProjectWisdom(projectDir, {
        wisdomPath: paths.wisdom,
      });
      const existingContents = new Set(existing.map((e) => e.content));

      for (const entry of promotable) {
        if (!existingContents.has(entry.content)) {
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
      }

      // Compact if we added entries (enforce cap)
      if (wisdomPromoted > 0) {
        try {
          await compactProjectWisdom(projectDir, { wisdomPath: paths.wisdom });
        } catch (err) {
          errors.push(`Failed to compact project wisdom: ${err}`);
        }
      }
    }
  }

  // Create archive directory and copy change (+ sibling files if changes dir provided)
  const sourceChangeDir = paths.changes
    ? join(paths.changes, change.id)
    : undefined;
  const archivePath = await createArchive(
    change,
    paths.archive,
    dryRun,
    sourceChangeDir,
    errors,
    multiRepo.metadata,
  );

  // In-repo archive: write identical bundle to in-repo path (warning-only on failure)
  if (paths.inRepoArchive && !dryRun) {
    try {
      await createInRepoArchive(
        change,
        paths.inRepoArchive,
        sourceChangeDir,
        multiRepo.metadata,
      );
    } catch {
      // In-repo failure is warning-only — do NOT add to errors array
      // to avoid failing the overall archive operation. Error binding is
      // intentionally omitted; would be logged here if a logger were wired.
    }
  }

  return {
    success: errors.length === 0,
    changeId: change.id,
    specsUpdated,
    docsGenerated,
    archivePath,
    errors,
    archivedAt: new Date().toISOString(),
    ...(multiRepo.metadata ? { multiRepo: multiRepo.metadata } : {}),
    ...(wisdomPromoted > 0 && { wisdomPromoted }),
  };
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
  sourceChangeDir?: string,
  errors?: string[],
  multiRepo?: MultiRepoArchiveMetadata,
): Promise<string> {
  const archivePath = archiveBundlePath(archiveDir, change.id);

  if (!dryRun) {
    // Write the change as archived
    const archivedChange: Change = {
      ...change,
      status: "archived",
    };
    await atomicWriteFile(
      join(archivePath, "change.json"),
      JSON.stringify(archivedChange, null, 2),
    );

    // Write archive summary
    const summary = generateArchiveSummary(change);
    await atomicWriteFile(join(archivePath, "ARCHIVE_SUMMARY.md"), summary);

    const traceability = generateContractTraceability(change);
    if (traceability) {
      await atomicWriteFile(
        join(archivePath, "CONTRACT_TRACEABILITY.md"),
        traceability,
      );
    }

    // Copy wisdom entries to archive if present
    if (change.wisdom && change.wisdom.length > 0) {
      await atomicWriteFile(
        join(archivePath, "wisdom.json"),
        JSON.stringify(
          { entries: change.wisdom, count: change.wisdom.length },
          null,
          2,
        ),
      );
    }

    if (multiRepo) {
      await atomicWriteFile(
        join(archivePath, "multi-repo-archive.json"),
        JSON.stringify(multiRepo, null, 2),
      );
    }

    // Copy sibling files from source change directory (proposal.md, problem-statement.md, etc.)
    if (sourceChangeDir) {
      try {
        const entries = await readdir(sourceChangeDir, { withFileTypes: true });
        for (const entry of entries) {
          // Skip change.json (already written above with stripped evidence)
          if (entry.name === "change.json" || !entry.isFile()) continue;
          try {
            const content = await readFile(
              join(sourceChangeDir, entry.name),
              "utf-8",
            );
            await atomicWriteFile(join(archivePath, entry.name), content);
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

  return archivePath;
}

/**
 * Generate a summary markdown file for the archive.
 */
function generateArchiveSummary(change: Change): string {
  const lines: string[] = [];

  lines.push(`# Archive: ${change.title}`);
  lines.push("");
  lines.push(`**Change ID:** ${change.id}`);
  lines.push(`**Archived:** ${new Date().toISOString()}`);
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
 */
export async function createInRepoArchive(
  change: Change,
  inRepoArchiveDir: string,
  sourceChangeDir?: string,
  multiRepo?: MultiRepoArchiveMetadata,
): Promise<string> {
  const archivePath = archiveBundlePath(inRepoArchiveDir, change.id);

  const archivedChange: Change = {
    ...change,
    status: "archived",
  };
  await atomicWriteFile(
    join(archivePath, "change.json"),
    JSON.stringify(archivedChange, null, 2),
  );

  // Write archive summary
  const summary = generateArchiveSummary(change);
  await atomicWriteFile(join(archivePath, "ARCHIVE_SUMMARY.md"), summary);

  const traceability = generateContractTraceability(change);
  if (traceability) {
    await atomicWriteFile(
      join(archivePath, "CONTRACT_TRACEABILITY.md"),
      traceability,
    );
  }

  // Copy wisdom entries to archive if present
  if (change.wisdom && change.wisdom.length > 0) {
    await atomicWriteFile(
      join(archivePath, "wisdom.json"),
      JSON.stringify(
        { entries: change.wisdom, count: change.wisdom.length },
        null,
        2,
      ),
    );
  }

  if (multiRepo) {
    await atomicWriteFile(
      join(archivePath, "multi-repo-archive.json"),
      JSON.stringify(multiRepo, null, 2),
    );
  }

  // Copy sibling files from source change directory
  if (sourceChangeDir) {
    try {
      const entries = await readdir(sourceChangeDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === "change.json" || !entry.isFile()) continue;
        try {
          const content = await readFile(
            join(sourceChangeDir, entry.name),
            "utf-8",
          );
          await atomicWriteFile(join(archivePath, entry.name), content);
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
 * Reconcile in-repo archive after a previous attempt already wrote external
 * archive bundle but skipped/failed before in-repo bundle creation.
 */
export async function reconcileInRepoArchive(
  change: Change,
  inRepoArchiveDir: string,
  sourceChangeDir?: string,
  multiRepo?: MultiRepoArchiveMetadata,
): Promise<string> {
  const existing = await findArchiveBundle(inRepoArchiveDir, change.id);
  if (existing) {
    return existing;
  }

  return createInRepoArchive(
    change,
    inRepoArchiveDir,
    sourceChangeDir,
    multiRepo,
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
      await readFile(join(candidate, "change.json"), "utf-8");
      return candidate;
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
