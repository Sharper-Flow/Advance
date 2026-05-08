import { execFile } from "node:child_process";
import { readFile, stat } from "fs/promises";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { promisify } from "node:util";

import { isPathInsideDirectory } from "./project-id";

const execFileAsync = promisify(execFile);
const GIT_PROBE_TIMEOUT_MS = 1000;

const loadedModulePath = fileURLToPath(import.meta.url);
const pluginRoot = resolve(dirname(loadedModulePath), "../..");
const processStartedAt = new Date(
  Date.now() - Math.round(process.uptime() * 1000),
).toISOString();

// rq-runtimeProvenance01: 4-state freshness verdict for source-vs-dist-vs-process
// timing relationships. Equal-mtime explicitly folds into `fresh` (sourceMtime <=
// distMtime AND distMtime <= processStartedAt) so simultaneous build+restart on
// the same millisecond is not flagged as stale.
export type FreshnessVerdict =
  | "fresh"
  | "source_ahead_of_dist"
  | "dist_ahead_of_process"
  | "unknown";

// rq-runtimeProvenance01: cwd relationship to the loaded plugin root.
// `match` = exactly equal; `child` = inside the tree (e.g. running tools from
// `plugin/src/...`); `outside` = unrelated path (linked plugin, different repo).
export type CwdRelation = "match" | "child" | "outside";

export type RecoveryHint = {
  action: string;
  commands: string[];
  paths: {
    plugin_root: string;
    main_checkout?: string;
    worktree?: string;
  };
};

export interface RuntimeInfoOptions {
  /** Set when caller knows we are running in a worktree. */
  isWorktree?: boolean;
  /** Path to the main checkout (where dist is built); used to seed recovery hint. */
  mainCheckoutPath?: string;
  /** When set, recovery hint includes the worktree path explicitly. */
  worktreePath?: string;
}

interface RecoveryHintInputs {
  pluginRoot: string;
  mainCheckout?: string;
  worktree?: string;
}

export type PluginRuntimeInfo = {
  // === Existing fields (unchanged contract) ===
  loaded_module_path: string;
  process_started_at: string;
  build_marker_path: string;
  build_marker_found: boolean;
  build_marker?: unknown;
  worker_script_path: string;
  reload_caveat: string;
  // === Additive runtime-provenance fields (rq-runtimeProvenance01) ===
  dist_index_path: string;
  dist_mtime_iso: string | null;
  source_index_path: string;
  source_index_mtime_iso: string | null;
  source_dist_freshness: FreshnessVerdict;
  plugin_checkout_branch: string | null;
  plugin_checkout_head_sha: string | null;
  cwd_vs_plugin_root: CwdRelation;
  recovery_hint: RecoveryHint | null;
};

/**
 * Best-effort `mtime` read. Returns ISO timestamp on success, `null` on any
 * failure (missing file, permission denied, transient stat error). Never
 * throws — provenance must degrade gracefully.
 */
export async function statMtimeIso(path: string): Promise<string | null> {
  try {
    const stats = await stat(path);
    return stats.mtime.toISOString();
  } catch {
    return null;
  }
}

/**
 * Determine the source-vs-dist-vs-process freshness state.
 *
 * Equal-mtime is explicitly considered `fresh` (using `<=` comparisons). This
 * matters because `tsup` writes dist atomically and a same-millisecond rebuild
 * +restart should not be flagged as stale.
 *
 * Returns `unknown` if any input is null (stat failure or git probe failure).
 *
 * Edge case: when source > dist AND dist > process, source-ahead is preferred
 * because rebuild-then-restart is the more comprehensive recovery path.
 */
export function computeFreshness(
  sourceMtimeIso: string | null,
  distMtimeIso: string | null,
  processStartedAtIso: string | null,
): FreshnessVerdict {
  if (
    sourceMtimeIso === null ||
    distMtimeIso === null ||
    processStartedAtIso === null
  ) {
    return "unknown";
  }
  const source = Date.parse(sourceMtimeIso);
  const dist = Date.parse(distMtimeIso);
  const process = Date.parse(processStartedAtIso);
  if (Number.isNaN(source) || Number.isNaN(dist) || Number.isNaN(process)) {
    return "unknown";
  }
  // Source-ahead is more actionable than dist-ahead. Surface it first.
  if (source > dist) {
    return "source_ahead_of_dist";
  }
  if (dist > process) {
    return "dist_ahead_of_process";
  }
  return "fresh";
}

/**
 * Classify the working-directory relationship to the loaded plugin root.
 * Reuses `isPathInsideDirectory` semantics for the `match`/`child` distinction.
 */
export function computeCwdRelation(
  cwd: string,
  loadedPluginRoot: string,
): CwdRelation {
  const cwdAbs = resolve(cwd);
  const rootAbs = resolve(loadedPluginRoot);
  if (cwdAbs === rootAbs) return "match";
  if (isPathInsideDirectory(cwdAbs, rootAbs)) return "child";
  return "outside";
}

