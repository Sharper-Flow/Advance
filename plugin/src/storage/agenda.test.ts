/**
 * Tests for agenda durability — malformed-line logging and compaction guard
 * (rq-agendaDurableParse01).
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const debugLogMock = vi.fn();
vi.mock("../utils/debug-log", () => ({
  appendDebugLog: (...args: unknown[]) => debugLogMock(...args),
}));

import { loadAgenda, compactAgenda } from "./agenda";

let tmpDir: string;
let agendaPath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adv-agenda-test-"));
  agendaPath = path.join(tmpDir, "agenda.jsonl");
  debugLogMock.mockClear();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const validMeta = JSON.stringify({
  type: "meta",
  version: "1.0",
  created_at: new Date().toISOString(),
});
const validItem = JSON.stringify({
  id: "ag-keepme01",
  title: "valid item",
  priority: "medium",
  status: "pending",
  created_at: new Date().toISOString(),
});
const MALFORMED = "{ this is not valid json";

describe("loadAgenda durability (rq-agendaDurableParse01.1)", () => {
  it("logs and counts malformed lines instead of silently dropping them", async () => {
    fs.writeFileSync(
      agendaPath,
      [validMeta, validItem, MALFORMED].join("\n") + "\n",
    );

    const result = await loadAgenda(tmpDir, { agendaPath });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe("ag-keepme01");
    expect(result.skippedMalformed).toBe(1);
    expect(debugLogMock).toHaveBeenCalledWith(
      "agenda",
      expect.stringContaining("malformed"),
    );
  });

  it("does not count blank or comment lines as malformed", async () => {
    fs.writeFileSync(
      agendaPath,
      [validMeta, "", "# a comment", validItem].join("\n") + "\n",
    );

    const result = await loadAgenda(tmpDir, { agendaPath });

    expect(result.skippedMalformed).toBe(0);
    expect(result.items).toHaveLength(1);
    expect(debugLogMock).not.toHaveBeenCalled();
  });
});

describe("compactAgenda durability guard (rq-agendaDurableParse01.2)", () => {
  it("skips compaction and preserves malformed content when a load skipped malformed lines", async () => {
    fs.writeFileSync(
      agendaPath,
      [validMeta, validItem, MALFORMED].join("\n") + "\n",
    );

    await compactAgenda(tmpDir, { agendaPath });

    const after = fs.readFileSync(agendaPath, "utf-8");
    // The malformed line must NOT be permanently discarded by compaction.
    expect(after).toContain(MALFORMED);
  });

  it("compacts normally (collapses superseded entries) when there are no malformed lines", async () => {
    const updatedItem = JSON.stringify({
      id: "ag-keepme01",
      title: "updated title",
      priority: "medium",
      status: "pending",
      created_at: new Date().toISOString(),
    });
    fs.writeFileSync(
      agendaPath,
      [validMeta, validItem, updatedItem].join("\n") + "\n",
    );

    await compactAgenda(tmpDir, { agendaPath });

    const lines = fs
      .readFileSync(agendaPath, "utf-8")
      .trim()
      .split("\n")
      .filter(Boolean);
    // meta + single collapsed item
    expect(lines).toHaveLength(2);
    expect(fs.readFileSync(agendaPath, "utf-8")).toContain("updated title");
  });
});
