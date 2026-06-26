/**
 * Archive Mesh Integration
 *
 * Wires mesh issue creation into the archive flow.
 * Detects trusted repos from project config and creates GH issues
 * for each cross_project_link targeting a trusted repo.
 */

import type { Change, CrossProjectLink, RelatedRepo } from "../types";
import { createMeshIssue } from "../integrations/mesh-issues";
import type { MeshIssueResult } from "../integrations/mesh-issues";

export interface MeshArchiveResult {
  /** URLs of created mesh issues */
  issueUrls: string[];
  /** Errors encountered during mesh issue creation (non-fatal) */
  errors: string[];
}

/**
 * Detect trusted repos from project config's related_repos list.
 * Returns only repos with trusted=true and a valid gh_repo field.
 */
export function getTrustedRepos(
  relatedRepos: RelatedRepo[] | undefined,
): RelatedRepo[] {
  if (!relatedRepos) return [];
  return relatedRepos.filter((repo) => repo.trusted === true && !!repo.gh_repo);
}

/**
 * Create mesh issues for cross-project links during archive.
 * For each link targeting a trusted repo, creates a GH issue with mesh payload.
 * Returns issue URLs and any errors (non-fatal).
 */
export async function createMeshIssuesForArchive(
  change: Change,
  trustedRepos: RelatedRepo[],
): Promise<MeshArchiveResult> {
  const issueUrls: string[] = [];
  const errors: string[] = [];

  if (!change.cross_project_links || change.cross_project_links.length === 0) {
    return { issueUrls, errors };
  }

  for (const link of change.cross_project_links) {
    // Find the trusted repo for this link's target
    const targetRepo = findTrustedRepoForLink(link, trustedRepos);
    if (!targetRepo || !targetRepo.gh_repo) continue;

    const relationship = link.relationship || "contributes_to";
    const title = `[ADV Mesh] ${change.title} → ${targetRepo.gh_repo}`;

    // Build issue body from change context
    const body = buildMeshIssueBody(change, link);

    try {
      const result: MeshIssueResult = await createMeshIssue(
        targetRepo.gh_repo,
        {
          title,
          body,
          relationship,
          changeId: change.id,
          capability: getMeshCapability(change),
          sourceProject: link.target_path,
        },
      );

      if (result.htmlUrl) {
        issueUrls.push(result.htmlUrl);
      } else if (result.parseFailed) {
        // gh exited 0 but its JSON output could not be parsed — this is a
        // failure, not a silent success-without-URL (QUAL-005).
        errors.push(
          `Mesh issue creation for ${targetRepo.gh_repo} returned an unparseable gh response (parse failure); no issue URL recorded.`,
        );
      } else if (result.exitCode !== 0 && !result.ghNotFound) {
        errors.push(
          `Mesh issue creation failed for ${targetRepo.gh_repo}: ${result.stderr}`,
        );
      }
      // ghNotFound is silently ignored — gh not available is not an error
    } catch (err) {
      errors.push(
        `Mesh issue creation error for ${targetRepo.gh_repo}: ${err}`,
      );
    }
  }

  return { issueUrls, errors };
}

function getMeshCapability(change: Change): string {
  const capabilities = Object.keys(change.deltas).sort((a, b) =>
    a.localeCompare(b),
  );
  return capabilities[0] ?? "agent-mesh";
}

/**
 * Find the trusted repo that matches a cross-project link.
 * Matches by target_path (absolute path) against repo.path.
 */
function findTrustedRepoForLink(
  link: CrossProjectLink,
  trustedRepos: RelatedRepo[],
): RelatedRepo | undefined {
  // Match by target_path against repo path
  for (const repo of trustedRepos) {
    if (link.target_path === repo.path) {
      return repo;
    }
    // Also check if target_path is within the repo path
    if (link.target_path.startsWith(repo.path + "/")) {
      return repo;
    }
  }
  return undefined;
}

/**
 * Build the markdown body for a mesh issue.
 */
function buildMeshIssueBody(change: Change, link: CrossProjectLink): string {
  const lines: string[] = [];
  lines.push(`## Agent Mesh Link`);
  lines.push("");
  lines.push(
    `Change **${change.title}** (\`${change.id}\`) has a cross-project link to this repository.`,
  );
  lines.push("");
  lines.push(`- **Relationship:** ${link.relationship || "contributes_to"}`);
  lines.push(`- **Target Path:** ${link.target_path}`);
  lines.push(`- **Change ID:** ${change.id}`);
  lines.push("");
  lines.push("### Tasks Completed");
  lines.push("");
  const doneTasks = change.tasks.filter((t) => t.status === "done");
  for (const task of doneTasks) {
    lines.push(`- ✅ ${task.title}`);
  }
  lines.push("");

  if (change.implementation_notes || change.design) {
    lines.push("### Details");
    lines.push("");
    lines.push(`See archive bundle for full change details.`);
  }

  return lines.join("\n");
}
