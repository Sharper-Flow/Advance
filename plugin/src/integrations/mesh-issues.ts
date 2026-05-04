/**
 * Agent Mesh Issue Functions
 *
 * Provides createMeshIssue, listMeshIssues, getGhIssue, buildMeshPayload,
 * parseMeshFrontmatter — GH issue operations for the ADV agent mesh protocol.
 *
 * Design decisions:
 * - Uses execGh adapter (not direct execFile) for testability.
 * - YAML frontmatter in issue body carries ADV metadata.
 * - Body truncation at MAX_BODY_SIZE with truncation notice.
 * - Label management: adv-mesh + adv-{relationship} labels.
 */

import { execGh } from "./gh-cli";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Maximum body size in characters before truncation */
export const MAX_BODY_SIZE = 60_000;

const TRUNCATION_NOTICE =
  "\n\n---\n⚠ Body truncated at 60K characters. See archive bundle for full content.";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MeshIssueInput {
  changeId: string;
  capability: string;
  relationship: string;
  sourceProject: string;
  body: string;
}

export interface CreateMeshIssueInput {
  title: string;
  body: string;
  relationship: string;
  changeId: string;
  capability: string;
  sourceProject: string;
}

export interface MeshIssueResult {
  issueNumber?: number;
  htmlUrl?: string;
  exitCode: number;
  stderr: string;
  ghNotFound?: boolean;
}

export interface MeshIssue {
  number: number;
  title: string;
  body?: string;
  labels: Array<{ name: string }>;
  html_url?: string;
}

export interface ListMeshIssuesResult {
  issues: MeshIssue[];
  exitCode: number;
  stderr: string;
  ghNotFound?: boolean;
}

export interface MeshFrontmatter {
  adv_change_id?: string;
  adv_capability?: string;
  adv_relationship?: string;
  adv_source_project?: string;
  adv_created_at?: string;
  [key: string]: unknown;
}

// ─── Payload Builder ────────────────────────────────────────────────────────

/**
 * Build a mesh issue body with YAML frontmatter containing ADV metadata.
 * Truncates body if it exceeds MAX_BODY_SIZE.
 */
export function buildMeshPayload(input: MeshIssueInput): string {
  const createdAt = new Date().toISOString();
  const metadata = {
    adv_change_id: input.changeId,
    adv_capability: input.capability,
    adv_relationship: input.relationship,
    adv_source_project: input.sourceProject,
    adv_created_at: createdAt,
  };

  const frontmatter = Object.entries(metadata)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");

  let body = input.body;
  if (body.length > MAX_BODY_SIZE) {
    const sliceAt = Math.max(0, MAX_BODY_SIZE - TRUNCATION_NOTICE.length);
    body = body.slice(0, sliceAt) + TRUNCATION_NOTICE;
  }

  return `---\n${frontmatter}\n---\n${body}`;
}

// ─── Issue Operations ───────────────────────────────────────────────────────

/**
 * Create a GH issue with mesh metadata.
 */
export async function createMeshIssue(
  repo: string,
  input: CreateMeshIssueInput,
): Promise<MeshIssueResult> {
  const body = buildMeshPayload({
    changeId: input.changeId,
    capability: input.capability,
    relationship: input.relationship,
    sourceProject: input.sourceProject,
    body: input.body,
  });

  const labels = `adv-mesh,adv-${input.relationship}`;

  const result = await execGh(
    [
      "issue",
      "create",
      "--repo",
      repo,
      "--title",
      input.title,
      "--body",
      body,
      "--label",
      labels,
      "--json",
      "number,html_url",
    ],
    process.cwd(),
  );

  if (result.exitCode !== 0) {
    return {
      exitCode: result.exitCode,
      stderr: result.stderr,
      ghNotFound: result.ghNotFound,
    };
  }

  try {
    const parsed = JSON.parse(result.stdout);
    return {
      issueNumber: parsed.number,
      htmlUrl: parsed.html_url,
      exitCode: 0,
      stderr: result.stderr,
    };
  } catch {
    return {
      exitCode: result.exitCode,
      stderr: result.stderr,
      ghNotFound: result.ghNotFound,
    };
  }
}

/**
 * List GH issues with adv-mesh label.
 */
export async function listMeshIssues(
  repo: string,
  additionalLabels: string[] = [],
): Promise<ListMeshIssuesResult> {
  const allLabels = ["adv-mesh", ...additionalLabels];
  const labelArg = allLabels.join(",");

  const result = await execGh(
    [
      "issue",
      "list",
      "--repo",
      repo,
      "--label",
      labelArg,
      "--json",
      "number,title,body,labels,html_url",
      "--limit",
      "100",
    ],
    process.cwd(),
  );

  if (result.exitCode !== 0) {
    return {
      issues: [],
      exitCode: result.exitCode,
      stderr: result.stderr,
      ghNotFound: result.ghNotFound,
    };
  }

  try {
    const issues = JSON.parse(result.stdout) as MeshIssue[];
    return { issues, exitCode: 0, stderr: result.stderr };
  } catch {
    return { issues: [], exitCode: 0, stderr: result.stderr };
  }
}

/**
 * Get a single GH issue by number.
 */
export async function getGhIssue(
  repo: string,
  issueNumber: number,
): Promise<MeshIssue & { exitCode: number; stderr: string }> {
  const result = await execGh(
    [
      "issue",
      "view",
      String(issueNumber),
      "--repo",
      repo,
      "--json",
      "number,title,body,labels,html_url",
    ],
    process.cwd(),
  );

  if (result.exitCode !== 0) {
    return {
      number: issueNumber,
      title: "",
      labels: [],
      exitCode: result.exitCode,
      stderr: result.stderr,
    };
  }

  try {
    const parsed = JSON.parse(result.stdout);
    return { ...parsed, exitCode: 0, stderr: result.stderr };
  } catch {
    return {
      number: issueNumber,
      title: "",
      labels: [],
      exitCode: result.exitCode,
      stderr: result.stderr,
    };
  }
}

// ─── Frontmatter Parser ─────────────────────────────────────────────────────

/**
 * Parse YAML frontmatter from an issue body.
 * Returns key-value pairs from between --- delimiters.
 */
export function parseMeshFrontmatter(body: string): MeshFrontmatter {
  const match = body.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const frontmatter = match[1];
  const result: MeshFrontmatter = {};

  for (const line of frontmatter.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    if (key.startsWith("adv_")) {
      (result as Record<string, unknown>)[key] = value;
    }
  }

  return result;
}