/**
 * Probe git for the plugin checkout's branch + HEAD SHA. Returns `{ branch:
 * null, sha: null }` on any failure mode (no git binary, not a repo, timeout,
 * subprocess error). Bounded by `GIT_PROBE_TIMEOUT_MS` so a hung git process
 * cannot block diagnostic surfaces.
 *
 * Pattern matches `execGit` in `utils/project-id.ts` but uses promisify for
 * cleaner ergonomics inside an already-async caller.
 */
export async function probeGit(
  cwd: string,
): Promise<{ branch: string | null; sha: string | null }> {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
  try {
    const [branchResult, shaResult] = await Promise.all([
      execFileAsync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
        cwd,
        timeout: GIT_PROBE_TIMEOUT_MS,
        env,
      }),
      execFileAsync("git", ["rev-parse", "HEAD"], {
        cwd,
        timeout: GIT_PROBE_TIMEOUT_MS,
        env,
      }),
    ]);
    const branch = branchResult.stdout.toString().trim() || null;
    const sha = shaResult.stdout.toString().trim() || null;
    return { branch, sha };
  } catch {
    return { branch: null, sha: null };
  }
}

/**
 * Synthesize a structured recovery hint per freshness verdict. Returns `null`
 * for `fresh`. Structured form (`{ action, commands[], paths }`) lets callers
 * render verbatim or extract individual commands programmatically.
 */
export function buildRecoveryHint(
  verdict: FreshnessVerdict,
  inputs: RecoveryHintInputs,
): RecoveryHint | null {
  if (verdict === "fresh") return null;

  const paths: RecoveryHint["paths"] = { plugin_root: inputs.pluginRoot };
  if (inputs.mainCheckout) paths.main_checkout = inputs.mainCheckout;
  if (inputs.worktree) paths.worktree = inputs.worktree;

  switch (verdict) {
    case "source_ahead_of_dist":
      return {
        action:
          "Source code is newer than built dist. Rebuild before restart so the cached plugin loads the fix.",
        commands: [
          "pnpm run build",
          "# then restart your OpenCode session to load the rebuilt dist",
        ],
        paths,
      };
    case "dist_ahead_of_process":
      return {
        action:
          "Dist is newer than the running process. Restart the OpenCode session to load the rebuilt code.",
        commands: ["# restart OpenCode session in: " + inputs.pluginRoot],
        paths,
      };
    case "unknown":
      return {
        action:
          "Cannot determine plugin freshness — filesystem stat or git probe failed. Provenance is in degraded mode.",
        commands: [],
        paths,
      };
  }
}

export async function getPluginRuntimeInfo(
  opts: RuntimeInfoOptions = {},
): Promise<PluginRuntimeInfo> {
  const distIndexPath = resolve(pluginRoot, "dist", "index.js");
  const sourceIndexPath = resolve(pluginRoot, "src", "index.ts");
  const buildMarkerPath = resolve(pluginRoot, "dist", "oca-build.json");
  const workerScriptPath = resolve(pluginRoot, "dist", "temporal", "worker.js");

  let buildMarker: unknown;
  let buildMarkerFound = false;
  try {
    buildMarker = JSON.parse(await readFile(buildMarkerPath, "utf8"));
    buildMarkerFound = true;
  } catch {
    buildMarker = undefined;
  }

  const [distMtimeIso, sourceMtimeIso] = await Promise.all([
    statMtimeIso(distIndexPath),
    statMtimeIso(sourceIndexPath),
  ]);

  const freshness = computeFreshness(
    sourceMtimeIso,
    distMtimeIso,
    processStartedAt,
  );

  const cwdRelation = computeCwdRelation(process.cwd(), pluginRoot);

  const { branch, sha: headSha } = await probeGit(pluginRoot);

  const recoveryHint = buildRecoveryHint(freshness, {
    pluginRoot,
    mainCheckout: opts.mainCheckoutPath,
    worktree: opts.worktreePath ?? (opts.isWorktree ? pluginRoot : undefined),
  });

  return {
    loaded_module_path: loadedModulePath,
    process_started_at: processStartedAt,
    build_marker_path: buildMarkerPath,
    build_marker_found: buildMarkerFound,
    ...(buildMarkerFound ? { build_marker: buildMarker } : {}),
    worker_script_path: workerScriptPath,
    reload_caveat:
      "Restart OpenCode after rebuilding Advance; host-loaded plugin tool code is not hot-reloaded.",
    dist_index_path: distIndexPath,
    dist_mtime_iso: distMtimeIso,
    source_index_path: sourceIndexPath,
    source_index_mtime_iso: sourceMtimeIso,
    source_dist_freshness: freshness,
    plugin_checkout_branch: branch,
    plugin_checkout_head_sha: headSha,
    cwd_vs_plugin_root: cwdRelation,
    recovery_hint: recoveryHint,
  };
}
