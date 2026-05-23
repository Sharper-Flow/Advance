// WAL checkpoint hygiene.
//
// SQLite WAL files grow unbounded when a long-lived reader holds back the
// checkpoint. The original session architecture doc (§10.2) explicitly flagged
// "consider WAL checkpoint cadence" as an unresolved discovery item. With
// per-instance DBs, the WAL of each retired instance can be reclaimed at
// graceful exit so the next launch starts clean.
//
// Mechanism: call `sqlite3 <db> "PRAGMA wal_checkpoint(TRUNCATE);"` via CLI.
// We do NOT import a SQLite driver in the plugin (keeps deps minimal).
//
// This is best-effort. Failures are logged but don't escalate.

import { execFile } from "node:child_process";
import fs from "node:fs";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

export async function walCheckpoint(dbPath, { log = console.error } = {}) {
  if (!dbPath) return { ok: false, reason: "no db path" };
  try {
    if (!fs.statSync(dbPath).isFile()) {
      return { ok: false, reason: `not a file: ${dbPath}` };
    }
  } catch {
    return { ok: false, reason: `missing: ${dbPath}` };
  }
  try {
    const { stdout } = await execFileP("sqlite3", [dbPath, "PRAGMA wal_checkpoint(TRUNCATE);"], {
      timeout: 10_000,
    });
    // PRAGMA returns "<busy> <log> <checkpointed>"; busy=0 means full checkpoint
    const [busy, logSize, ckpt] = String(stdout).trim().split(/\s+/).map((n) => Number(n));
    return { ok: busy === 0, busy, logSize, checkpointed: ckpt };
  } catch (err) {
    log?.("acp-mux: wal_checkpoint failed", { error: String(err.message || err) });
    return { ok: false, reason: String(err.message || err) };
  }
}
