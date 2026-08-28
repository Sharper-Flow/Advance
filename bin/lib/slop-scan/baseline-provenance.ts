/** Guarded, provenance-only writer for the reviewed Knip baseline. */

import { createHash, randomUUID } from "crypto";
import { dirname, join } from "path";
import { open, readFile, unlink, writeFile, rename } from "fs/promises";

import { buildKnipCommand, normalizeKnipJson } from "./adapters/knip";
import { deadCodeFingerprint, isDeadCodeFinding } from "./ratchet";
import { createToolRunner, type ToolRunner } from "./runner";
import type { SlopScanFinding } from "./schema";

export const PROVENANCE_REFRESH_COMMAND = "dead-code:provenance:refresh";
const REFRESH_TIMEOUT_MS = 120_000;
const MAX_DIAGNOSTICS = 20;
const MAX_ATOMIC_DIAGNOSTIC_CHARS = 2_000;

export interface BaselineArtifact {
  schema_version: "dead_code_baseline.v1";
  scope: {
    repo: "plugin";
    detector: "knip";
    finding_id: "MAINT-003";
    classification: "review-only";
  };
  provenance: {
    knip_config_sha256: string;
    entry_roots: string[];
    project_patterns: string[];
    git_head: string;
    fingerprint_count: number;
    kind_counts: Record<string, number>;
    review_basis: {
      classification: "review-only";
      deletion_owner: string;
      deletion_authority: false;
      provenance_refresh_owner?: string;
    };
    coverage_review: {
      before: CoverageReview;
      after: CoverageReview;
      unchanged_reason: string;
    };
  };
  fingerprints: string[];
}

export interface CoverageReview {
  entry_roots: string[];
  normalized_finding_count: number;
  dead_code_fingerprint_count: number;
}

export interface PlannerInput {
  baseline: BaselineArtifact;
  currentConfig: Record<string, unknown>;
  reconstructedConfig: Record<string, unknown>;
  currentConfigHash: string;
  gitHead: string;
  beforeFindings: SlopScanFinding[];
  afterFindings: SlopScanFinding[];
  repoRoot: string;
}

export interface ProvenanceComparison {
  normalizedFindingCount: number;
  deadCodeFingerprintCount: number;
  added: string[];
  removed: string[];
  addedOmitted: number;
  removedOmitted: number;
}

export type PlannerResult =
  | {
      status: "refreshed";
      diagnostics: string[];
      comparison: ProvenanceComparison;
      artifact: BaselineArtifact;
    }
  | {
      status: "refused" | "blocked";
      diagnostics: string[];
      comparison?: ProvenanceComparison;
      artifact?: undefined;
    };

export type ProvenanceRefreshStatus =
  | "current"
  | "refreshed"
  | "refused"
  | "blocked";

export interface ProvenanceRefreshResult {
  status: ProvenanceRefreshStatus;
  diagnostics: string[];
  comparison?: ProvenanceComparison;
}

export interface RefreshOptions {
  baselinePath: string;
  configPath: string;
  pluginRoot: string;
  readText?: (path: string) => Promise<string>;
  readGitHead?: (cwd: string) => Promise<string>;
  runner?: ToolRunner;
  writeAtomic?: (
    path: string,
    content: string,
    priorContent: string,
  ) => Promise<void>;
  syncDirectory?: (path: string) => Promise<void>;
  cleanupTemporary?: (path: string) => Promise<void>;
}

function codePointCompare(left: string, right: string): number {
  const leftPoints = [...left];
  const rightPoints = [...right];
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    const leftPoint = leftPoints[index]?.codePointAt(0) ?? 0;
    const rightPoint = rightPoints[index]?.codePointAt(0) ?? 0;
    if (leftPoint !== rightPoint) return leftPoint - rightPoint;
  }
  return leftPoints.length - rightPoints.length;
}

export function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => codePointCompare(left, right))
        .map(([key, item]) => [key, canonicalJson(item)]),
    );
  }
  return value;
}

