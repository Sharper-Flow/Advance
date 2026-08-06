import { describe, expect, test, beforeEach, afterEach } from "vitest";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createTempDir, cleanupTempDir } from "../__tests__/setup";
import {
  renderTerminalHistory,
  TERMINAL_HISTORY_DEADLINE_BUDGET_MS,
  type TerminalHistoryRow,
} from "./terminal-history";
import {
  buildTerminalArchiveSummary,
  sha256HexString,
  serializeTerminalArchiveSummary,
} from "./terminal-summary";
import type { Change } from "../types";

function makeChange(id: string, status: "archived" | "closed"): Change {
  return {
    id,
    title: `Change ${id}`,
    status,
    created_at: "2026-05-08T00:00:00.000Z",
    tasks: [
      {
        id: "tk-1",
        title: "Task one",
        type: "code",
        status: "done",
        priority: 0,
        created_at: "2026-05-08T00:00:00.000Z",
      },
      {
        id: "tk-2",
        title: "Task two",
        type: "code",
        status: "pending",
        priority: 1,
        created_at: "2026-05-08T00:00:00.000Z",
      },
    ],
    deltas: {
      capabilityA: [
        {
          id: "delta-1",
          operation: "add",
          requirement: {
            id: "REQ-1",
            title: "Req",
            body: "Req body",
            priority: "must",
            capability: "capabilityA",
          },
        },
      ],
    },
    gates: {
      proposal: { status: "done", completed_at: "2026-05-08T01:00:00.000Z" },
      discovery: { status: "done", completed_at: "2026-05-08T02:00:00.000Z" },
      design: { status: "done", completed_at: "2026-05-08T03:00:00.000Z" },
      planning: { status: "done", completed_at: "2026-05-08T04:00:00.000Z" },
      execution: { status: "done", completed_at: "2026-05-08T05:00:00.000Z" },
      acceptance: { status: "done", completed_at: "2026-05-08T06:00:00.000Z" },
      release: { status: "done", completed_at: "2026-05-08T07:00:00.000Z" },
    },
  } as Change;
}

async function writeArchiveBundle(
  tempDir: string,
  change: Change,
  writeSummary: boolean,
): Promise<void> {
  const archiveDir = join(tempDir, ".adv", "archive", change.id);
  await mkdir(archiveDir, { recursive: true });
  const changeJson = JSON.stringify(change, null, 2) + "\n";
  await writeFile(join(archiveDir, "change.json"), changeJson);
  if (writeSummary) {
    const summary = buildTerminalArchiveSummary({
      change,
      archivedAt: "2026-07-18T12:00:00.000Z",
      changeHash: sha256HexString(changeJson),
    });
    await writeFile(
      join(archiveDir, "summary.v1.json"),
      serializeTerminalArchiveSummary(summary),
    );
  }
}

async function writeClosedChange(
  tempDir: string,
  change: Change,
): Promise<void> {
  const changesDir = join(tempDir, ".adv", "changes", change.id);
  await mkdir(changesDir, { recursive: true });
  await writeFile(
    join(changesDir, "change.json"),
    JSON.stringify(change, null, 2) + "\n",
  );
}

function rowById(
  result: { changes: TerminalHistoryRow[] },
  id: string,
): TerminalHistoryRow | undefined {
  return result.changes.find((r) => r.id === id);
}

