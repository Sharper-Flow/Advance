import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { PROJECTION_DOCUMENT_BYTE_LIMIT } from "./change-projection-reader";
import {
  listActiveEpicProjections,
  loadActiveEpicProjection,
  listRetiredEpicProjections,
  saveActiveEpicProjection,
  saveRetiredEpicProjection,
} from "./epic-projection";
import type { Epic, RetiredEpicProjection } from "../types";

function makeEpic(id: string, title = id): Epic {
  const now = new Date().toISOString();
  return {
    id,
    title,
    narrative: `${title} narrative`,
    entries: [],
    progress: {
      status: "active",
      total_entries: 0,
      completed_entries: 0,
      active_entries: 0,
      next_entry_id: null,
      updated_at: now,
    },
    created_at: now,
    updated_at: now,
    version: 1,
  };
}

describe("epic-projection bounded read", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "epic-projection-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("loadActiveEpicProjection returns a clear failure for oversized files", async () => {
    const activeEpicsDir = join(root, "active");
    const epicId = "oversizedEpic";
    const projectionDir = join(activeEpicsDir, epicId);
    await mkdir(projectionDir, { recursive: true });
    await writeFile(
      join(projectionDir, "active-projection.json"),
      "x".repeat(PROJECTION_DOCUMENT_BYTE_LIMIT + 1),
    );

    const result = await loadActiveEpicProjection(activeEpicsDir, epicId);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.type).toBe("oversized");
      expect(result.error).toContain("oversized");
    }
  });

  it("listActiveEpicProjections omits oversized projections and reports warnings", async () => {
    const activeEpicsDir = join(root, "active");
    const good = makeEpic("goodEpic");
    await saveActiveEpicProjection(activeEpicsDir, good);

    const oversizedId = "oversizedEpic";
    const oversizedDir = join(activeEpicsDir, oversizedId);
    await mkdir(oversizedDir, { recursive: true });
    await writeFile(
      join(oversizedDir, "active-projection.json"),
      "x".repeat(PROJECTION_DOCUMENT_BYTE_LIMIT + 1),
    );

    const result = await listActiveEpicProjections(activeEpicsDir);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.id).toBe("goodEpic");
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings?.[0]?.kind).toBe("oversized");
      expect(result.warnings?.[0]?.path).toContain(
        join(oversizedDir, "active-projection.json"),
      );
    }
  });

  it("listRetiredEpicProjections omits oversized projections and reports warnings", async () => {
    const retiredEpicsDir = join(root, "retired");
    const epic = makeEpic("retiredGood");
    const retired: RetiredEpicProjection = {
      epic_snapshot: epic,
      retired_at: new Date().toISOString(),
      retired_by: "test",
      evidence: "retired for test",
      source_workflow_id: "wf-retired",
      source_version: 1,
      projection_status: "retired",
    };
    await saveRetiredEpicProjection(retiredEpicsDir, epic.id, retired);

    const oversizedId = "retiredOversized";
    const oversizedDir = join(retiredEpicsDir, oversizedId);
    await mkdir(oversizedDir, { recursive: true });
    await writeFile(
      join(oversizedDir, "retired-projection.json"),
      "x".repeat(PROJECTION_DOCUMENT_BYTE_LIMIT + 1),
    );

    const result = await listRetiredEpicProjections(retiredEpicsDir);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.id).toBe("retiredGood");
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings?.[0]?.kind).toBe("oversized");
      expect(result.warnings?.[0]?.path).toContain(
        join(oversizedDir, "retired-projection.json"),
      );
    }
  });
});
