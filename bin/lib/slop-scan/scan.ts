/** adv CLI — deterministic slop scan orchestration */

import { mkdir, readFile, readdir, stat } from "fs/promises";
import { readFileSync } from "fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "path";
import { tmpdir } from "os";

import { buildEslintCommand, normalizeEslintJson } from "./adapters/eslint";
import { buildKnipCommand, normalizeKnipJson } from "./adapters/knip";
import { buildRadonCommand, normalizeRadonJson } from "./adapters/radon";
import {
  buildVultureCommand,
  normalizeVultureOutput,
} from "./adapters/vulture";
import {
  buildGocycloCommand,
  normalizeGocycloOutput,
} from "./adapters/gocyclo";
import {
  buildGoDeadcodeCommand,
  normalizeGoDeadcodeOutput,
} from "./adapters/go-deadcode";
import { buildAstGrepCommand, normalizeAstGrepJson } from "./adapters/ast-grep";
import { buildJscpdCommand, normalizeJscpdJson } from "./adapters/jscpd";
import { toRepoRelative } from "./adapters/_paths";
import { normalizeSemgrepExternalCoverage } from "./adapters/external-ci";
import { readSlopScanConfig } from "./config";
import {
  createDetectorRegistry,
  selectApplicableDetectors,
  type DetectorDefinition,
} from "./registry";
import {
  createToolRunner,
  normalizeCoverageFromExecution,
  type ToolRunResult,
  type ToolRunner,
} from "./runner";
import {
  attachSlopScanFailure,
  buildEmptySlopScanReport,
  summarizeFindings,
  type DetectorCoverage,
  type SlopScanFinding,
  type SlopScanReport,
} from "./schema";

const EXTENSION_LANGUAGES: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".go": "go",
};

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "coverage",
  "temp",
  ".adv",
]);

export interface SlopScanOptions {
  repoRoot: string;
  requestedPath: string;
  runner?: ToolRunner;
  timeoutMs?: number;
}

async function collectLanguages(
  path: string,
  languages = new Set<string>(),
): Promise<Set<string>> {
  let info;
  try {
    info = await stat(path);
  } catch {
    return languages;
  }

  if (info.isFile()) {
    const dot = path.lastIndexOf(".");
    const ext = dot >= 0 ? path.slice(dot) : "";
    const language = EXTENSION_LANGUAGES[ext];
    if (language) languages.add(language);
    return languages;
  }

  if (!info.isDirectory()) return languages;
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
    await collectLanguages(join(path, entry.name), languages);
  }
  return languages;
}

function targetPath(repoRoot: string, requestedPath: string): string {
  return isAbsolute(requestedPath)
    ? requestedPath
    : resolve(repoRoot, requestedPath);
}

export type PackageRootResult =
  | { kind: "found"; cwd: string }
  | { kind: "ambiguous"; candidates: string[] };

const SOURCE_EXTENSIONS = new Set(Object.keys(EXTENSION_LANGUAGES));

/**
 * Walk a directory tree (bounded by SKIP_DIRS) and return true as soon as any
 * source file is found. Used to filter nested-package candidates so empty
 * package shells (e.g. `.opencode/`) are not picked as the package root.
 */
