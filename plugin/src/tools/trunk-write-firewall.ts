import { basename, dirname, isAbsolute, relative, resolve } from "path";
import { pathToFileURL } from "url";
import { isSameOrChildPath } from "../utils/path.js";
import type { RepoState } from "./checkpoint.js";
import { detectRepoState } from "./checkpoint.js";

export type TrunkWriteDecision = "ALLOW" | "BLOCK";

/**
 * rq-trunkArtifactAllowlist01: Generated artifacts that ADV commands write
 * to the trunk checkout at project root on the default branch. These files
 * exist BECAUSE they must live on trunk (e.g. /adv-triage regenerates
 * ROADMAP.md as a deterministic mirror of the canonical Project board).
 *
 * Allowlist semantics:
 * - Match by exact basename only.
 * - Path must be DIRECTLY at the project root — nested paths are NOT exempt.
 * - Allowlist applies to file-tool writes AND destructive bash commands.
 */
const TRUNK_GENERATED_ARTIFACTS = new Set<string>([
  "ROADMAP.md",
  "CHANGELOG.md",
]);

function isAllowlistedTrunkArtifact(
  targetPath: string,
  projectRoot: string,
): boolean {
  const rel = relative(projectRoot, targetPath);
  // Reject nested paths: rel must be the basename itself, no directory parts.
  if (rel === "" || rel.includes("/") || rel.startsWith("..")) return false;
  return TRUNK_GENERATED_ARTIFACTS.has(basename(targetPath));
}

export interface TrunkWriteResult {
  decision: TrunkWriteDecision;
  reason?: string;
  targetPath?: string;
}

export interface TrunkWriteFirewallDeps {
  getDefaultBranch: (cwd: string) => Promise<string>;
  execGit: (args: string[], cwd: string) => Promise<string>;
  getWorktreePaths: () => Promise<string[]>;
  getProjectRoot: () => string;
  getRepoState?: (cwd: string) => Promise<RepoState>;
  onWarning?: (message: string) => void;
}

interface TrunkContext {
  targetPath: string;
  gitRoot: string | null;
  branch: string;
  defaultBranchKnown: boolean;
  isDefaultBranch: boolean;
  isWorktree: boolean;
  repoState: RepoState;
}

function isSamePath(left: string, right: string): boolean {
  return left.replace(/\/+$/, "") === right.replace(/\/+$/, "");
}

const IN_PROGRESS_STATES = new Set<RepoState>([
  "merging",
  "rebasing",
  "cherry-picking",
  "reverting",
]);

function normalizeTargetPath(targetPath: string, basePath: string): string {
  return isAbsolute(targetPath) ? targetPath : resolve(basePath, targetPath);
}

async function resolveTrunkContext(
  targetPath: string,
  deps: TrunkWriteFirewallDeps,
): Promise<TrunkContext> {
  const projectRoot = deps.getProjectRoot();
  const normalizedTarget = normalizeTargetPath(targetPath, projectRoot);
  const worktreePaths = await deps.getWorktreePaths();

  let gitRoot: string | null = null;
  const probeCwd = dirname(normalizedTarget);
  try {
    gitRoot = (
      await deps.execGit(["rev-parse", "--show-toplevel"], probeCwd)
    ).trim();
  } catch (error) {
    deps.onWarning?.(
      `trunk-write-firewall: git root detection failed for ${normalizedTarget}; allowing (${error instanceof Error ? error.message : String(error)})`,
    );
    return {
      targetPath: normalizedTarget,
      gitRoot: null,
      branch: "HEAD",
      defaultBranchKnown: false,
      isDefaultBranch: false,
      isWorktree: false,
      repoState: "not_git",
    };
  }

  const isWorktree = worktreePaths.some(
    (worktreePath) =>
      !isSamePath(worktreePath, projectRoot) &&
      (isSameOrChildPath(normalizedTarget, worktreePath) ||
        isSameOrChildPath(gitRoot, worktreePath)),
  );

  let branch = "HEAD";
  try {
    branch = (
      await deps.execGit(["rev-parse", "--abbrev-ref", "HEAD"], gitRoot)
    ).trim();
  } catch (error) {
    deps.onWarning?.(
      `trunk-write-firewall: branch detection failed for ${gitRoot}; using HEAD (${error instanceof Error ? error.message : String(error)})`,
    );
  }

  let defaultBranch = "";
  try {
    defaultBranch = await deps.getDefaultBranch(gitRoot);
  } catch (error) {
    deps.onWarning?.(
      `trunk-write-firewall: default branch detection failed for ${gitRoot}; allowing (${error instanceof Error ? error.message : String(error)})`,
    );
  }

  const repoState = await (deps.getRepoState ?? detectRepoState)(gitRoot);

  return {
    targetPath: normalizedTarget,
    gitRoot,
    branch,
    defaultBranchKnown: Boolean(defaultBranch),
    isDefaultBranch: Boolean(defaultBranch) && branch === defaultBranch,
    isWorktree,
    repoState,
  };
}

