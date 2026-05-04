#!/usr/bin/env node

/**
 * Retired SQLite Recovery Tool
 *
 * ADV runtime storage is Temporal-only. Historical `db_dir` / physical `db/`
 * paths are deprecated compatibility artifacts and are no longer rebuilt or
 * required for normal operation.
 *
 * This script intentionally performs no deletion. Use:
 *   adv_status view:hygiene
 *   adv_migrate_cleanup dryRun:true
 *   adv_archive_sweep_orphans dryRun:true
 * for dry-run hygiene reporting. Any deletion remains approval-gated through
 * ADV tools.
 */

console.log("ADV SQLite recovery is retired.");
console.log("Runtime storage is Temporal-only; no spec.db rebuild is needed.");
console.log("Run `adv_status view:hygiene` for dry-run external-state hygiene.");
