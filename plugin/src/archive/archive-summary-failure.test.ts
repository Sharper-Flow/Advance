import { existsSync } from "fs";
import { mkdir, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { Change } from "../types";
import { TERMINAL_SUMMARY_FILE } from "./terminal-summary";

const createdAt = "2026-07-18T00:00:00.000Z";
let tempDirs: string[] = [];

const openCalls: Array<{ path: string; flags: string | number | undefined }> =
  [];
const syncCalls: Array<{ path: string; flags: string | number | undefined }> =
  [];
let failSummary = false;

vi.mock("fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs/promises")>();
  return {
    ...actual,
    open: async (path: string, flags?: string | number) => {
      openCalls.push({ path, flags });
      if (failSummary && String(path).includes(TERMINAL_SUMMARY_FILE)) {
        return {
          writeFile: async () => {
            throw new Error("injected terminal summary failure");
          },
          sync: async () => {},
          close: async () => {},
        } as unknown as FileHandle;
      }
      const handle = await actual.open(path, flags);
      const originalSync = handle.sync.bind(handle);
      (handle as { sync: () => Promise<void> }).sync = async () => {
        syncCalls.push({ path, flags });
        return originalSync();
      };
      return handle;
    },
  };
});

import { archiveChange } from "./archive";

afterEach(async () => {
  vi.restoreAllMocks();
  openCalls.length = 0;
  syncCalls.length = 0;
  failSummary = false;
  await Promise.all(
    tempDirs.map((dir) => rm(dir, { recursive: true, force: true })),
  );
  tempDirs = [];
});

async function tempProject(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "adv-archive-summary-fail-"));
  tempDirs.push(dir);
  return dir;
}

function changeWithContract(overrides: Partial<Change> = {}): Change {
  return {
    id: "summary-fallback-change",
    title: "Summary fallback change",
    status: "active",
    created_at: createdAt,
    tasks: [
      {
        id: "tk-1",
        title: "Implement AC1",
        type: "code",
        status: "done",
        priority: 0,
        created_at: createdAt,
        contract_refs: { implements: ["AC1"], verifies: ["AC1"] },
      },
    ],
    deltas: {},
    contract: undefined,
    ...overrides,
  } as Change;
}

describe("archive terminal summary failure fallback", () => {
  test("summary write failure keeps change.json authority valid", async () => {
    failSummary = true;
    const root = await tempProject();
    const change = changeWithContract();

    const result = await archiveChange({
      change,
      specs: new Map(),
      paths: {
        specs: join(root, "specs"),
        docs: join(root, "docs"),
        archive: join(root, "archive"),
      },
    });

    expect(result.success).toBe(true);
    expect(existsSync(join(result.archivePath, "change.json"))).toBe(true);
    expect(existsSync(join(result.archivePath, TERMINAL_SUMMARY_FILE))).toBe(
      false,
    );
    const changeJson = JSON.parse(
      await readFile(join(result.archivePath, "change.json"), "utf-8"),
    );
    expect(changeJson.status).toBe("archived");
    expect(result.terminalSummaryDegradation).toEqual({
      reason:
        "Terminal summary write failed: injected terminal summary failure",
      fallback: "legacy_change_json",
    });
  });

  test("archive directory receives fsync after bundle creation", async () => {
    const root = await tempProject();
    const archiveDir = join(root, "archive");
    await mkdir(archiveDir, { recursive: true });
    const change = changeWithContract();

    await archiveChange({
      change,
      specs: new Map(),
      paths: {
        specs: join(root, "specs"),
        docs: join(root, "docs"),
        archive: archiveDir,
      },
    });

    expect(
      openCalls.some((c) => c.path === archiveDir && c.flags === "r"),
    ).toBe(true);
    expect(
      syncCalls.some((c) => c.path === archiveDir && c.flags === "r"),
    ).toBe(true);
  });
});