export function knipConfigSha256(config: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalJson(config)))
    .digest("hex");
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function validateBaseline(value: BaselineArtifact): string[] {
  const issues: string[] = [];
  if (
    !value.scope ||
    value.scope.repo !== "plugin" ||
    value.scope.detector !== "knip" ||
    value.scope.finding_id !== "MAINT-003" ||
    value.scope.classification !== "review-only"
  ) {
    issues.push("baseline scope is invalid");
  }
  if (value.schema_version !== "dead_code_baseline.v1")
    issues.push("baseline schema_version is invalid");
  if (!value.provenance || typeof value.provenance !== "object") {
    return ["baseline provenance is required"];
  }
  if (!isStringArray(value.provenance.entry_roots))
    issues.push("baseline entry_roots must be an array");
  if (!isStringArray(value.provenance.project_patterns))
    issues.push("baseline project_patterns must be an array");
  if (!/^[0-9a-f]{64}$/.test(value.provenance.knip_config_sha256))
    issues.push(
      "baseline Knip config hash must be lowercase hexadecimal SHA-256",
    );
  if (!/^[0-9a-f]{40}$/.test(value.provenance.git_head))
    issues.push("baseline Git HEAD must be a 40-character SHA-1");
  const fingerprints = isStringArray(value.fingerprints)
    ? value.fingerprints
    : undefined;
  if (!fingerprints) {
    issues.push("baseline fingerprints must be an array of strings");
  }
  if (
    !value.provenance.review_basis ||
    value.provenance.review_basis.classification !== "review-only" ||
    value.provenance.review_basis.deletion_owner !== "clearDeadCodeBaseline" ||
    value.provenance.review_basis.deletion_authority !== false ||
    (value.provenance.review_basis.provenance_refresh_owner !== undefined &&
      value.provenance.review_basis.provenance_refresh_owner !==
        PROVENANCE_REFRESH_COMMAND)
  ) {
    issues.push("baseline review authority is invalid");
  }
  if (
    !value.provenance.coverage_review ||
    typeof value.provenance.coverage_review !== "object"
  ) {
    issues.push("baseline coverage_review is required");
  } else {
    for (const [label, review] of Object.entries(
      value.provenance.coverage_review,
    )) {
      if (label === "unchanged_reason") continue;
      if (
        !review ||
        typeof review !== "object" ||
        !isStringArray((review as { entry_roots?: unknown }).entry_roots) ||
        typeof (review as { normalized_finding_count?: unknown })
          .normalized_finding_count !== "number" ||
        typeof (review as { dead_code_fingerprint_count?: unknown })
          .dead_code_fingerprint_count !== "number"
      ) {
        issues.push(`baseline coverage_review.${label} is invalid`);
      }
    }
    if (typeof value.provenance.coverage_review.unchanged_reason !== "string") {
      issues.push("baseline coverage_review.unchanged_reason is required");
    }
  }
  if (fingerprints) {
    if (
      fingerprints.some(
        (item, index) =>
          index > 0 && codePointCompare(fingerprints[index - 1], item) >= 0,
      )
    ) {
      issues.push("baseline fingerprints must be sorted and unique");
    }
    if (value.provenance.fingerprint_count !== fingerprints.length) {
      issues.push("baseline fingerprint_count does not match fingerprints");
    }
    const kindCounts = fingerprintKindCounts(fingerprints);
    if (kindCounts === undefined)
      issues.push("baseline fingerprints contain invalid JSON");
    else if (
      JSON.stringify(kindCounts) !==
      JSON.stringify(value.provenance.kind_counts)
    ) {
      issues.push("baseline kind_counts do not match fingerprints");
    }
    for (const fingerprint of fingerprints) {
      try {
        const parsed: unknown = JSON.parse(fingerprint);
        if (
          parsed === null ||
          typeof parsed !== "object" ||
          Array.isArray(parsed)
        ) {
          issues.push("baseline fingerprints contain invalid identity fields");
          break;
        }
        const identity = parsed as Record<string, unknown>;
        if (
          identity.id !== "MAINT-003" ||
          typeof identity.name !== "string" ||
          typeof identity.file !== "string" ||
          typeof identity.description !== "string"
        ) {
          issues.push("baseline fingerprints contain invalid identity fields");
          break;
        }
      } catch (error) {
        if (error instanceof SyntaxError) {
          issues.push("baseline fingerprints contain invalid JSON");
          break;
        }
        throw error;
      }
    }
  }
  const coverage = value.provenance.coverage_review;
  if (coverage && typeof coverage === "object") {
    const before = coverage.before;
    const after = coverage.after;
    const recordedEntryRoots = isStringArray(value.provenance.entry_roots)
      ? value.provenance.entry_roots
      : undefined;
    const validCounts =
      Number.isInteger(before?.normalized_finding_count) &&
      Number.isInteger(after?.normalized_finding_count) &&
      Number.isInteger(before?.dead_code_fingerprint_count) &&
      Number.isInteger(after?.dead_code_fingerprint_count) &&
      before.normalized_finding_count > 0 &&
      after.normalized_finding_count > 0 &&
      before.dead_code_fingerprint_count > 0 &&
      after.dead_code_fingerprint_count > 0 &&
      before.normalized_finding_count === after.normalized_finding_count &&
      before.dead_code_fingerprint_count === after.dead_code_fingerprint_count;
    if (!validCounts) issues.push("baseline coverage counts are invalid");
    if (
      !isStringArray(before?.entry_roots) ||
      !isStringArray(after?.entry_roots) ||
      !recordedEntryRoots ||
      before.entry_roots.length >= after.entry_roots.length ||
      !before.entry_roots.every((root) => after.entry_roots.includes(root)) ||
      !sameStrings(after.entry_roots, recordedEntryRoots)
    ) {
      issues.push("baseline coverage roots are not a strict historical subset");
    }
    if (
      typeof coverage.unchanged_reason !== "string" ||
      !coverage.unchanged_reason.toLowerCase().includes("exact")
    ) {
      issues.push("baseline coverage reason is invalid");
    }
  }
  return issues;
}

