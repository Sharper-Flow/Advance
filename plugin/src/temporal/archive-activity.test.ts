import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, stat, writeFile } from "fs/promises";
import { join } from "path";
import { describe, expect, it } from "vitest";

import { createDefaultGates } from "../types";
import type { ChangeWorkflowState } from "./contracts";
import { cleanupTempDir, createTempDir } from "../__tests__/setup";
import { renderBriefSummary } from "../utils/archive-summary";
import { applySpecDelta } from "../utils/spec-deltas";
import { appendWisdom } from "../utils/wisdom-append";
import { archiveChangeActivity } from "./activities";

const exec = promisify(execFile);

function makeState(changeId = "archive-change"): ChangeWorkflowState {
  return {
    projectId: "archive-project",
    changeId,
    id: changeId,
    title: "Archive durable trinity",
    initializedAt: "2026-05-05T00:00:00.000Z",
    status: "archived",
    createdAt: "2026-05-05T00:00:00.000Z",
    tasks: [
      {
        id: "tk-one",
        title: "Implement behavior",
        type: "code",
        status: "done",
        priority: 1,
        created_at: "2026-05-05T00:00:00.000Z",
        verification: "tests pass",
      },
    ],
    wisdom: [
      {
        id: "ws-one",
        type: "pattern",
        content: "Keep archive output small and durable.",
        source_task: "tk-one",
        recorded_at: "2026-05-05T00:00:00.000Z",
      },
    ],
    gates: createDefaultGates(),
    artifacts: {},
    reentry_history: [],
    deltas: {
      archive: [
        {
          id: "dl-one",
          operation: "add",
          requirement: {
            id: "rq-archive01",
            title: "Archive durable trinity",
            body: "Archive output must persist summary, specs, and wisdom.",
            priority: "must",
          },
        },
      ],
    },
  };
}

async function initGitRepo(path: string): Promise<void> {
  await exec("git", ["init", "--initial-branch=main"], { cwd: path });
  await exec("git", ["config", "user.email", "test@example.com"], {
    cwd: path,
  });
  await exec("git", ["config", "user.name", "Test User"], { cwd: path });
  await writeFile(join(path, "README.md"), "# test\n", "utf-8");
  await exec("git", ["add", "README.md"], { cwd: path });
  await exec("git", ["commit", "-m", "initial"], { cwd: path });
}

describe("archive durable trinity utilities", () => {
  it("renders a brief summary with locked sections under 2KB", () => {
    const summary = renderBriefSummary({
      state: makeState(),
      status: "archived",
      archivedAt: "2026-05-05T01:00:00.000Z",
      branch: "change/archive-change",
      mergeSha: "abc1234",
      approvalEvidence: "ship it",
      approvedBy: "tester",
    });

    expect(summary.length).toBeLessThan(2048);
    expect(summary).toContain("# archive-change: Archive durable trinity");
    expect(summary).toContain("## Outcome");
    expect(summary).toContain("## Spec Deltas");
    expect(summary).toContain("## Approval");
  });

  it("applies spec deltas to in-repo specs", async () => {
    const dir = await createTempDir();
    try {
      const result = await applySpecDelta(
        dir,
        "archive",
        makeState().deltas!.archive,
      );

      expect(result.ok).toBe(true);
      const spec = JSON.parse(
        await readFile(
          join(dir, ".adv", "specs", "archive", "spec.json"),
          "utf-8",
        ),
      );
      expect(spec.requirements[0].id).toBe("rq-archive01");
    } finally {
      await cleanupTempDir(dir);
    }
  });

  it("appends wisdom jsonl idempotently", async () => {
    const dir = await createTempDir();
    try {
      const [entry] = makeState().wisdom;
      await appendWisdom(dir, [entry]);
      await appendWisdom(dir, [entry]);

      const lines = (await readFile(join(dir, ".adv", "wisdom.jsonl"), "utf-8"))
        .trim()
        .split("\n");
      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0]).id).toBe("ws-one");
    } finally {
      await cleanupTempDir(dir);
    }
  });
});

describe("archiveChangeActivity", () => {
  it("writes durable trinity and commits it", async () => {
    const dir = await createTempDir();
    try {
      await initGitRepo(dir);
      const result = await archiveChangeActivity({
        state: makeState(),
        projects: [{ projectPath: dir }],
        status: "archived",
        archivedAt: "2026-05-05T01:00:00.000Z",
        approvalEvidence: "ship it",
        approvedBy: "tester",
      });

      expect(result.ok).toBe(true);
      await expect(
        stat(join(dir, ".adv", "archive", "archive-change.md")),
      ).resolves.toBeTruthy();
      const wisdom = await readFile(join(dir, ".adv", "wisdom.jsonl"), "utf-8");
      expect(wisdom).toContain("ws-one");
      const { stdout } = await exec("git", ["log", "--oneline", "-1"], {
        cwd: dir,
      });
      expect(stdout).toContain("archive(archive-change): durable trinity");
    } finally {
      await cleanupTempDir(dir);
    }
  });

  it("preflights all projects before writing to avoid partial archive output", async () => {
    const first = await createTempDir();
    const second = await createTempDir();
    try {
      await initGitRepo(first);
      await initGitRepo(second);
      await writeFile(join(second, "dirty.txt"), "dirty", "utf-8");

      const result = await archiveChangeActivity({
        state: makeState(),
        projects: [{ projectPath: first }, { projectPath: second }],
        status: "archived",
        archivedAt: "2026-05-05T01:00:00.000Z",
        approvalEvidence: "ship it",
        approvedBy: "tester",
      });

      expect(result.ok).toBe(false);
      await expect(
        stat(join(first, ".adv", "archive", "archive-change.md")),
      ).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await cleanupTempDir(first);
      await cleanupTempDir(second);
    }
  });

  it("supports cancelled summaries without applying spec deltas", async () => {
    const dir = await createTempDir();
    try {
      await initGitRepo(dir);
      const state = {
        ...makeState("cancel-change"),
        status: "closed" as const,
      };

      const result = await archiveChangeActivity({
        state,
        projects: [{ projectPath: dir }],
        status: "cancelled",
        archivedAt: "2026-05-05T01:00:00.000Z",
        approvalEvidence: "cancel approved",
        approvedBy: "tester",
      });

      expect(result.ok).toBe(true);
      await expect(stat(join(dir, ".adv", "specs"))).rejects.toMatchObject({
        code: "ENOENT",
      });
      const summary = await readFile(
        join(dir, ".adv", "archive", "cancel-change.md"),
        "utf-8",
      );
      expect(summary).toContain("**Status:** cancelled");
    } finally {
      await cleanupTempDir(dir);
    }
  });
});
