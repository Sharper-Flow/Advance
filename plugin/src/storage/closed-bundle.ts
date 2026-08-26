/**
 * Closed-change retirement.
 *
 * Retiring a change removes `changes/<id>/`, which holds the only copy of the
 * record. The copy under `closed/<id>/` must therefore exist AND be readable
 * before the removal runs. This module owns that ordering so no caller has to
 * remember it.
 *
 * The two halves have deliberately different failure policies:
 *
 *   - Durability (write + readback proof) is fail-closed. If it does not hold,
 *     the source directory is left untouched and the caller MUST surface an
 *     error rather than report success.
 *   - Cleanup (removing the source) is best-effort. Once the readback proof
 *     holds, the record is safe, so a failed removal leaves a recoverable
 *     duplicate rather than a loss.
 *
 * Spec: AC1, AC4. Constraint C4 — no cleanup may run while it can destroy the
 * only copy of a record.
 */

import { join } from "path";
import type { Change } from "../types";
import { atomicWriteFile } from "../utils/fs";
import { loadClosedChange, removeChangeDir } from "./json";

export type RetireClosedChangeResult =
  | { ok: true; cleanupWarning?: string }
  | { ok: false; error: string };

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Persist `change` to `closed/<id>/change.json`, prove it reads back, and only
 * then remove `changes/<id>/`.
 *
 * Idempotent: re-running after a completed retirement rewrites the same bundle
 * and treats the already-absent source directory as removed.
 */
export async function retireClosedChange(input: {
  change: Change;
  closedPath: string;
  changesDir: string;
}): Promise<RetireClosedChangeResult> {
  const { change, closedPath, changesDir } = input;
  const changeId = change.id;

  if (change.status !== "closed") {
    return {
      ok: false,
      error:
        `refusing to retire ${changeId}: status is "${change.status}", ` +
        `expected "closed"`,
    };
  }

  try {
    await atomicWriteFile(
      join(closedPath, changeId, "change.json"),
      JSON.stringify(change, null, 2),
    );
  } catch (err) {
    return {
      ok: false,
      error: `failed to write closed bundle for ${changeId}: ${describe(err)}`,
    };
  }

  // Read-after-write proof. A successful write call is not evidence that the
  // record is retrievable; only a read is.
  const readback = await loadClosedChange(closedPath, changeId);
  if (!readback.success || !readback.data) {
    return {
      ok: false,
      error:
        `closed bundle for ${changeId} is not readable after write: ` +
        `${readback.success ? "no record returned" : readback.error}`,
    };
  }
  if (readback.data.id !== changeId || readback.data.status !== "closed") {
    return {
      ok: false,
      error:
        `closed bundle for ${changeId} read back as ` +
        `id="${readback.data.id}" status="${readback.data.status}"`,
    };
  }

  try {
    await removeChangeDir(changesDir, changeId);
  } catch (err) {
    return {
      ok: true,
      cleanupWarning:
        `closed record for ${changeId} is durable, but removing ` +
        `changes/${changeId} failed: ${describe(err)}`,
    };
  }

  return { ok: true };
}
