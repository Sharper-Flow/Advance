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
 * for dry-run hygiene reporting. Any deletion remains approval-gated through
 * ADV tools.
 *
 * > NOTE: implemented via cullDeadCodeFixArchive — references retired tools
 *   are historical. `adv_migrate_cleanup` and `adv_archive_sweep_orphans`
 *   were retired; use `adv_status view:hygiene` instead.
 */

console.log("ADV SQLite recovery is retired.");
console.log("Runtime storage is Temporal-only; no spec.db rebuild is needed.");
console.log("Run `adv_status view:hygiene` for dry-run external-state hygiene.");