function fingerprintKindCounts(
  fingerprints: string[],
): Record<string, number> | undefined {
  const counts: Record<string, number> = {};
  try {
    for (const fingerprint of fingerprints) {
      const parsed: unknown = JSON.parse(fingerprint);
      if (
        parsed === null ||
        typeof parsed !== "object" ||
        Array.isArray(parsed) ||
        typeof (parsed as { name?: unknown }).name !== "string"
      ) {
        return undefined;
      }
      const name = (parsed as { name: string }).name;
      counts[name] = (counts[name] ?? 0) + 1;
    }
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) =>
      codePointCompare(left, right),
    ),
  );
}

function sameStrings(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function currentProvenanceMatches(
  baseline: BaselineArtifact,
  currentConfig: Record<string, unknown>,
  currentConfigHash: string,
): boolean {
  const currentEntry = currentConfig.entry;
  const currentProject = currentConfig.project;
  if (!isStringArray(currentEntry) || !isStringArray(currentProject))
    return false;
  const coverage = baseline.provenance.coverage_review;
  const before = coverage.before;
  const after = coverage.after;
  const expectedReason = `Independent before/after normalized-set comparison was exact. Both scans produced ${after.normalized_finding_count} normalized findings and ${after.dead_code_fingerprint_count} dead-code fingerprints, with zero added and removed values.`;
  return (
    baseline.provenance.knip_config_sha256 === currentConfigHash &&
    sameStrings(baseline.provenance.entry_roots, currentEntry) &&
    sameStrings(baseline.provenance.project_patterns, currentProject) &&
    baseline.provenance.review_basis.provenance_refresh_owner ===
      PROVENANCE_REFRESH_COMMAND &&
    sameStrings(after.entry_roots, currentEntry) &&
    before.entry_roots.length < after.entry_roots.length &&
    before.entry_roots.every((root) => after.entry_roots.includes(root)) &&
    before.normalized_finding_count > 0 &&
    before.normalized_finding_count === after.normalized_finding_count &&
    before.dead_code_fingerprint_count > 0 &&
    before.dead_code_fingerprint_count === after.dead_code_fingerprint_count &&
    coverage.unchanged_reason === expectedReason &&
    baseline.provenance.fingerprint_count === baseline.fingerprints.length &&
    JSON.stringify(baseline.provenance.kind_counts) ===
      JSON.stringify(fingerprintKindCounts(baseline.fingerprints))
  );
}

function findingKey(finding: SlopScanFinding): string {
  return JSON.stringify(canonicalJson(finding));
}

function deadCodeFingerprintSet(
  findings: SlopScanFinding[],
  repoRoot: string,
): Set<string> {
  return new Set(
    findings
      .filter(isDeadCodeFinding)
      .map((finding) => deadCodeFingerprint(finding, repoRoot)),
  );
}

function difference(left: Set<string>, right: Set<string>): string[] {
  return [...left].filter((item) => !right.has(item)).sort(codePointCompare);
}

function bounded(values: string[]): { values: string[]; omitted: number } {
  return {
    values: values.slice(0, MAX_DIAGNOSTICS),
    omitted: Math.max(0, values.length - MAX_DIAGNOSTICS),
  };
}

function compareFindings(input: PlannerInput): ProvenanceComparison {
  const beforeKeys = new Set(input.beforeFindings.map(findingKey));
  const afterKeys = new Set(input.afterFindings.map(findingKey));
  const beforeDead = deadCodeFingerprintSet(
    input.beforeFindings,
    input.repoRoot,
  );
  const afterDead = deadCodeFingerprintSet(input.afterFindings, input.repoRoot);
  const deadAdded = difference(afterDead, beforeDead);
  const deadRemoved = difference(beforeDead, afterDead);
  const allAdded = [
    ...new Set([...difference(afterKeys, beforeKeys), ...deadAdded]),
  ];
  const allRemoved = [
    ...new Set([...difference(beforeKeys, afterKeys), ...deadRemoved]),
  ];
  const boundedAdded = bounded(allAdded);
  const boundedRemoved = bounded(allRemoved);

  return {
    normalizedFindingCount: input.afterFindings.length,
    deadCodeFingerprintCount: afterDead.size,
    added: boundedAdded.values,
    removed: boundedRemoved.values,
    addedOmitted: boundedAdded.omitted,
    removedOmitted: boundedRemoved.omitted,
  };
}

function refusalDiagnostics(
  comparison: ProvenanceComparison,
  input: PlannerInput,
): string[] {
  const diagnostics = [
    ...comparison.added.map((item) => `added finding: ${item}`),
    ...comparison.removed.map((item) => `removed finding: ${item}`),
  ];
  if (comparison.addedOmitted > 0)
    diagnostics.push(`${comparison.addedOmitted} added value(s) omitted`);
  if (comparison.removedOmitted > 0)
    diagnostics.push(`${comparison.removedOmitted} removed value(s) omitted`);
  if (input.beforeFindings.length !== input.afterFindings.length) {
    diagnostics.push(
      `raw finding counts differ: ${input.beforeFindings.length} before, ${input.afterFindings.length} after`,
    );
  }
  const beforeDeadCount = deadCodeFingerprintSet(
    input.beforeFindings,
    input.repoRoot,
  ).size;
  const afterDeadCount = deadCodeFingerprintSet(
    input.afterFindings,
    input.repoRoot,
  ).size;
  if (beforeDeadCount !== afterDeadCount) {
    diagnostics.push(
      `raw dead-code counts differ: ${beforeDeadCount} before, ${afterDeadCount} after`,
    );
  }
  return diagnostics.length > 0
    ? diagnostics
    : ["normalized finding sets differ"];
}

function unchangedReason(comparison: ProvenanceComparison): string {
  return `Independent before/after normalized-set comparison was exact. Both scans produced ${comparison.normalizedFindingCount} normalized findings and ${comparison.deadCodeFingerprintCount} dead-code fingerprints, with zero added and removed values.`;
}

export function planDeadCodeProvenanceRefresh(
  input: PlannerInput,
): PlannerResult {
  const baselineIssues = validateBaseline(input.baseline);
  if (baselineIssues.length > 0)
    return { status: "blocked", diagnostics: baselineIssues };
  const currentEntry = input.currentConfig.entry;
  const currentProject = input.currentConfig.project;
  if (!isStringArray(currentEntry) || !isStringArray(currentProject)) {
    return {
      status: "blocked",
      diagnostics: ["current Knip config entry and project must be arrays"],
    };
  }
  if (
    input.baseline.provenance.entry_roots.some(
      (root) => !currentEntry.includes(root),
    )
  ) {
    return {
      status: "refused",
      diagnostics: ["current Knip config removed a recorded entry root"],
    };
  }
  if (
    knipConfigSha256(input.reconstructedConfig) !==
    input.baseline.provenance.knip_config_sha256
  ) {
    return {
      status: "refused",
      diagnostics: [
        "reconstructed Knip configuration hash does not match recorded provenance",
      ],
    };
  }
  if (
    JSON.stringify(input.baseline.provenance.project_patterns) !==
    JSON.stringify(currentProject)
  ) {
    return {
      status: "refused",
      diagnostics: ["Knip project patterns changed"],
    };
  }
  if (!/^[0-9a-f]{40}$/.test(input.gitHead)) {
    return {
      status: "blocked",
      diagnostics: ["Git HEAD must be a 40-character SHA-1"],
    };
  }

  const comparison = compareFindings(input);
  const beforeDeadCount = deadCodeFingerprintSet(
    input.beforeFindings,
    input.repoRoot,
  ).size;
  const afterDeadCount = deadCodeFingerprintSet(
    input.afterFindings,
    input.repoRoot,
  ).size;
  if (
    input.beforeFindings.length === 0 ||
    input.afterFindings.length === 0 ||
    beforeDeadCount === 0 ||
    afterDeadCount === 0
  ) {
    return {
      status: "blocked",
      diagnostics: [
        "Knip comparison must contain normalized findings and dead-code fingerprints",
      ],
      comparison,
    };
  }
  if (
    comparison.added.length > 0 ||
    comparison.removed.length > 0 ||
    comparison.addedOmitted > 0 ||
    comparison.removedOmitted > 0 ||
    input.beforeFindings.length !== input.afterFindings.length ||
    beforeDeadCount !== afterDeadCount
  ) {
    return {
      status: "refused",
      diagnostics: refusalDiagnostics(comparison, input),
      comparison,
    };
  }

  const artifact = clone(input.baseline);
  artifact.provenance.knip_config_sha256 = input.currentConfigHash;
  artifact.provenance.entry_roots = [...currentEntry];
  artifact.provenance.git_head = input.gitHead;
  artifact.provenance.coverage_review = {
    before: {
      entry_roots: [...input.baseline.provenance.entry_roots],
      normalized_finding_count: input.beforeFindings.length,
      dead_code_fingerprint_count: beforeDeadCount,
    },
    after: {
      entry_roots: [...currentEntry],
      normalized_finding_count: input.afterFindings.length,
      dead_code_fingerprint_count: afterDeadCount,
    },
    unchanged_reason: unchangedReason(comparison),
  };
  artifact.provenance.review_basis.provenance_refresh_owner =
    PROVENANCE_REFRESH_COMMAND;
  const candidateIssues = validateBaseline(artifact);
  if (candidateIssues.length > 0) {
    return {
      status: "blocked",
      diagnostics: candidateIssues.map((issue) => `candidate ${issue}`),
      comparison,
    };
  }
  return { status: "refreshed", diagnostics: [], comparison, artifact };
}

function parseJson(
  raw: string,
  label: string,
): { value?: unknown; diagnostic?: string } {
  try {
    return { value: JSON.parse(raw) };
  } catch (error) {
    return {
      diagnostic: `${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function normalizeKnipOutput(raw: string, repoRoot: string): SlopScanFinding[] {
  const parsed = JSON.parse(raw) as unknown;
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    !Array.isArray((parsed as { issues?: unknown }).issues)
  ) {
    throw new Error("Knip report must contain an issues array");
  }
  return normalizeKnipJson(raw, repoRoot);
}

function fingerprintSection(raw: string): string {
  const keyStart = raw.indexOf('"fingerprints"');
  if (keyStart < 0) return "";
  const arrayStart = raw.indexOf("[", keyStart);
  if (arrayStart < 0) return "";
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = arrayStart; index < raw.length; index += 1) {
    const character = raw[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === "[") depth += 1;
    else if (character === "]") {
      depth -= 1;
      if (depth === 0) return raw.slice(keyStart, index + 1);
    }
  }
  return "";
}

async function defaultReadGitHead(cwd: string): Promise<string> {
  const subprocess = Bun.spawn(["git", "rev-parse", "HEAD"], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, exitCode] = await Promise.all([
    new Response(subprocess.stdout).text(),
    subprocess.exited,
  ]);
  if (exitCode !== 0)
    throw new Error(`git rev-parse HEAD exited with ${exitCode}`);
  return stdout.trim();
}

async function syncDirectory(path: string): Promise<void> {
  const directory = await open(dirname(path), "r");
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

async function removeTemporary(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    if (
      error !== null &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return;
    }
    throw error;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function boundedAtomicDiagnostic(parts: string[]): string {
  return parts.join("; ").slice(0, MAX_ATOMIC_DIAGNOSTIC_CHARS);
}

async function cleanupAtomicTemporaries(paths: string[]): Promise<string[]> {
  const issues: string[] = [];
  for (const path of paths) {
    try {
      await removeTemporary(path);
    } catch (error) {
      issues.push(
        `temporary cleanup failed for ${path}: ${errorMessage(error)}`,
      );
    }
  }
  return issues;
}

async function defaultAtomicWrite(
  path: string,
  content: string,
  priorContent: string,
  sync: (path: string) => Promise<void> = syncDirectory,
): Promise<void> {
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  const rollbackPath = `${path}.${process.pid}.${randomUUID()}.rollback.tmp`;
  try {
    await writeFile(temporaryPath, content, "utf8");
    const file = await open(temporaryPath, "r");
    try {
      await file.sync();
    } finally {
      await file.close();
    }

    await writeFile(rollbackPath, priorContent, "utf8");
    const rollbackFile = await open(rollbackPath, "r");
    try {
      await rollbackFile.sync();
    } finally {
      await rollbackFile.close();
    }
    await rename(temporaryPath, path);
  } catch (error) {
    const cleanupIssues = await cleanupAtomicTemporaries([
      temporaryPath,
      rollbackPath,
    ]);
    throw new Error(
      boundedAtomicDiagnostic([
        `atomic replacement failed before commit: ${errorMessage(error)}`,
        ...cleanupIssues,
      ]),
      { cause: error },
    );
  }

  try {
    await sync(path);
  } catch (error) {
    const issues = [
      `directory synchronization failed after replacement: ${errorMessage(error)}`,
    ];
    let priorRestored = false;
    try {
      await rename(rollbackPath, path);
      priorRestored = true;
    } catch (rollbackError) {
      issues.push(
        `rollback replacement failed: ${errorMessage(rollbackError)}`,
      );
    }
    if (priorRestored) {
      try {
        await sync(path);
      } catch (rollbackSyncError) {
        issues.push(
          `rollback directory synchronization failed after prior bytes were restored: ${errorMessage(rollbackSyncError)}`,
        );
      }
    }
    issues.push(
      ...(await cleanupAtomicTemporaries([temporaryPath, rollbackPath])),
    );
    throw new Error(boundedAtomicDiagnostic(issues), { cause: error });
  }

  const cleanupIssues = await cleanupAtomicTemporaries([
    temporaryPath,
    rollbackPath,
  ]);
  if (cleanupIssues.length > 0)
    throw new Error(boundedAtomicDiagnostic(cleanupIssues));
}

function snapshotPath(pluginRoot: string, label: string): string {
  return join(
    pluginRoot,
    `.knip-provenance-${label}-${process.pid}-${randomUUID()}.json`,
  );
}

function executionDiagnostic(
  label: string,
  result: { status: string; error?: string; stderr: string },
): string {
  return `${label} Knip run ${result.status}: ${result.error ?? (result.stderr || "no diagnostic")}`;
}

export async function refreshDeadCodeBaselineProvenance(
  options: RefreshOptions,
): Promise<ProvenanceRefreshResult> {
  const read = options.readText ?? ((path: string) => readFile(path, "utf8"));
  let baselineRaw: string;
  let configRaw: string;
  let initialHead: string;
  try {
    [baselineRaw, configRaw, initialHead] = await Promise.all([
      read(options.baselinePath),
      read(options.configPath),
      (options.readGitHead ?? defaultReadGitHead)(options.pluginRoot),
    ]);
  } catch (error) {
    return {
      status: "blocked",
      diagnostics: [
        `refresh input failed: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }
  const baselineParsed = parseJson(baselineRaw, "baseline");
  const configParsed = parseJson(configRaw, "Knip config");
  if (baselineParsed.diagnostic || configParsed.diagnostic) {
    return {
      status: "blocked",
      diagnostics: [baselineParsed.diagnostic, configParsed.diagnostic].filter(
        (item): item is string => Boolean(item),
      ),
    };
  }
  if (
    !baselineParsed.value ||
    typeof baselineParsed.value !== "object" ||
    !configParsed.value ||
    typeof configParsed.value !== "object"
  ) {
    return {
      status: "blocked",
      diagnostics: ["baseline and Knip config must be objects"],
    };
  }
  const baseline = baselineParsed.value as BaselineArtifact;
  const currentConfig = configParsed.value as Record<string, unknown>;
  const baselineIssues = validateBaseline(baseline);
  if (baselineIssues.length > 0) {
    return { status: "blocked", diagnostics: baselineIssues };
  }
  if (
    !isStringArray(currentConfig.entry) ||
    !isStringArray(currentConfig.project)
  ) {
    return {
      status: "blocked",
      diagnostics: ["current Knip config entry and project must be arrays"],
    };
  }
  const reconstructedConfig = clone(currentConfig);
  reconstructedConfig.entry = [...(baseline.provenance?.entry_roots ?? [])];
  const currentConfigHash = knipConfigSha256(currentConfig);
  if (
    baseline.provenance.review_basis.provenance_refresh_owner === undefined &&
    baseline.provenance.knip_config_sha256 === currentConfigHash &&
    sameStrings(baseline.provenance.entry_roots, currentConfig.entry) &&
    sameStrings(baseline.provenance.project_patterns, currentConfig.project)
  ) {
    return {
      status: "blocked",
      diagnostics: ["baseline is missing the provenance refresh owner"],
    };
  }
  if (currentProvenanceMatches(baseline, currentConfig, currentConfigHash)) {
    return { status: "current", diagnostics: [] };
  }
  if (
    knipConfigSha256(reconstructedConfig) !==
    baseline.provenance.knip_config_sha256
  ) {
    return {
      status: "refused",
      diagnostics: [
        "reconstructed Knip configuration hash does not match recorded provenance",
      ],
    };
  }
  if (
    JSON.stringify(baseline.provenance.project_patterns) !==
    JSON.stringify(currentConfig.project)
  ) {
    return {
      status: "refused",
      diagnostics: ["Knip project patterns changed"],
    };
  }
  const beforePath = snapshotPath(options.pluginRoot, "before");
  const afterPath = snapshotPath(options.pluginRoot, "after");
  const runner = options.runner ?? createToolRunner();
  let operationResult: ProvenanceRefreshResult | undefined;
  const record = (result: ProvenanceRefreshResult): ProvenanceRefreshResult => {
    operationResult = result;
    return result;
  };
  try {
    await Promise.all([
      writeFile(
        beforePath,
        JSON.stringify(reconstructedConfig, null, 2) + "\n",
        "utf8",
      ),
      writeFile(
        afterPath,
        JSON.stringify(currentConfig, null, 2) + "\n",
        "utf8",
      ),
    ]);
    const [before, after] = await Promise.all([
      runner.run({
        detectorId: "knip:before",
        command: [...buildKnipCommand(), "--config", beforePath],
        cwd: options.pluginRoot,
        timeoutMs: REFRESH_TIMEOUT_MS,
        findingsExitCodes: [1],
      }),
      runner.run({
        detectorId: "knip:after",
        command: [...buildKnipCommand(), "--config", afterPath],
        cwd: options.pluginRoot,
        timeoutMs: REFRESH_TIMEOUT_MS,
        findingsExitCodes: [1],
      }),
    ]);
    for (const [label, result] of [
      ["before", before],
      ["after", after],
    ] as const) {
      if (result.status !== "success" && result.status !== "findings") {
        return record({
          status: "blocked",
          diagnostics: [executionDiagnostic(label, result)],
        });
      }
    }
    let beforeFindings: SlopScanFinding[];
    let afterFindings: SlopScanFinding[];
    try {
      beforeFindings = normalizeKnipOutput(before.stdout, options.pluginRoot);
      afterFindings = normalizeKnipOutput(after.stdout, options.pluginRoot);
    } catch (error) {
      return record({
        status: "blocked",
        diagnostics: [
          `Knip output is invalid: ${error instanceof Error ? error.message : String(error)}`,
        ],
      });
    }
    const [latestBaselineRaw, latestConfigRaw, latestHead] = await Promise.all([
      read(options.baselinePath),
      read(options.configPath),
      (options.readGitHead ?? defaultReadGitHead)(options.pluginRoot),
    ]);
    if (latestBaselineRaw !== baselineRaw || latestConfigRaw !== configRaw) {
      return record({
        status: "blocked",
        diagnostics: ["baseline or Knip config changed during refresh"],
      });
    }
    if (latestHead !== initialHead)
      return record({
        status: "blocked",
        diagnostics: ["Git HEAD changed during refresh"],
      });
    const plan = planDeadCodeProvenanceRefresh({
      baseline,
      currentConfig,
      reconstructedConfig,
      currentConfigHash,
      gitHead: initialHead,
      beforeFindings,
      afterFindings,
      repoRoot: options.pluginRoot,
    });
    if (plan.status !== "refreshed" || !plan.artifact || !plan.comparison)
      return record(plan);
    const output = JSON.stringify(plan.artifact, null, 2) + "\n";
    if (fingerprintSection(baselineRaw) !== fingerprintSection(output)) {
      return record({
        status: "refused",
        diagnostics: ["fingerprint section changed during provenance refresh"],
        comparison: plan.comparison,
      });
    }
    if (output === baselineRaw)
      return record({
        status: "current",
        diagnostics: [],
        comparison: plan.comparison,
      });
    await (
      options.writeAtomic ??
      ((path, content, priorContent) =>
        defaultAtomicWrite(path, content, priorContent, options.syncDirectory))
    )(options.baselinePath, output, baselineRaw);
    return record({
      status: "refreshed",
      diagnostics: [],
      comparison: plan.comparison,
    });
  } catch (error) {
    return record({
      status: "blocked",
      diagnostics: [
        `provenance refresh failed: ${error instanceof Error ? error.message : String(error)}`,
      ],
    });
  } finally {
    const cleanup = options.cleanupTemporary ?? removeTemporary;
    const cleanupResults = await Promise.all(
      [beforePath, afterPath].map(async (path) => {
        try {
          await cleanup(path);
          return undefined;
        } catch (error) {
          return `temporary file cleanup failed: ${error instanceof Error ? error.message : String(error)}`;
        }
      }),
    );
    const cleanupIssues = cleanupResults.filter(
      (issue): issue is string => issue !== undefined,
    );
    if (cleanupIssues.length > 0 && operationResult) {
      if (
        operationResult.status === "current" ||
        operationResult.status === "refreshed"
      ) {
        operationResult.diagnostics = [
          ...operationResult.diagnostics,
          ...cleanupIssues,
        ].slice(0, MAX_DIAGNOSTICS);
      } else {
        operationResult.status = "blocked";
        operationResult.diagnostics = cleanupIssues.slice(0, MAX_DIAGNOSTICS);
      }
    }
  }
}

export function provenanceRefreshExitCode(
  result: ProvenanceRefreshResult,
): number {
  if (result.status === "current" || result.status === "refreshed") return 0;
  if (result.status === "refused") return 1;
  return 2;
}
