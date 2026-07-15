/**
 * Explicit MCP invocation runtime matrix (rq: updateCodemodeMcpContracts).
 *
 * Deterministic model of the mode-neutral active-surface contract carried by
 * every MCP-capable Advance agent prompt (see prompt-corpus.ts):
 *
 *   - CodeMode `execute` exposed + capability in the generated catalog
 *       -> invoke through the exact catalog path (`tools.<ns>.<name>` or
 *          `tools.<ns>["<name>"]` when the exposed name is not
 *          identifier-safe).
 *   - Capability exposed as a direct callable (`<ns>_<name>`)
 *       -> invoke the direct callable exactly as exposed.
 *   - Neither surface exposes the capability
 *       -> report unavailable; never attempt a nonexistent callable.
 *
 * Identifiers are used exactly as exposed. A punctuated tail such as
 * `resolve-library-id` keeps its hyphen in every form; nothing is ever
 * normalized (e.g. `resolve_library_id` is a contract violation).
 */

import { readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MATRIX_FIXTURE_PATH = join(
  REPO_ROOT,
  "plugin/src/__fixtures__/mcp-runtime-matrix.json",
);
const LIVE_EVIDENCE_PATH = join(
  REPO_ROOT,
  "plugin/src/__fixtures__/mcp-runtime-live-evidence.json",
);

/** JS identifier-safe segment: legal in dot form without bracket quoting. */
const IDENTIFIER_SAFE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export function isIdentifierSafe(segment: string): boolean {
  return IDENTIFIER_SAFE.test(segment);
}

/** One external MCP capability as exposed by the active surface. */
export interface McpCapability {
  namespace: string;
  name: string;
}

/**
 * The MCP-relevant tool surface a session actually exposes. Prose and
 * environment flags never populate this; only machine-observed exposure does.
 */
export interface McpSurface {
  /** True when the session exposes the CodeMode `execute` tool. */
  executeExposed: boolean;
  /** External MCP entries in the generated catalog, exactly as returned. */
  catalog: McpCapability[];
  /** Directly exposed external MCP callable names (`<ns>_<name>`). */
  directCallables: string[];
}

export type McpInvocation =
  | { mode: "codemode-catalog"; expression: string }
  | { mode: "direct"; expression: string }
  | { mode: "unavailable"; reason: string };

/** Exact CodeMode catalog path for an exposed entry; bracket form when the
 *  exposed name is not identifier-safe. Never normalizes the segments. */
export function catalogExpression(entry: McpCapability): string {
  const namespace = isIdentifierSafe(entry.namespace)
    ? `.${entry.namespace}`
    : `[${JSON.stringify(entry.namespace)}]`;
  const name = isIdentifierSafe(entry.name)
    ? `.${entry.name}`
    : `[${JSON.stringify(entry.name)}]`;
  return `tools${namespace}${name}`;
}

/** Exact direct callable name for an exposed capability (`<ns>_<name>`). */
export function directExpression(capability: McpCapability): string {
  return `${capability.namespace}_${capability.name}`;
}

/**
 * Route one capability lookup through the active surface. Catalog exposure
 * wins when `execute` is present; direct callables are the fallback; an
 * absent capability resolves to unavailable without fabricating a callable.
 */
export function resolveInvocation(
  surface: McpSurface,
  capability: McpCapability,
): McpInvocation {
  if (surface.executeExposed) {
    const exposed = surface.catalog.find(
      (entry) =>
        entry.namespace === capability.namespace &&
        entry.name === capability.name,
    );
    if (exposed) {
      return {
        mode: "codemode-catalog",
        expression: catalogExpression(exposed),
      };
    }
  }
  const direct = directExpression(capability);
  if (surface.directCallables.includes(direct)) {
    return { mode: "direct", expression: direct };
  }
  return {
    mode: "unavailable",
    reason:
      `${capability.namespace}/${capability.name} is not exposed by the ` +
      "active tool surface; report unavailable instead of attempting a " +
      "nonexistent callable.",
  };
}

/** One exercised surface/capability pairing within a matrix row. */
export interface MatrixCaseFixture {
  label: string;
  surface: McpSurface;
  capability: McpCapability;
  expect: { mode: McpInvocation["mode"]; expression?: string };
}

/** Static fixture row: one mandatory runtime-matrix row. */
export interface MatrixRowFixture {
  id: string;
  title: string;
  discoveryEvidence: string;
  cases: MatrixCaseFixture[];
}

export interface MatrixFixture {
  description: string;
  mandatoryRowIds: string[];
  rows: MatrixRowFixture[];
}

export function loadMatrixFixture(): MatrixFixture {
  return JSON.parse(readFileSync(MATRIX_FIXTURE_PATH, "utf8")) as MatrixFixture;
}

export type LiveRowStatus = "pass" | "fail" | "skipped";

export interface LiveRowEvidence {
  rowId: string;
  status: LiveRowStatus;
  command: string | null;
  observedInvocation: string | null;
  evidenceExcerpt: string | null;
  ranAt: string | null;
  /** Required when status is "skipped". */
  reason: string | null;
}

export interface LiveEvidenceFixture {
  description: string;
  generatedBy: string;
  generatedAt: string;
  rows: LiveRowEvidence[];
}

/** Live evidence is supplemental: an absent file -> null; malformed evidence fails loudly. */
export function loadLiveEvidence(
  filePath = LIVE_EVIDENCE_PATH,
): LiveEvidenceFixture | null {
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as LiveEvidenceFixture;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
