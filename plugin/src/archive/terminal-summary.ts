/**
 * Archive Terminal Summary
 *
 * Versioned, schema-validated lightweight terminal summary sidecar for ADV
 * archive bundles.  The sidecar is small enough to enumerate large terminal
 * histories without parsing the full change.json, while still carrying enough
 * structural fields to reconstruct a ChangeListResponse row or ChangeSummary.
 *
 * The sidecar is bound to its sibling change.json by SHA-256 of the exact
 * change.json bytes, and its own integrity is protected by a summaryHash that
 * is computed over the canonical UTF-8 JSON with lexicographic key order and
 * the summaryHash field omitted.
 */

// rq-terminalSummary01

import { createHash } from "crypto";
import { z } from "zod";
import {
  ChangeLifecycleStateSchema,
  FastFollowOfSchema,
  OpsFollowupLinkSchema,
  OpsFollowupProfileSchema,
  type Change,
} from "../types";
import { EpicMembershipSchema } from "../types/epics";
import { GateIdSchema } from "../types/gates";
import { computeLastActivity, firstOpenGate } from "../storage/store-types";

export const TERMINAL_SUMMARY_FILE = "summary.v1.json";

export const TerminalArchiveSummarySchema = z.object({
  version: z.literal("1"),
  change_id: z.string(),
  title: z.string(),
  status: z.enum(["archived", "closed"]),
  lifecycle_state: ChangeLifecycleStateSchema.optional(),
  created_at: z.string(),
  last_activity_at: z.string(),
  current_gate: z.union([GateIdSchema, z.literal("done")]),
  task_count: z.number().int().nonnegative(),
  completed_tasks: z.number().int().nonnegative(),
  capabilities: z.array(z.string()),
  archived_at: z.string(),
  change_hash: z.string(),
  summary_hash: z.string(),
  fast_follow_of: FastFollowOfSchema.optional(),
  ops_followup: OpsFollowupProfileSchema.optional(),
  ops_followup_links: z.array(OpsFollowupLinkSchema).optional(),
  epic_membership: EpicMembershipSchema.optional(),
});

export type TerminalArchiveSummary = z.infer<
  typeof TerminalArchiveSummarySchema
>;

export interface BuildTerminalArchiveSummaryInput {
  change: Change;
  archivedAt: string;
  changeHash: string;
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf-8").digest("hex");
}

function sortJsonKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonKeys);
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, sortJsonKeys(nested)]);
    return Object.fromEntries(entries);
  }

  return value;
}

/**
 * Build a lightweight terminal summary from a validated archived Change.
 *
 * The caller is responsible for passing a Change that has already been
 * schema-validated and carries a terminal status (archived/closed).
 */
export function buildTerminalArchiveSummary(
  input: BuildTerminalArchiveSummaryInput,
): TerminalArchiveSummary {
  const { change, archivedAt, changeHash } = input;
  if (change.status !== "archived" && change.status !== "closed") {
    throw new Error(
      `Terminal summary requires a terminal Change status, got "${change.status}"`,
    );
  }
  const doneTasks = change.tasks.filter((task) => task.status === "done");

  return {
    version: "1",
    change_id: change.id,
    title: change.title,
    status: change.status,
    lifecycle_state: change.lifecycleState,
    created_at: change.created_at,
    last_activity_at: computeLastActivity(change),
    current_gate: firstOpenGate(change.gates),
    task_count: change.tasks.length,
    completed_tasks: doneTasks.length,
    capabilities: Object.keys(change.deltas).sort((a, b) => a.localeCompare(b)),
    archived_at: archivedAt,
    change_hash: changeHash,
    summary_hash: "", // populated by serializeTerminalArchiveSummary
    fast_follow_of: change.fast_follow_of,
    ops_followup: change.ops_followup,
    ops_followup_links: change.ops_followup_links,
    epic_membership: change.epic_membership,
  };
}

/**
 * Serialize a terminal summary to canonical UTF-8 JSON with a trailing newline.
 *
 * The summaryHash is computed over the JSON with lexicographic key order and
 * the summaryHash field omitted, then appended to the output.  This lets a
 * reader verify both the summary integrity and the binding to the sibling
 * change.json (via change_hash) without re-parsing the full change record.
 */
export function serializeTerminalArchiveSummary(
  summary: TerminalArchiveSummary,
): string {
  TerminalArchiveSummarySchema.parse(summary);

  const { summary_hash: _omitted, ...canonical } = summary;
  const canonicalBytes = `${JSON.stringify(
    sortJsonKeys(canonical),
    null,
    2,
  )}\n`;
  const summaryHash = sha256Hex(canonicalBytes);

  const withHash: TerminalArchiveSummary = {
    ...summary,
    summary_hash: summaryHash,
  };

  return `${JSON.stringify(sortJsonKeys(withHash), null, 2)}\n`;
}

/**
 * Parse and validate a raw terminal summary sidecar.
 */
export function validateTerminalArchiveSummary(
  value: unknown,
): TerminalArchiveSummary {
  return TerminalArchiveSummarySchema.parse(value);
}

/**
 * Verify that a terminal summary's summaryHash matches the canonical bytes
 * (summaryHash omitted).  Returns true when the sidecar is internally
 * consistent; callers should also verify change_hash against the sibling
 * change.json when authoritative binding is required.
 */
export function verifyTerminalArchiveSummaryHash(
  summary: TerminalArchiveSummary,
): boolean {
  const { summary_hash, ...canonical } = summary;
  const canonicalBytes = `${JSON.stringify(
    sortJsonKeys(canonical),
    null,
    2,
  )}\n`;
  return sha256Hex(canonicalBytes) === summary_hash;
}

/**
 * Compute the SHA-256 hex digest of a UTF-8 string.
 *
 * Exposed so archive.ts can compute the binding change_hash from the exact
 * change.json bytes that are written to disk.
 */
export function sha256HexString(input: string): string {
  return sha256Hex(input);
}
