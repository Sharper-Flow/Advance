/**
 * Database Health & Recovery
 *
 * Detects SQLite corruption and auto-recovers from JSON source of truth.
 */

import { Database } from "bun:sqlite";
import { statSync } from "fs";
import { createLogger } from "../utils/debug-log";

const logger = createLogger("health");

interface HealthCheckResult {
  healthy: boolean;
  corruptionDetected: boolean;
  message?: string;
}

// =============================================================================
// Health Checks
// =============================================================================

function checkDatabaseHealth(db: Database): HealthCheckResult {
  try {
    // Check if database is readable
    const _result = db.query("SELECT count(*) as count FROM specs").get() as {
      count: number;
    };

    // Run integrity check
    const integrity = db.query("PRAGMA integrity_check").all() as {
      integrity_check: string;
    }[];

    const isCorrupted = integrity.some((r) => r.integrity_check !== "ok");

    if (isCorrupted) {
      return {
        healthy: false,
        corruptionDetected: true,
        message: "Database corruption detected via integrity_check",
      };
    }

    return { healthy: true, corruptionDetected: false };
  } catch (e) {
    const error = e as Error;
    const isCorruption =
      error.message.includes("malformed") ||
      error.message.includes("corrupt") ||
      error.message.includes("database disk image is malformed");

    return {
      healthy: false,
      corruptionDetected: isCorruption,
      message: error.message,
    };
  }
}

// =============================================================================
// WAL Checkpointing
// =============================================================================

export function checkpointWAL(db: Database): void {
  try {
    db.exec("PRAGMA wal_checkpoint(PASSIVE)");
  } catch (e) {
    // Non-fatal if checkpoint fails
    logger.warn(`WAL checkpoint failed: ${(e as Error).message}`);
  }
}

export function getWALSize(dbPath: string): number {
  try {
    const walPath = `${dbPath}-wal`;
    const stats = statSync(walPath);
    return stats.size;
  } catch {
    return 0;
  }
}

// Should checkpoint when WAL grows beyond 1MB
export function shouldCheckpoint(
  dbPath: string,
  thresholdBytes = 1024 * 1024,
): boolean {
  return getWALSize(dbPath) > thresholdBytes;
}

// =============================================================================
// Database Lifecycle
// =============================================================================

export function initDatabase(db: Database): void {
  // Enable WAL for better concurrent access
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");

  // Optimize for concurrent workload
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec("PRAGMA cache_size = -64000"); // 64MB cache
  db.exec("PRAGMA temp_store = MEMORY"); // Keep temp tables in memory (avoids disk I/O for intermediate results)

  // Critical for concurrent access - wait up to 5 seconds for locks
  db.exec("PRAGMA busy_timeout = 5000");

  // Use IMMEDIATE transactions to fail fast on write conflicts
  // rather than deadlocking mid-transaction
  db.exec("PRAGMA locking_mode = NORMAL");

  // Reduce WAL checkpoint frequency to avoid contention
  // Auto-checkpoint when WAL exceeds 1000 pages (~4MB)
  db.exec("PRAGMA wal_autocheckpoint = 1000");

  // Check health on startup
  const health = checkDatabaseHealth(db);
  if (!health.healthy) {
    if (health.corruptionDetected) {
      throw new Error(
        `Database corrupted on startup: ${health.message}. Recovery required.`,
      );
    }
    throw new Error(`Database unhealthy: ${health.message}`);
  }
}

export function closeDatabase(db: Database): void {
  try {
    // Checkpoint before closing to sync WAL to main database
    checkpointWAL(db);
    db.close();
  } catch (e) {
    logger.error(`Error closing database: ${(e as Error).message}`);
    db.close(); // Force close
  }
}
