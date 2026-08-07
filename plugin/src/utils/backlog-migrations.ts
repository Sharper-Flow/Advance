/**
 * Backlog Schema Migrations
 *
 * Hand-rolled branching per version. Mirrors the explicit branching style used
 * in the storage migration boundary rather than a generic Zod passthrough.
 *
 * Writes against an old schema are refused unless the caller explicitly
 * consents to migration.
 *
 * Spec citation: rq-backlogSchemaVersion01 — explicit schema version header
 * and consent-gated migration.
 */

import { readFile } from "fs/promises";
import { atomicWriteFile } from "./fs";
import { getBacklogPath } from "./backlog-store";
import {
  CURRENT_SCHEMA_VERSION,
  type BacklogHeader,
  type BacklogItem,
} from "../types/backlog";

// =============================================================================
// Errors
// =============================================================================

export class BacklogMigrationError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "already_current"
      | "unsupported_version"
      | "consent_required"
      | "malformed_source",
  ) {
    super(message);
    this.name = "BacklogMigrationError";
  }
}

// =============================================================================
// Version Detection
// =============================================================================

export type BacklogSchemaVersion = 0 | 1;

export function parseBacklogSchemaVersion(
  header: BacklogHeader | null,
): BacklogSchemaVersion {
  if (!header) return 0;
  if (header.schemaVersion === 0) return 0;
  if (header.schemaVersion === 1) return 1;
  // Unknown future versions are treated as the latest known version for read
  // safety; migration refuses to downgrade them.
  return CURRENT_SCHEMA_VERSION as BacklogSchemaVersion;
}

// =============================================================================
// Per-Version Migrators
// =============================================================================

/**
 * v0 items lacked `status`, `created_at`, `updated_at`, and `success_hint`.
 * The v0→v1 migrator supplies defaults and stamps the current time.
 */
function migrateV0ItemToV1(
  raw: Record<string, unknown>,
  migratedAt: string,
): BacklogItem {
  return {
    id: typeof raw.id === "string" ? raw.id : "bl-migrated",
    title: typeof raw.title === "string" ? raw.title : "Migrated backlog item",
    success_hint:
      typeof raw.success_hint === "string"
        ? raw.success_hint
        : "Review this migrated backlog item.",
    status: "active",
    created_at: migratedAt,
    updated_at: migratedAt,
  };
}

function migrateItemToVersion(
  raw: Record<string, unknown>,
  fromVersion: BacklogSchemaVersion,
  toVersion: BacklogSchemaVersion,
  migratedAt: string,
): BacklogItem {
  if (fromVersion === 0 && toVersion === 1) {
    return migrateV0ItemToV1(raw, migratedAt);
  }
  if (fromVersion === toVersion) {
    // Identity migration: validate shape by casting.
    return raw as unknown as BacklogItem;
  }
  throw new BacklogMigrationError(
    `No migrator defined from schema version ${fromVersion} to ${toVersion}`,
    "unsupported_version",
  );
}

// =============================================================================
// Full-File Migration
// =============================================================================

export interface MigrateBacklogOptions {
  /** Explicit consent to rewrite the backlog file. */
  consent: true;
  /** Optional fixed clock for deterministic tests. */
  migratedAt?: string;
}

/**
 * Migrate `.adv/backlog.jsonl` from its current header version to the current
 * schema version. Requires explicit caller consent because the operation
 * rewrites the file.
 */
export async function migrateBacklog(
  projectDir: string,
  options: MigrateBacklogOptions,
): Promise<{ fromVersion: BacklogSchemaVersion; toVersion: number }> {
  const path = getBacklogPath(projectDir);
  const migratedAt = options.migratedAt ?? new Date().toISOString();

  let rawContent: string;
  try {
    rawContent = await readFile(path, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      // Nothing to migrate; ensure header at current version.
      await atomicWriteFile(
        path,
        JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION }) + "\n",
      );
      return {
        fromVersion: CURRENT_SCHEMA_VERSION,
        toVersion: CURRENT_SCHEMA_VERSION,
      };
    }
    throw err;
  }

  const lines = rawContent.split("\n");
  const headerLine = lines.find((l) => l.trim().length > 0);
  let header: BacklogHeader = { schemaVersion: CURRENT_SCHEMA_VERSION };
  if (headerLine) {
    try {
      header = JSON.parse(headerLine) as BacklogHeader;
    } catch {
      throw new BacklogMigrationError(
        "Backlog header is malformed; cannot determine schema version.",
        "malformed_source",
      );
    }
  }

  const fromVersion = parseBacklogSchemaVersion(header);
  if (fromVersion === CURRENT_SCHEMA_VERSION) {
    throw new BacklogMigrationError(
      "Backlog is already at the current schema version.",
      "already_current",
    );
  }

  const outputLines: string[] = [
    JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION }),
  ];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim().length === 0) continue;
    if (i === 0) continue; // header
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(line) as Record<string, unknown>;
    } catch {
      // Preserve malformed lines as-is so an operator can inspect them.
      outputLines.push(line);
      continue;
    }
    const migrated = migrateItemToVersion(
      parsed,
      fromVersion,
      CURRENT_SCHEMA_VERSION as BacklogSchemaVersion,
      migratedAt,
    );
    outputLines.push(JSON.stringify(migrated));
  }

  await atomicWriteFile(path, outputLines.join("\n") + "\n");
  return { fromVersion, toVersion: CURRENT_SCHEMA_VERSION };
}

// =============================================================================
// Write-Guard Helper
// =============================================================================

/**
 * Throws unless the schema version is current or the caller has explicitly
 * consented to migrate. Returns the current header when writable.
 */
export function requireCurrentSchemaOrConsent(
  header: BacklogHeader,
  allowMigrationConsent?: true,
): { writable: true; header: BacklogHeader } {
  if (header.schemaVersion === CURRENT_SCHEMA_VERSION) {
    return { writable: true, header };
  }
  if (allowMigrationConsent) {
    // Caller has pre-approved migration; the actual migration is left to the
    // tool layer so that the mutation and migration are explicit and auditable.
    return { writable: true, header };
  }
  throw new BacklogMigrationError(
    `Backlog schema version ${header.schemaVersion} is not writable without migration consent.`,
    "consent_required",
  );
}

export { CURRENT_SCHEMA_VERSION };
