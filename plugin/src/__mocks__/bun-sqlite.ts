/**
 * Mock for bun:sqlite using better-sqlite3
 *
 * This allows tests to run on Node.js/Vitest while the plugin
 * uses bun:sqlite in production (OpenCode's Bun runtime).
 */

import BetterSQLite3 from "better-sqlite3";
import type { Database as BetterDB, Statement } from "better-sqlite3";

// Statement wrapper to match bun:sqlite API
class StatementWrapper {
  private stmt: Statement;

  constructor(stmt: Statement) {
    this.stmt = stmt;
  }

  all(...params: unknown[]): unknown[] {
    return this.stmt.all(...params);
  }

  get(...params: unknown[]): unknown | null {
    return this.stmt.get(...params) ?? null;
  }

  run(...params: unknown[]): { lastInsertRowid: number; changes: number } {
    const result = this.stmt.run(...params);
    return {
      lastInsertRowid: Number(result.lastInsertRowid),
      changes: result.changes,
    };
  }
}

// Database wrapper to match bun:sqlite API
export class Database {
  private db: BetterDB;

  constructor(
    filename: string,
    options?: { create?: boolean; readonly?: boolean },
  ) {
    // Only pass readonly if explicitly set to avoid better-sqlite3 validation error
    const dbOptions: { readonly?: boolean } = {};
    if (options?.readonly !== undefined) {
      dbOptions.readonly = options.readonly;
    }
    this.db = new BetterSQLite3(filename, dbOptions);
  }

  query(sql: string): StatementWrapper {
    return new StatementWrapper(this.db.prepare(sql));
  }

  prepare(sql: string): StatementWrapper {
    return new StatementWrapper(this.db.prepare(sql));
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  run(
    sql: string,
    ...params: unknown[]
  ): { lastInsertRowid: number; changes: number } {
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...params);
    return {
      lastInsertRowid: Number(result.lastInsertRowid),
      changes: result.changes,
    };
  }

  close(): void {
    this.db.close();
  }

  transaction<T>(fn: () => T): () => T {
    return this.db.transaction(fn) as () => T;
  }
}

// Default export matching bun:sqlite
export default { Database };
