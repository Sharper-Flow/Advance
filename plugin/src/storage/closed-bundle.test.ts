import { describe, expect, test } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, access } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import type { Change } from "../types";
import { retireClosedChange } from "./closed-bundle";
import { loadClosedChange } from "./json";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function makeClosedChange(id: string, overrides: Partial<Change> = {}): Change {
  return {
    id,
    title: `Change ${id}`,
    status: "closed",
    lifecycleState: "closed",
    created_at: "2026-08-01T00:00:00.000Z",
    tasks: [],
    gates: {},
    deltas: {},
    wisdom: [],
    subagent_reports: [],
    closure: {
      reason: "not_planned",
      approved_by_user: true,
      approval_evidence: "User approved closure.",
      approved_at: "2026-08-26T00:00:00.000Z",
    },
    ...overrides,
  } as Change;
}

/** Build `changes/<id>/change.json` plus a sibling artifact, and a `closed/` dir. */
async function makeFixture(
  change: Change,
): Promise<{ changesDir: string; closedPath: string }> {
  const root = await mkdtemp(join(tmpdir(), "adv-closed-bundle-"));
  const changesDir = join(root, "changes");
  const closedPath = join(root, "closed");
  await mkdir(join(changesDir, change.id), { recursive: true });
  await writeFile(
    join(changesDir, change.id, "change.json"),
    JSON.stringify(change),
  );
  await writeFile(
    join(changesDir, change.id, "proposal.md"),
    "# Proposal\nbody\n",
  );
  return { changesDir, closedPath };
}

describe("retireClosedChange — durability before cleanup", () => {
  test("writes a readable closed bundle, then removes the source directory", async () => {
    const change = makeClosedChange("retireMe");
    const { changesDir, closedPath } = await makeFixture(change);

    const result = await retireClosedChange({ change, closedPath, changesDir });

    expect(result.ok).toBe(true);
    // Source is gone...
    expect(await exists(join(changesDir, "retireMe"))).toBe(false);
    // ...and the record survives it.
    const readback = await loadClosedChange(closedPath, "retireMe");
    expect(readback.success).toBe(true);
    expect(readback.data?.id).toBe("retireMe");
    expect(readback.data?.status).toBe("closed");
    expect(readback.data?.closure?.approval_evidence).toBe(
      "User approved closure.",
    );
  });

  test("refuses and preserves the source when the bundle cannot be written", async () => {
    const change = makeClosedChange("unwritable");
    const { changesDir, closedPath } = await makeFixture(change);
    // Occupy the closed/ path with a regular file so the bundle write fails.
    await writeFile(closedPath, "not a directory");

    const result = await retireClosedChange({ change, closedPath, changesDir });

    expect(result.ok).toBe(false);
    // The only surviving copy must still be there.
    expect(await exists(join(changesDir, "unwritable", "change.json"))).toBe(
      true,
    );
    const source = JSON.parse(
      await readFile(join(changesDir, "unwritable", "change.json"), "utf-8"),
    );
    expect(source.id).toBe("unwritable");
  });

  test("refuses and preserves the source when the record is not closed", async () => {
    // A non-closed record must never be retired: the readback proof is what
    // distinguishes "durably closed" from "merely written somewhere".
    const change = makeClosedChange("stillDraft", {
      status: "draft",
      lifecycleState: "draft",
    });
    const { changesDir, closedPath } = await makeFixture(change);

    const result = await retireClosedChange({ change, closedPath, changesDir });

    expect(result.ok).toBe(false);
    expect(await exists(join(changesDir, "stillDraft", "change.json"))).toBe(
      true,
    );
  });

  test("is idempotent across a retry after a cleanup interruption", async () => {
    const change = makeClosedChange("retryMe");
    const { changesDir, closedPath } = await makeFixture(change);

    const first = await retireClosedChange({ change, closedPath, changesDir });
    const second = await retireClosedChange({ change, closedPath, changesDir });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    const readback = await loadClosedChange(closedPath, "retryMe");
    expect(readback.success).toBe(true);
    expect(readback.data?.id).toBe("retryMe");
  });
});
