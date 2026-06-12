/** adv CLI — deterministic slop scan orchestration */

import { mkdir, readFile, readdir, stat } from "fs/promises";
import { readFileSync } from "fs";
import { dirname, isAbsolute, join, resolve } from "path";
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
} from "./runner";
import {
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

async function nearestPackageRoot(
  repoRoot: string,
  path: string,
): Promise<string> {
  let current = (await stat(path).catch(() => null))?.isFile()
    ? dirname(path)
    : path;
  const root = resolve(repoRoot);

  while (current.startsWith(root)) {
    try {
      if ((await stat(join(current, "package.json"))).isFile()) return current;
    } catch {
      // Keep walking toward the repository root.
    }

    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return repoRoot;
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
  const runner = createToolRunner();
  const findings: SlopScanFinding[] = [];
  const coverage: DetectorCoverage[] = [];
  const detectors = selectApplicableDetectors(
    createDetectorRegistry(),
    languages,
  );
  const packageRoot = await nearestPackageRoot(
    options.repoRoot,
    absoluteTarget,
  );

  for (const detector of detectors) {
    switch (detector.id) {
      case "eslint": {
        const result = await runner.run({
          detectorId: detector.id,
          command: buildEslintCommand(absoluteTarget, {
            complexity: config.complexity_threshold,
            maxDepth: config.nesting_depth_threshold,
          }),
          cwd: packageRoot,
          timeoutMs: config.ast_timeout_ms,
          findingsExitCodes: [1],
        });
        appendParsed(
          detector,
          result,
          () => normalizeEslintJson(result.stdout, options.repoRoot),
          findings,
          coverage,
        );
        break;
      }
      case "knip": {
        const result = await runner.run({
          detectorId: detector.id,
          command: buildKnipCommand(),
          cwd: packageRoot,
          timeoutMs: config.ast_timeout_ms,
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
          timeoutMs: config.ast_timeout_ms,
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
          timeoutMs: config.ast_timeout_ms,
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
          timeoutMs: config.ast_timeout_ms,
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
          timeoutMs: config.ast_timeout_ms,
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
          cwd: options.repoRoot,
          timeoutMs: config.ast_timeout_ms,
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
          cwd: options.repoRoot,
          timeoutMs: config.ast_timeout_ms,
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
  return report;
}

function readFileSyncText(path: string): string {
  return readFileSync(path, "utf8");
}