describe("renderTerminalHistory", () => {
  let tempDir: string | undefined;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
  });

  test("renders a row from a valid summary.v1.json without loading change.json", async () => {
    const change = makeChange("archived-one", "archived");
    await writeArchiveBundle(tempDir!, change, true);

    const result = await renderTerminalHistory({
      archivePath: join(tempDir!, ".adv", "archive"),
      includeArchived: true,
    });

    expect(result.changes).toHaveLength(1);
    const row = rowById(result, "archived-one")!;
    expect(row.title).toBe("Change archived-one");
    expect(row.status).toBe("archived");
    expect(row.taskCount).toBe(2);
    expect(row.completedTasks).toBe(1);
    expect(row.capabilities).toEqual(["capabilityA"]);
    expect(result.hydrationStats.terminalFromArchive).toBe(1);
    expect(result.hydrationStats.terminalFromDisk).toBe(0);
    expect(result.hydrationStats).not.toHaveProperty("terminalFromWorkflow");
    expect(result.warnings).toHaveLength(0);
  });

  test("falls back to legacy change.json when summary is missing", async () => {
    const change = makeChange("archived-legacy", "archived");
    await writeArchiveBundle(tempDir!, change, false);

    const result = await renderTerminalHistory({
      archivePath: join(tempDir!, ".adv", "archive"),
      includeArchived: true,
    });

    expect(result.changes).toHaveLength(1);
    const row = rowById(result, "archived-legacy")!;
    expect(row.status).toBe("archived");
    expect(result.hydrationStats.terminalFromArchive).toBe(1);
  });

  test("falls back to legacy change.json when summary is unsupported/corrupt", async () => {
    const change = makeChange("archived-bad-summary", "archived");
    await writeArchiveBundle(tempDir!, change, false);
    await writeFile(
      join(tempDir!, ".adv", "archive", change.id, "summary.v1.json"),
      JSON.stringify({ version: "99", change_id: "archived-bad-summary" }) +
        "\n",
    );

    const result = await renderTerminalHistory({
      archivePath: join(tempDir!, ".adv", "archive"),
      includeArchived: true,
    });

    expect(result.changes).toHaveLength(1);
    expect(rowById(result, "archived-bad-summary")?.status).toBe("archived");
  });

  test("falls back to legacy change.json when summary hashes are incoherent", async () => {
    const change = makeChange("archived-tampered-summary", "archived");
    await writeArchiveBundle(tempDir!, change, true);
    const summaryPath = join(
      tempDir!,
      ".adv",
      "archive",
      change.id,
      "summary.v1.json",
    );
    const summary = JSON.parse(await readFile(summaryPath, "utf-8"));
    summary.title = "Tampered title";
    await writeFile(summaryPath, JSON.stringify(summary) + "\n");

    const result = await renderTerminalHistory({
      archivePath: join(tempDir!, ".adv", "archive"),
      includeArchived: true,
    });

    expect(rowById(result, change.id)?.title).toBe(`Change ${change.id}`);
  });

  test("produces a typed omission when both summary and legacy change.json fail", async () => {
    const archiveDir = join(tempDir!, ".adv", "archive", "orphan-bundle");
    await mkdir(archiveDir, { recursive: true });
    await writeFile(
      join(archiveDir, "summary.v1.json"),
      JSON.stringify({ broken: true }) + "\n",
    );
    await writeFile(
      join(archiveDir, "change.json"),
      JSON.stringify({ broken: true }) + "\n",
    );

    const result = await renderTerminalHistory({
      archivePath: join(tempDir!, ".adv", "archive"),
      includeArchived: true,
    });

    expect(result.changes).toHaveLength(0);
    expect(result.hydrationStats.omitted).toBeGreaterThan(0);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "TERMINAL_CANDIDATE_OMITTED",
          source: "archive",
        }),
      ]),
    );
  });

  test("includes closed changes from active disk", async () => {
    const change = makeChange("closed-one", "closed");
    await writeClosedChange(tempDir!, change);

    const result = await renderTerminalHistory({
      changesPath: join(tempDir!, ".adv", "changes"),
      includeClosed: true,
    });

    expect(result.changes).toHaveLength(1);
    const row = rowById(result, "closed-one")!;
    expect(row.status).toBe("closed");
    expect(result.hydrationStats.terminalFromDisk).toBe(1);
    expect(result.hydrationStats.terminalFromArchive).toBe(0);
  });

  test("ignores non-terminal active-disk changes", async () => {
    const activeChange = makeChange("active-one", "archived");
    (activeChange as { status: string }).status = "draft";
    await writeClosedChange(tempDir!, activeChange);

    const result = await renderTerminalHistory({
      changesPath: join(tempDir!, ".adv", "changes"),
      includeClosed: true,
    });

    expect(result.changes).toHaveLength(0);
    expect(result.hydrationStats.terminalFromDisk).toBe(0);
  });

  test("deduplicates archive bundles by canonical id and picks the latest", async () => {
    const olderBundle = join(tempDir!, ".adv", "archive", "2026-01-01-dedup");
    const newerBundle = join(tempDir!, ".adv", "archive", "2026-07-18-dedup");
    await mkdir(olderBundle, { recursive: true });
    await mkdir(newerBundle, { recursive: true });

    const older = makeChange("dedup", "archived");
    older.title = "Older dedup";
    const newer = makeChange("dedup", "archived");
    newer.title = "Newer dedup";

    await writeFile(
      join(olderBundle, "change.json"),
      JSON.stringify(older, null, 2) + "\n",
    );
    await writeFile(
      join(newerBundle, "change.json"),
      JSON.stringify(newer, null, 2) + "\n",
    );

    const result = await renderTerminalHistory({
      archivePath: join(tempDir!, ".adv", "archive"),
      includeArchived: true,
    });

    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].title).toBe("Newer dedup");
  });

  test("terminal dominance: archive summary overrides stale active disk shadow", async () => {
    const change = makeChange("shadow", "archived");
    await writeArchiveBundle(tempDir!, change, true);

    const staleActive = makeChange("shadow", "archived");
    (staleActive as { status: string }).status = "draft";
    await writeClosedChange(tempDir!, staleActive);

    const result = await renderTerminalHistory({
      archivePath: join(tempDir!, ".adv", "archive"),
      changesPath: join(tempDir!, ".adv", "changes"),
      includeArchived: true,
      includeClosed: true,
    });

    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].status).toBe("archived");
    expect(result.changes[0].title).toBe("Change shadow");
  });

  test("respects includeArchived/includeClosed filters", async () => {
    const archived = makeChange("archived-only", "archived");
    const closed = makeChange("closed-only", "closed");
    await writeArchiveBundle(tempDir!, archived, true);
    await writeClosedChange(tempDir!, closed);

    const archivedResult = await renderTerminalHistory({
      archivePath: join(tempDir!, ".adv", "archive"),
      changesPath: join(tempDir!, ".adv", "changes"),
      includeArchived: true,
    });
    expect(archivedResult.changes.map((c) => c.id)).toEqual(["archived-only"]);

    const closedResult = await renderTerminalHistory({
      archivePath: join(tempDir!, ".adv", "archive"),
      changesPath: join(tempDir!, ".adv", "changes"),
      includeClosed: true,
    });
    expect(closedResult.changes.map((c) => c.id)).toEqual(["closed-only"]);
  });

  test("returns partial rows and typed deadline warnings when the deadline expires", async () => {
    const change = makeChange("fast", "archived");
    await writeArchiveBundle(tempDir!, change, true);

    const deadline = { budgetMs: 0, deadlineAt: Date.now() - 1 };

    const result = await renderTerminalHistory({
      archivePath: join(tempDir!, ".adv", "archive"),
      includeArchived: true,
      deadline,
    });

    expect(result.changes).toHaveLength(0);
    expect(result.hydrationStats.deadlineExceeded).toBe(true);
    expect(
      result.warnings.some((w) => w.code === "SOURCE_DEADLINE_EXCEEDED"),
    ).toBe(true);
  });

  test("uses the default 20-second deadline when no deadline is provided", async () => {
    const change = makeChange("default-deadline", "archived");
    await writeArchiveBundle(tempDir!, change, true);

    const start = Date.now();
    const result = await renderTerminalHistory({
      archivePath: join(tempDir!, ".adv", "archive"),
      includeArchived: true,
    });
    const elapsed = Date.now() - start;

    expect(result.changes).toHaveLength(1);
    expect(elapsed).toBeLessThan(TERMINAL_HISTORY_DEADLINE_BUDGET_MS);
  });

  test("bounds omitted IDs to a maximum of 20", async () => {
    const archivePath = join(tempDir!, ".adv", "archive");
    for (let i = 0; i < 25; i++) {
      const change = makeChange(`omitted-${i}`, "archived");
      await writeArchiveBundle(tempDir!, change, false);
      await writeFile(
        join(archivePath, change.id, "summary.v1.json"),
        JSON.stringify({ broken: true }) + "\n",
      );
      await writeFile(
        join(archivePath, change.id, "change.json"),
        JSON.stringify({ broken: true }) + "\n",
      );
    }

    const result = await renderTerminalHistory({
      archivePath,
      includeArchived: true,
    });

    const omissionWarning = result.warnings.find(
      (w) => w.code === "TERMINAL_CANDIDATE_OMITTED",
    );
    expect(omissionWarning).toBeDefined();
    expect(omissionWarning!.omittedIds).toHaveLength(20);
    expect(omissionWarning!.omittedCount).toBe(25);
  });
});