function evaluateTarget(
  context: TrunkContext,
  deps: TrunkWriteFirewallDeps,
): TrunkWriteResult {
  if (context.gitRoot === null || context.repoState === "not_git") {
    return { decision: "ALLOW", targetPath: context.targetPath };
  }
  if (context.isWorktree)
    return { decision: "ALLOW", targetPath: context.targetPath };
  const projectRoot = deps.getProjectRoot();
  const isTrunkCheckout = isSameOrChildPath(context.targetPath, projectRoot);
  if (!context.defaultBranchKnown && isTrunkCheckout) {
    return {
      decision: "BLOCK",
      targetPath: context.targetPath,
      reason: `Trunk write firewall: direct file write to trunk checkout is blocked because the default branch could not be verified (${context.targetPath}). Create or use an ADV worktree instead.`,
    };
  }
  if (!context.isDefaultBranch) {
    return { decision: "ALLOW", targetPath: context.targetPath };
  }
  if (IN_PROGRESS_STATES.has(context.repoState)) {
    return { decision: "ALLOW", targetPath: context.targetPath };
  }

  if (!isTrunkCheckout)
    return { decision: "ALLOW", targetPath: context.targetPath };

  // rq-trunkArtifactAllowlist01: ADV-generated trunk artifacts (e.g.
  // ROADMAP.md regenerated by /adv-triage) bypass the firewall when at
  // project root on the default branch. The allowlist is intentionally
  // narrow — basename match at root only, no nested paths.
  if (isAllowlistedTrunkArtifact(context.targetPath, projectRoot)) {
    return { decision: "ALLOW", targetPath: context.targetPath };
  }

  return {
    decision: "BLOCK",
    targetPath: context.targetPath,
    reason: `Trunk write firewall: direct file write to trunk checkout on default branch is blocked (${context.targetPath}). Create or use an ADV worktree instead.`,
  };
}

export async function checkTrunkWrite(
  targetPath: string,
  deps: TrunkWriteFirewallDeps,
): Promise<TrunkWriteResult> {
  return evaluateTarget(await resolveTrunkContext(targetPath, deps), deps);
}

export function stripHeredocs(command: string): string {
  return command.replace(
    /<<-?['"]?([A-Za-z_][A-Za-z0-9_]*)['"]?\n[\s\S]*?\n\1/g,
    "",
  );
}

function splitShellSegments(command: string): string[] {
  return stripHeredocs(command)
    .split(/&&|\|\||;|\|/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function unquote(value: string): string {
  return value.replace(/^['"]|['"]$/g, "");
}

function tokenize(segment: string): string[] {
  return Array.from(segment.matchAll(/"[^"]*"|'[^']*'|\S+/g)).map((match) =>
    unquote(match[0]),
  );
}

function resolveCommandPath(pathValue: string, workdir: string): string {
  return normalizeTargetPath(unquote(pathValue), workdir);
}

export function classifyDestructiveBash(
  command: string,
  workdir = process.cwd(),
): string[] {
  const targets: string[] = [];
  for (const segment of splitShellSegments(command)) {
    for (const match of segment.matchAll(/(?:^|\s)(?:>>|>)\s*([^\s;&|]+)/g)) {
      targets.push(resolveCommandPath(match[1], workdir));
    }

    const tokens = tokenize(segment);
    const commandName = tokens[0];
    if (!commandName) continue;

    if (commandName === "tee") {
      for (const token of tokens
        .slice(1)
        .filter((token) => !token.startsWith("-"))) {
        targets.push(resolveCommandPath(token, workdir));
      }
    }

    if (
      commandName === "sed" &&
      tokens.some((token) => token === "-i" || token.startsWith("-i"))
    ) {
      const positional = tokens
        .slice(1)
        .filter((token) => !token.startsWith("-"));
      const target = positional.at(-1);
      if (target) targets.push(resolveCommandPath(target, workdir));
    }

    if (commandName === "cp" || commandName === "mv") {
      const positional = tokens
        .slice(1)
        .filter((token) => !token.startsWith("-"));
      const target = positional.at(-1);
      if (target) targets.push(resolveCommandPath(target, workdir));
    }

    if (commandName === "rm") {
      for (const token of tokens
        .slice(1)
        .filter((token) => !token.startsWith("-"))) {
        targets.push(resolveCommandPath(token, workdir));
      }
    }
  }
  return targets;
}

export async function checkTrunkWriteBash(
  command: string,
  argsWorkdir: string | undefined,
  deps: TrunkWriteFirewallDeps,
): Promise<TrunkWriteResult> {
  const workdir = argsWorkdir ?? deps.getProjectRoot();
  const targets = classifyDestructiveBash(command, workdir);
  for (const target of targets) {
    const result = await checkTrunkWrite(target, deps);
    if (result.decision === "BLOCK") return result;
  }
  return { decision: "ALLOW" };
}

export function pathToFileUrlString(pathValue: string): string {
  return pathToFileURL(pathValue).toString();
}
