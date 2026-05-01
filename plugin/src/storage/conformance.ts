/**
 * Conformance Storage
 *
 * Persists per-spec conformance lock state + audit log to a project-keyed
 * external `conformance.json` file. Pure opt-in backfill: every spec
 * defaults to `conformance_required: false`.
 *
 * Two location modes:
 *   - "subfolder" (default): conformance source lives at
 *     `{projectDir}/.adv/specs/_conformance/`. Easy management,
 *     branch-local versioning, no bootstrap.
 *   - "sibling" (opt-in): conformance source lives at
 *     `{project-parent}/advance-conformance-{project-id}/`. Stronger
 *     physical isolation; user manages a separate repo.
 *
 * State file path:
 *   `~/.local/share/opencode/plugins/advance/{project-id}/conformance.json`
 *
 * Worktree survival: state lives outside the main repo so all worktrees
 * of the same project share the same lock state. Same pattern as
 * `wisdom.jsonl` and `agenda.jsonl`.
 */

import { dirname, join } from "path";
import { existsSync } from "fs";
import { mkdir, readFile } from "fs/promises";

import {
  ConformanceStateSchema,
  EMPTY_CONFORMANCE_STATE,
  type ConformanceOverride,
  type ConformanceSpecEntry,
  type ConformanceState,
} from "../types";
import { atomicWriteFile, acquireFileLock } from "../utils/fs";

// =============================================================================
// Constants
// =============================================================================

const CONFORMANCE_FILE = "conformance.json";
const SUBFOLDER_REL_PATH = join(".adv", "specs", "_conformance");
const SIBLING_DIR_PREFIX = "advance-conformance-";

// =============================================================================
// Path Resolution
// =============================================================================

/**
 * Path to the conformance.json state file inside the project's external
 * data root. The external root is the same per-project directory used by
 * wisdom/agenda (`~/.local/share/opencode/plugins/advance/{project-id}/`).
 */
export const getConformanceStatePath = (externalRoot: string): string =>
  join(externalRoot, CONFORMANCE_FILE);

/**
 * Default subfolder location for conformance source — inside the main
 * repo at `.adv/specs/_conformance/`. Branch-local; versioned with the
 * spec; zero bootstrap.
 */
export const resolveDefaultConformanceRoot = (projectDir: string): string =>
  join(projectDir, SUBFOLDER_REL_PATH);

/**
 * Opt-in sibling-repo location at `{project-parent}/advance-conformance-
 * {project-id}/`. Used when the user wants stronger physical isolation
 * (validator finding #5: "defense-in-depth path").
 */
export const resolveSiblingConformanceRoot = (
  projectDir: string,
  projectId: string,
): string => join(dirname(projectDir), `${SIBLING_DIR_PREFIX}${projectId}`);

// =============================================================================
// Load + Save
// =============================================================================

/**
 * Load conformance state from external storage.
 *
 * Returns an empty state (default subfolder kind, no specs) when
 * `conformance.json` is missing — matches the pure opt-in model.
 *
 * Throws (with explanatory message) when the file exists but cannot be
 * parsed against `ConformanceStateSchema`.
 */
export const loadConformanceState = async (
  externalRoot: string,
  projectDir: string,
): Promise<ConformanceState> => {
  const path = getConformanceStatePath(externalRoot);
  if (!existsSync(path)) {
    return EMPTY_CONFORMANCE_STATE(
      resolveDefaultConformanceRoot(projectDir),
      "subfolder",
    );
  }

  const raw = await readFile(path, "utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Conformance state at ${path} is not valid JSON: ${(err as Error).message}`,
      { cause: err },
    );
  }

  return ConformanceStateSchema.parse(parsed);
};

/**
 * Atomic write of conformance state. Creates the external root directory
 * if missing. Appends a trailing newline for diff hygiene.
 *
 * Uses `acquireFileLock` to serialize concurrent writers in the same
 * process. Cross-process serialization relies on the existing fs lockfile
 * convention used by wisdom/agenda.
 */
export const saveConformanceState = async (
  externalRoot: string,
  state: ConformanceState,
): Promise<void> => {
  if (!existsSync(externalRoot)) {
    await mkdir(externalRoot, { recursive: true });
  }
  const path = getConformanceStatePath(externalRoot);
  const release = await acquireFileLock(path);
  try {
    const json = JSON.stringify(state, null, 2);
    await atomicWriteFile(path, json + "\n");
  } finally {
    await release();
  }
};

// =============================================================================
// State Mutation Helpers (immutable)
// =============================================================================

/**
 * Upsert a per-spec entry. If the spec exists, partial fields are merged
 * over the existing entry (preserving fields not in the patch). If the
 * spec does not exist, the patch must form a complete `ConformanceSpecEntry`.
 *
 * Returns a new state object — does NOT mutate the input.
 */
export const upsertSpecEntry = (
  state: ConformanceState,
  specName: string,
  patch: Partial<ConformanceSpecEntry>,
): ConformanceState => {
  const existing = state.specs[specName];
  const merged: ConformanceSpecEntry = existing
    ? { ...existing, ...patch }
    : ({
        conformance_required: patch.conformance_required ?? false,
        locked: patch.locked ?? false,
        overrides: patch.overrides ?? [],
        ...patch,
      } as ConformanceSpecEntry);

  return {
    ...state,
    specs: { ...state.specs, [specName]: merged },
  };
};

/**
 * Append an override entry to a spec's audit log.
 *
 * Throws when the target spec does not exist in the state — overrides
 * must reference a tracked spec.
 *
 * Returns a new state object — does NOT mutate the input.
 */
export const appendOverride = (
  state: ConformanceState,
  specName: string,
  override: ConformanceOverride,
): ConformanceState => {
  const existing = state.specs[specName];
  if (!existing) {
    throw new Error(
      `Cannot append override: spec "${specName}" is not tracked in conformance state`,
    );
  }
  const updated: ConformanceSpecEntry = {
    ...existing,
    overrides: [...existing.overrides, override],
  };
  return {
    ...state,
    specs: { ...state.specs, [specName]: updated },
  };
};
