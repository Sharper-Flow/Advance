/**
 * Tests for plugin/src/storage/health.ts.
 *
 * Covers recovery/lifecycle branches through public functions:
 *   - initDatabase success + corruption detection
 *   - checkpointWAL success + failure logging
 *   - getWALSize missing/present
 *   - shouldCheckpoint threshold decisions
 *   - closeDatabase success + force-close branch
 */

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { join } from "path";
import { writeFileSync } from "fs";
import { Database } from "bun:sqlite";
import { createTempDir, cleanupTempDir } from "../__tests__/setup";
import {
  checkpointWAL,
  closeDatabase,
  getWALSize,
  initDatabase,
  shouldCheckpoint,
} from "./health";

describe("health", () => {
  let tempDir: string;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tempDir = await createTempDir();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(async () => {
    warnSpy.mockRestore();
    errorSpy.mockRestore();
    await cleanupTempDir(tempDir);
  });

  describe("initDatabase", () => {
    test("succeeds on a healthy sqlite file", () => {
      const dbPath = join(tempDir, "healthy.db");
      const db = new Database(dbPath);
      db.exec("CREATE TABLE specs (id TEXT PRIMARY KEY)");
      expect(() => initDatabase(db)).not.toThrow();
      db.close();
    });

    test("throws descriptive error when integrity_check reports corruption", () => {
      const fakeDb = {
        exec: vi.fn(),
        query: vi.fn((sql: string) => {
          if (sql.includes("PRAGMA integrity_check")) {
            return {
              all: () => [{ integrity_check: "broken at page 3" }],
            };
          }
          return {
            all: () => [],
            get: () => ({ count: 0 }),
          };
        }),
      } as unknown as Database;

      expect(() => initDatabase(fakeDb)).toThrow(
        /Database corrupted on startup/,
      );
    });

    test("throws when a health query surfaces a malformed-disk error", () => {
      const fakeDb = {
        exec: vi.fn(),
        query: vi.fn(() => {
          return {
            all: () => {
              throw new Error("database disk image is malformed");
            },
            get: () => {
              throw new Error("database disk image is malformed");
            },
          };
        }),
      } as unknown as Database;

      expect(() => initDatabase(fakeDb)).toThrow(
        /Database corrupted on startup/,
      );
    });
  });

  describe("checkpointWAL", () => {
    test("success on a real db with WAL mode", () => {
      const dbPath = join(tempDir, "wal.db");
      const db = new Database(dbPath);
      db.exec("PRAGMA journal_mode = WAL");
      db.exec("CREATE TABLE specs (id TEXT PRIMARY KEY)");
      expect(() => checkpointWAL(db)).not.toThrow();
      db.close();
    });

    test("swallows failure and logs via logger (console.warn)", () => {
      const fakeDb = {
        exec: vi.fn(() => {
          throw new Error("checkpoint boom");
        }),
      } as unknown as Database;

      expect(() => checkpointWAL(fakeDb)).not.toThrow();
      expect(warnSpy).toHaveBeenCalled();
      const msg = warnSpy.mock.calls[0][0] as string;
      expect(msg).toContain("WAL checkpoint failed");
      expect(msg).toContain("checkpoint boom");
    });
  });

  describe("getWALSize", () => {
    test("returns 0 when WAL file is missing", () => {
      const dbPath = join(tempDir, "no-wal.db");
      expect(getWALSize(dbPath)).toBe(0);
    });

    test("returns actual byte size when WAL file exists", () => {
      const dbPath = join(tempDir, "fake.db");
      const walPath = `${dbPath}-wal`;
      writeFileSync(walPath, "a".repeat(256));
      expect(getWALSize(dbPath)).toBe(256);
    });
  });

  describe("shouldCheckpoint", () => {
    test("returns false when WAL file is missing", () => {
      const dbPath = join(tempDir, "no-wal.db");
      expect(shouldCheckpoint(dbPath)).toBe(false);
    });

    test("returns false when WAL is at/under threshold", () => {
      const dbPath = join(tempDir, "small-wal.db");
      writeFileSync(`${dbPath}-wal`, "a".repeat(100));
      expect(shouldCheckpoint(dbPath, 100)).toBe(false);
    });

    test("returns true when WAL is above threshold", () => {
      const dbPath = join(tempDir, "big-wal.db");
      writeFileSync(`${dbPath}-wal`, "a".repeat(200));
      expect(shouldCheckpoint(dbPath, 100)).toBe(true);
    });
  });

  describe("closeDatabase", () => {
    test("closes cleanly after checkpoint on a real db", () => {
      const dbPath = join(tempDir, "clean-close.db");
      const db = new Database(dbPath);
      db.exec("PRAGMA journal_mode = WAL");
      db.exec("CREATE TABLE specs (id TEXT PRIMARY KEY)");
      expect(() => closeDatabase(db)).not.toThrow();
    });

    test("force-closes when first close throws", () => {
      let closeCalls = 0;
      const fakeDb = {
        exec: vi.fn(),
        close: vi.fn(() => {
          closeCalls++;
          if (closeCalls === 1) {
            throw new Error("close-1 failed");
          }
          // second call succeeds (force close)
        }),
      } as unknown as Database;

      expect(() => closeDatabase(fakeDb)).not.toThrow();
      expect(closeCalls).toBe(2);
      expect(errorSpy).toHaveBeenCalled();
      const msg = errorSpy.mock.calls[0][0] as string;
      expect(msg).toContain("Error closing database");
      expect(msg).toContain("close-1 failed");
    });
  });
});
