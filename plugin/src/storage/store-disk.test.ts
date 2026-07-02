/**
 * Store-disk fallback behavior: bounded warnings + monotonic IDs.
 *
 * Covers KD5 / SC5 / AC8 for the legacy disk-only store path.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { createDiskStore } from "./store-disk";

async function makeTempProject(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "adv-store-disk-"));
  await writeFile(
    join(dir, "project.json"),
    JSON.stringify({
      name: "store-disk-test",
      version: "0.1.0",
      specs_dir: ".adv/specs",
      changes_dir: ".adv/changes",
      archive_dir: ".adv/archive",
      docs_dir: "docs/specs",
      db_dir: ".adv/db",
    }),
  );
  return dir;
}

describe("store-disk — bounded warnings + monotonic IDs", () => {
  let originalAdvDebug: string | undefined;

  beforeEach(() => {
    originalAdvDebug = process.env.ADV_DEBUG;
    process.env.ADV_DEBUG = "1";
  });

  afterEach(() => {
    process.env.ADV_DEBUG = originalAdvDebug;
    vi.restoreAllMocks();
  });

  test("wisdom.search warns on unreadable project wisdom and returns change wisdom", async () => {
    const dir = await makeTempProject();
    const store = await createDiskStore(dir);
    const created = await store.changes.create("Test Change", {
      capability: "test-capability",
      artifacts: { proposal: "# Proposal\n" },
    });
    await store.wisdom.add(
      created.changeId,
      "pattern",
      "change-local wisdom",
      undefined,
      {},
    );

    // Replace the wisdom JSONL file with a directory to force a read failure.
    await mkdir(join(dir, ".adv/wisdom.jsonl"), { recursive: true });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await store.wisdom.search("wisdom");

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(1);
    expect(result[0]!.content).toBe("change-local wisdom");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Project wisdom read failed"),
    );
  });

  test("wisdom.listAll warns on unreadable project wisdom and returns change wisdom", async () => {
    const dir = await makeTempProject();
    const store = await createDiskStore(dir);
    const created = await store.changes.create("Test Change", {
      capability: "test-capability",
      artifacts: { proposal: "# Proposal\n" },
    });
    await store.wisdom.add(
      created.changeId,
      "pattern",
      "change-local wisdom",
      undefined,
      {},
    );

    await mkdir(join(dir, ".adv/wisdom.jsonl"), { recursive: true });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await store.wisdom.listAll();

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(1);
    expect(result[0]!.content).toBe("change-local wisdom");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Project wisdom read failed"),
    );
  });

  test("tasks.add uses monotonic tk-{ts}-{seq} IDs", async () => {
    const dir = await makeTempProject();
    const store = await createDiskStore(dir);
    const created = await store.changes.create("Test Change", {
      capability: "test-capability",
      artifacts: { proposal: "# Proposal\n" },
    });

    const t1 = await store.tasks.add(created.changeId, "First task", {});
    const t2 = await store.tasks.add(created.changeId, "Second task", {});

    expect(t1.id).toMatch(/^tk-\d+-\d+$/);
    expect(t2.id).toMatch(/^tk-\d+-\d+$/);

    const [, ts1, seq1] = t1.id.split("-");
    const [, ts2, seq2] = t2.id.split("-");
    if (ts1 === ts2) {
      expect(Number(seq2)).toBeGreaterThan(Number(seq1));
    } else {
      expect(Number(ts2)).toBeGreaterThanOrEqual(Number(ts1));
    }
  });

  test("wisdom.add uses monotonic ws-{ts}-{seq} IDs", async () => {
    const dir = await makeTempProject();
    const store = await createDiskStore(dir);
    const created = await store.changes.create("Test Change", {
      capability: "test-capability",
      artifacts: { proposal: "# Proposal\n" },
    });

    const w1 = await store.wisdom.add(
      created.changeId,
      "pattern",
      "First wisdom",
      undefined,
      {},
    );
    const w2 = await store.wisdom.add(
      created.changeId,
      "pattern",
      "Second wisdom",
      undefined,
      {},
    );

    expect(w1.id).toMatch(/^ws-\d+-\d+$/);
    expect(w2.id).toMatch(/^ws-\d+-\d+$/);

    const [, ts1, seq1] = w1.id.split("-");
    const [, ts2, seq2] = w2.id.split("-");
    if (ts1 === ts2) {
      expect(Number(seq2)).toBeGreaterThan(Number(seq1));
    } else {
      expect(Number(ts2)).toBeGreaterThanOrEqual(Number(ts1));
    }
  });
});