async function directoryContainsSource(dir: string): Promise<boolean> {
  let info;
  try {
    info = await stat(dir);
  } catch {
    return false;
  }
  if (!info.isDirectory()) return false;

  const stack: string[] = [dir];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const entryPath = join(current, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        stack.push(entryPath);
      } else if (entry.isFile()) {
        const dot = entry.name.lastIndexOf(".");
        if (dot >= 0 && SOURCE_EXTENSIONS.has(entry.name.slice(dot))) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * When walk-up fails to find a package.json, scan immediate subdirectories of
 * repoRoot for nested package roots. Skips SKIP_DIRS and any directory that
 * contains no source files. Returns absolute paths sorted alphabetically for
 * stable output.
 */
async function findNestedPackageRoots(repoRoot: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(repoRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  const candidates: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    const childPath = join(repoRoot, entry.name);
    const hasPackageJson = await stat(join(childPath, "package.json"))
      .then((s) => s.isFile())
      .catch(() => false);
    if (!hasPackageJson) continue;
    if (!(await directoryContainsSource(childPath))) continue;
    candidates.push(childPath);
  }
  candidates.sort();
  return candidates;
}

export async function nearestPackageRoot(
  repoRoot: string,
  path: string,
): Promise<PackageRootResult> {
  // Walk-up phase: resolves the package root for paths inside a package.
  let current = (await stat(path).catch(() => null))?.isFile()
    ? dirname(path)
    : path;
  const root = resolve(repoRoot);

  while (current.startsWith(root)) {
    try {
      if ((await stat(join(current, "package.json"))).isFile()) {
        return { kind: "found", cwd: current };
      }
    } catch {
      // Keep walking toward the repository root.
    }

    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  // Descent phase: when walk-up fails (target is at/above all packages), look
  // one level down into immediate subdirectories of repoRoot for a package
  // root. Handles the canonical monorepo / nested-plugin layout (ADV's plugin/).
  const candidates = await findNestedPackageRoots(repoRoot);
  if (candidates.length === 0) {
    // Preserve the existing fallback so pnpm's ERR_PNPM_NO_PKG_MANIFEST remains
    // the diagnostic when there is genuinely no package.json anywhere relevant.
    return { kind: "found", cwd: repoRoot };
  }
  if (candidates.length === 1) {
    return { kind: "found", cwd: candidates[0] };
  }
  return { kind: "ambiguous", candidates };
}

export type EslintTargetPartition = {
  covered: { configRoot: string; target: string }[];
  uncovered: string[];
};

async function reachableEslintConfigRoot(
  repoRoot: string,
  target: string,
): Promise<string | null> {
  const root = resolve(repoRoot);
  const absoluteTarget = resolve(target);
  const relativeTarget = relative(root, absoluteTarget);
  if (relativeTarget.startsWith("..") || isAbsolute(relativeTarget))
    return null;

  const targetInfo = await stat(absoluteTarget).catch(() => null);
  let current = targetInfo?.isFile() ? dirname(absoluteTarget) : absoluteTarget;

  while (true) {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      entries = [];
    }
    for (const entry of entries) {
      if (!entry.name.startsWith("eslint.config.")) continue;
      const configPath = join(current, entry.name);
      if (
        entry.isFile() ||
        (await stat(configPath).catch(() => null))?.isFile()
      ) {
        return current;
      }
    }

    if (current === root) break;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

/**
 * Partition an ESLint target into regions whose config lookup succeeds.
 * ESLint v10 resolves config from each target path, not from the process cwd.
 */
export async function partitionEslintTargets(
  repoRoot: string,
  absoluteTarget: string,
): Promise<EslintTargetPartition> {
  const root = resolve(repoRoot);
  const target = resolve(absoluteTarget);
  const grouped = new Map<string, string>();
  const uncovered: string[] = [];

  /**
   * Returns true when a covered region exists at or below `current`.
   *
   * Uncovered subtrees collapse to their shallowest directory so coverage
   * reports one entry per unlinted region rather than one per unlinted file.
   * Individual entries are only emitted for siblings of a covered region —
   * e.g. a loose source file at a repo root whose packages are linted.
   */
  async function visit(current: string): Promise<boolean> {
    const configRoot = await reachableEslintConfigRoot(root, current);
    if (configRoot) {
      if (!grouped.has(configRoot)) grouped.set(configRoot, current);
      return true;
    }

    const info = await stat(current).catch(() => null);
    if (info?.isFile()) {
      const dot = current.lastIndexOf(".");
      return dot >= 0 && SOURCE_EXTENSIONS.has(current.slice(dot))
        ? (pending.push(current), false)
        : false;
    }
    if (!info?.isDirectory()) return false;

    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return false;
    }

    const childPending: string[] = [];
    let anyCovered = false;
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      if (!entry.isDirectory() && !entry.isFile()) continue;
      const child = join(current, entry.name);
      const before = pending.length;
      if (await visit(child)) anyCovered = true;
      childPending.push(...pending.splice(before));
    }

    if (anyCovered) {
      // A sibling is linted, so report the unlinted siblings individually.
      pending.push(...childPending);
      return true;
    }

    // Nothing beneath this directory is linted — collapse to one entry.
    if (childPending.length > 0) pending.push(current);
    return false;
  }

  const pending: string[] = [];
  await visit(target);
  uncovered.push(...pending);

  const covered = [...grouped.entries()]
    .map(([childConfigRoot, child]) => ({
      configRoot: childConfigRoot,
      target: child,
    }))
    .sort((left, right) => left.target.localeCompare(right.target));
  uncovered.sort();
  return { covered, uncovered };
}

function coverageFailed(
  detector: DetectorDefinition,
  command: string[],
  reason: string,
): DetectorCoverage {
  return {
    id: detector.id,
    label: detector.label,
    state: "failed",
    reason,
    important: detector.important,
    command: command.join(" "),
  };
}

function ambiguousCoverageEntry(
  detector: DetectorDefinition,
  reason: string,
): DetectorCoverage {
  return {
    id: detector.id,
    label: detector.label,
    state: "failed",
    reason,
    important: detector.important,
  };
}

/**
 * Build an early-exit report when multiple nested package roots are detected
 * and the resolver cannot pick one deterministically. Required applicable
 * detectors are marked failed with the ambiguity reason; external coverage
 * (e.g. Semgrep PR gate) is still reported since it does not depend on the
 * package root.
 */
async function buildAmbiguousPackageRootReport(
  report: SlopScanReport,
  candidates: string[],
  detectors: DetectorDefinition[],
): Promise<SlopScanReport> {
  const candidateNames = candidates.map((c) => basename(c)).join(", ");
  const reason = `Multiple package.json roots found: ${candidateNames}. Pass an explicit path (e.g. \`bin/adv slop-scan <subdir>\`) for deterministic results.`;

  for (const detector of detectors) {
    if (detector.id === "external-ci-semgrep") {
      // External CI coverage does not depend on the package root; report it normally.
      report.coverage.detectors.push(
        await semgrepCoverage(report.scope.repoRoot),
      );
      continue;
    }
    report.coverage.detectors.push(ambiguousCoverageEntry(detector, reason));
  }

  report.coverage.falsePositiveProtections = [
    "Deletion candidates require review; no automatic deletion proof is emitted.",
    "Unavailable, failed, timed-out, or skipped detectors remain visible in coverage.",
  ];

  attachSlopScanFailure(report);
  // attachSlopScanFailure writes a generic degraded message; override with the
  // ambiguity-specific message so the operator sees the candidate list.
  if (report.failure) {
    report.failure.message = reason;
  }
  return report;
}

function appendParsed(
  detector: DetectorDefinition,
  result: ToolRunResult,
  parse: () => SlopScanFinding[],
  findings: SlopScanFinding[],
  coverage: DetectorCoverage[],
): void {
  if (result.status !== "success" && result.status !== "findings") {
    coverage.push(
      normalizeCoverageFromExecution(
        detector.id,
        detector.label,
        result,
        detector.important,
      ),
    );
    return;
  }

  try {
    const parsed = parse();
    findings.push(...parsed);
    const detectorCoverage = normalizeCoverageFromExecution(
      detector.id,
      detector.label,
      result,
      detector.important,
    );
    if (
      parsed.length > 0 &&
      detectorCoverage.reason === "completed with no findings"
    ) {
      detectorCoverage.reason = "completed with findings";
    }
    coverage.push(detectorCoverage);
  } catch (err) {
    coverage.push(
      coverageFailed(
        detector,
        result.command,
        err instanceof Error ? err.message : String(err),
      ),
    );
  }
}

async function semgrepCoverage(repoRoot: string): Promise<DetectorCoverage> {
  try {
    const workflow = await readFile(
      join(repoRoot, ".github/workflows/security-gates-pilot.yml"),
      "utf8",
    );
    return normalizeSemgrepExternalCoverage(workflow);
  } catch {
    return normalizeSemgrepExternalCoverage("");
  }
}

export async function runSlopScan(
  options: SlopScanOptions,
): Promise<SlopScanReport> {
  const absoluteTarget = targetPath(options.repoRoot, options.requestedPath);
  const languages = [...(await collectLanguages(absoluteTarget))].sort();
  const report = buildEmptySlopScanReport({
    repoRoot: options.repoRoot,
    requestedPath: options.requestedPath,
    languages,
  });
  const configResult = await readSlopScanConfig(options.repoRoot);
  const config = configResult.config;
  const runner = options.runner ?? createToolRunner();
  const findings: SlopScanFinding[] = [];
  const coverage: DetectorCoverage[] = [];
  const detectors = selectApplicableDetectors(
    createDetectorRegistry(),
    languages,
  );
  const packageRootResult = await nearestPackageRoot(
    options.repoRoot,
    absoluteTarget,
  );
  if (packageRootResult.kind === "ambiguous") {
    return buildAmbiguousPackageRootReport(
      report,
      packageRootResult.candidates,
      detectors,
    );
  }
  const packageRoot = packageRootResult.cwd;

  for (const detector of detectors) {
    switch (detector.id) {
      case "eslint": {
        const targets = await partitionEslintTargets(
          options.repoRoot,
          absoluteTarget,
        );
        const eslintCoverage: DetectorCoverage[] = [];
        const eslintRegions: { target: string; coverage: DetectorCoverage }[] =
          [];
        for (const { target } of targets.covered) {
          const result = await runner.run({
            detectorId: detector.id,
            command: buildEslintCommand(target, {
              complexity: config.complexity_threshold,
              maxDepth: config.nesting_depth_threshold,
            }),
            cwd: packageRoot,
            timeoutMs: options.timeoutMs ?? config.ast_timeout_ms,
            findingsExitCodes: [1],
          });
          appendParsed(
            detector,
            result,
            () => normalizeEslintJson(result.stdout, options.repoRoot),
            findings,
            eslintCoverage,
          );
          const regionCoverage = eslintCoverage.at(-1);
          if (regionCoverage)
            eslintRegions.push({ target, coverage: regionCoverage });
        }

        if (targets.covered.length === 0) {
          coverage.push({
            id: detector.id,
            label: detector.label,
            state: "unavailable",
            reason: `no eslint.config.* reachable from any region under ${options.requestedPath}`,
            important: detector.important,
          });
        } else {
          const ran = eslintRegions.find(
            ({ coverage: entry }) => entry.state === "run",
          );
          coverage.push(
            ran?.coverage ??
              eslintRegions[0]?.coverage ?? {
                id: detector.id,
                label: detector.label,
                state: "unavailable",
                reason: `no eslint.config.* reachable from any region under ${options.requestedPath}`,
                important: detector.important,
              },
          );
          for (const region of eslintRegions) {
            if (region === ran || region.coverage.state === "run") continue;
            coverage.push({
              ...region.coverage,
              id: `${detector.id}:${toRepoRelative(region.target, options.repoRoot)}`,
            });
          }
        }

        for (const uncovered of targets.uncovered) {
          const relativePath = toRepoRelative(uncovered, options.repoRoot);
          coverage.push({
            id: `${detector.id}:${relativePath}`,
            label: detector.label,
            state: "unavailable",
            reason: `no eslint.config.* reachable from ${relativePath}; region not linted`,
            important: false,
          });
        }
        break;
      }
      case "knip": {
        const result = await runner.run({
          detectorId: detector.id,
          command: buildKnipCommand(),
          cwd: packageRoot,
          timeoutMs: options.timeoutMs ?? config.ast_timeout_ms,
          findingsExitCodes: [1],
        });
        appendParsed(
          detector,
          result,
          () => normalizeKnipJson(result.stdout, options.repoRoot),
          findings,
          coverage,
        );
        break;
      }
      case "radon": {
        const result = await runner.run({
          detectorId: detector.id,
          command: buildRadonCommand(absoluteTarget),
          cwd: options.repoRoot,
          timeoutMs: options.timeoutMs ?? config.ast_timeout_ms,
        });
        appendParsed(
          detector,
          result,
          () => normalizeRadonJson(result.stdout, options.repoRoot),
          findings,
          coverage,
        );
        break;
      }
      case "vulture": {
        const result = await runner.run({
          detectorId: detector.id,
          command: buildVultureCommand(absoluteTarget),
          cwd: options.repoRoot,
          timeoutMs: options.timeoutMs ?? config.ast_timeout_ms,
          findingsExitCodes: [1, 3],
        });
        appendParsed(
          detector,
          result,
          () => normalizeVultureOutput(result.stdout),
          findings,
          coverage,
        );
        break;
      }
      case "gocyclo": {
        const result = await runner.run({
          detectorId: detector.id,
          command: buildGocycloCommand(
            absoluteTarget,
            config.complexity_threshold,
          ),
          cwd: options.repoRoot,
          timeoutMs: options.timeoutMs ?? config.ast_timeout_ms,
          findingsExitCodes: [1],
        });
        appendParsed(
          detector,
          result,
          () => normalizeGocycloOutput(result.stdout),
          findings,
          coverage,
        );
        break;
      }
      case "go-deadcode": {
        const result = await runner.run({
          detectorId: detector.id,
          command: buildGoDeadcodeCommand("./..."),
          cwd: options.repoRoot,
          timeoutMs: options.timeoutMs ?? config.ast_timeout_ms,
          findingsExitCodes: [1],
        });
        appendParsed(
          detector,
          result,
          () => normalizeGoDeadcodeOutput(result.stdout),
          findings,
          coverage,
        );
        break;
      }
      case "ast-grep": {
        const result = await runner.run({
          detectorId: detector.id,
          command: buildAstGrepCommand(absoluteTarget),
          cwd: packageRoot,
          timeoutMs: options.timeoutMs ?? config.ast_timeout_ms,
          findingsExitCodes: [1],
        });
        appendParsed(
          detector,
          result,
          () => normalizeAstGrepJson(result.stdout, options.repoRoot),
          findings,
          coverage,
        );
        break;
      }
      case "jscpd": {
        const outputDir = join(tmpdir(), `adv-slop-scan-${Date.now()}`);
        await mkdir(outputDir, { recursive: true });
        const result = await runner.run({
          detectorId: detector.id,
          command: buildJscpdCommand(absoluteTarget, outputDir),
          cwd: packageRoot,
          timeoutMs: options.timeoutMs ?? config.ast_timeout_ms,
          findingsExitCodes: [1],
        });
        appendParsed(
          detector,
          result,
          () =>
            normalizeJscpdJson(
              readFileSyncText(join(outputDir, "jscpd-report.json")),
            ),
          findings,
          coverage,
        );
        break;
      }
      case "external-ci-semgrep":
        coverage.push(await semgrepCoverage(options.repoRoot));
        break;
    }
  }

  report.findings = findings;
  report.summary = summarizeFindings(findings);
  report.coverage.detectors = coverage;
  report.coverage.falsePositiveProtections = [
    "Deletion candidates require review; no automatic deletion proof is emitted.",
    "Unavailable, failed, timed-out, or skipped detectors remain visible in coverage.",
  ];
  if (!configResult.ok)
    report.coverage.falsePositiveProtections.push(...configResult.errors);
  report.coverage.falsePositiveProtections.push(...configResult.warnings);
  attachSlopScanFailure(report);
  return report;
}

function readFileSyncText(path: string): string {
  return readFileSync(path, "utf8");
}
