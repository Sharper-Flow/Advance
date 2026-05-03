/**
 * Mesh Scan Tool — adv_mesh_scan
 *
 * On-demand inbox scan: lists GH issues with adv-mesh label from all
 * trusted repos (related_repos where trusted=true and gh_repo is set).
 * Parses YAML frontmatter from issue bodies.
 * Implements per-session in-memory TTL cache.
 */

import { z } from "zod";
import type { Store } from "../storage/store-types";
import { formatToolOutput } from "../utils/tool-output";
import {
  listMeshIssues,
  parseMeshFrontmatter,
} from "../integrations/mesh-issues";
import { getTrustedRepos } from "../archive/archive-mesh";
import type { MeshFrontmatter } from "../integrations/mesh-issues";

// ─── Cache ──────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface CachedScan {
  results: MeshScanItem[];
  cachedAt: number;
}

let scanCache: CachedScan | null = null;

function _invalidateCache(): void {
  scanCache = null;
}

function isCacheValid(): boolean {
  return scanCache !== null && Date.now() - scanCache.cachedAt < CACHE_TTL_MS;
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MeshScanItem {
  /** GH repo in owner/name format */
  repo: string;
  /** Issue number */
  issueNumber: number;
  /** Issue title */
  title: string;
  /** Parsed ADV frontmatter from issue body */
  frontmatter: MeshFrontmatter;
  /** Issue URL */
  htmlUrl?: string;
}

export interface MeshScanResult {
  /** Discovered mesh items */
  items: MeshScanItem[];
  /** Number of trusted repos scanned */
  reposScanned: number;
  /** Cache status */
  fromCache: boolean;
  /** Errors encountered (non-fatal) */
  errors: string[];
}

// ─── Scan Logic ─────────────────────────────────────────────────────────────

/**
 * Perform mesh scan across all trusted repos.
 */
export async function performMeshScan(
  store: Store,
  forceRefresh = false,
): Promise<MeshScanResult> {
  // Check cache
  if (!forceRefresh && isCacheValid() && scanCache) {
    return {
      items: scanCache.results,
      reposScanned: 0,
      fromCache: true,
      errors: [],
    };
  }

  const items: MeshScanItem[] = [];
  const errors: string[] = [];

  // Get trusted repos from project config
  const config = store.config;
  const trustedRepos = getTrustedRepos(config?.related_repos);

  if (trustedRepos.length === 0) {
    return {
      items: [],
      reposScanned: 0,
      fromCache: false,
      errors: [],
    };
  }

  for (const repo of trustedRepos) {
    if (!repo.gh_repo) continue;

    try {
      const result = await listMeshIssues(repo.gh_repo);
      if (result.exitCode !== 0 && !result.ghNotFound) {
        errors.push(`Scan failed for ${repo.gh_repo}: ${result.stderr}`);
        continue;
      }

      for (const issue of result.issues) {
        const frontmatter = issue.body ? parseMeshFrontmatter(issue.body) : {};
        items.push({
          repo: repo.gh_repo,
          issueNumber: issue.number,
          title: issue.title,
          frontmatter,
          htmlUrl: issue.html_url,
        });
      }
    } catch (err) {
      errors.push(`Scan error for ${repo.gh_repo}: ${err}`);
    }
  }

  // Update cache
  scanCache = { results: items, cachedAt: Date.now() };

  return {
    items,
    reposScanned: trustedRepos.length,
    fromCache: false,
    errors,
  };
}

/**
 * Get cached inbox count for status display.
 * Returns count without performing a scan if cache is valid.
 */
export function getMeshInboxCount(): number {
  if (scanCache) return scanCache.results.length;
  return 0;
}

// ─── Tool Definition ────────────────────────────────────────────────────────

export const meshScanTools = {
  adv_mesh_scan: {
    description:
      "Scan trusted repos for ADV mesh issues (GH issues with adv-mesh label). Returns discovered cross-project items with parsed frontmatter.",
    args: {
      forceRefresh: z
        .boolean()
        .optional()
        .describe("Force a fresh scan, ignoring the cache. Default: false."),
    },
    execute: async (
      { forceRefresh }: { forceRefresh?: boolean },
      store: Store,
    ) => {
      const result = await performMeshScan(store, forceRefresh);

      return formatToolOutput({
        success: true,
        meshInbox: {
          items: result.items,
          reposScanned: result.reposScanned,
          fromCache: result.fromCache,
          totalItems: result.items.length,
        },
        ...(result.errors.length > 0 && { errors: result.errors }),
      });
    },
  },
};
