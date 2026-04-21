import { randomUUID } from "node:crypto";
import { rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * Atomic JSONL writer.
 *
 * Serializes an array of entries as newline-delimited JSON and writes them
 * to `path` using a tmp-file-plus-rename strategy:
 *
 *   1. Build the full JSONL payload in memory (one `JSON.stringify` per
 *      entry, joined with '\n', trailing '\n').
 *   2. Write to `{path}.tmp-{uuid}` in the same directory as `path`.
 *   3. `rename()` the tmp file into place (atomic on POSIX filesystems
 *      within a single filesystem).
 *
 * If serialization throws or the tmp write fails, the tmp file is removed
 * and the target is never touched — callers see either the old content
 * (untouched) or the new content (fully written), never a torn partial.
 *
 * Concurrent writes to the same `path` from the same process are serialized
 * by the caller (store-temporal.ts is single-threaded per session); we do
 * NOT attempt cross-process locking because the plugin guarantees one
 * in-process Temporal worker writes derived exports per project.
 *
 * Per D6 (validateTemporal agreement), derived JSONL exports are tooling-
 * compat only — the authoritative state lives in the Temporal workflow.
 */
export async function writeJsonlAtomic(
  path: string,
  entries: readonly unknown[],
): Promise<void> {
  const payload =
    entries.length === 0
      ? ""
      : entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n";

  const tmp = join(dirname(path), `${Date.now()}-${randomUUID()}.tmp`);
  try {
    await writeFile(tmp, payload, "utf8");
    await rename(tmp, path);
  } catch (err) {
    // Best-effort cleanup of tmp on failure. Ignore ENOENT (already gone).
    try {
      await rm(tmp, { force: true });
    } catch {
      /* best-effort */
    }
    throw err;
  }
}
