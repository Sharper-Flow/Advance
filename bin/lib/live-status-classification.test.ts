import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  buildLiveStatusPayloadFromSummaries,
  loadLiveSummariesWithResidue,
} from "./live-status";

const PROJECT_ID = "f".repeat(40);
const NOW = new Date("2026-06-05T17:00:00.000Z");
const originalXdgDataHome = process.env.XDG_DATA_HOME;
const originalBundle = process.env.ADV_SUMMARY_CANDIDATES_CLI_BUNDLE;

const canonicalChange = (id: string, status = "active") => ({
  $schema: "https://advance.dev/schemas/change.v1.json",
  id,
  title: id,
  status,
  created_at: "2026-01-21T00:00:00Z",
  created_by: "test-user",
  tasks: [],
  deltas: {},
  validation: {
    checked_against_specs: [],
    conflicts: [],
    warnings: [],
    validated_at: "2026-01-21T00:00:00Z",
  },
});

const shard = (id: string, status = "draft") => ({
  id,
  title: id,
  status,
  phase: "proposal",
  created_at: "2026-06-05T16:00:00.000Z",
  last_activity_at: "2026-06-05T16:00:00.000Z",
  completed_tasks: 0,
  task_count: 0,
});

let testRoot: string | undefined;

afterEach(async () => {
  if (testRoot) await rm(testRoot, { recursive: true, force: true });
  testRoot = undefined;
  if (originalXdgDataHome === undefined) delete process.env.XDG_DATA_HOME;
  else process.env.XDG_DATA_HOME = originalXdgDataHome;
  if (originalBundle === undefined) {
    delete process.env.ADV_SUMMARY_CANDIDATES_CLI_BUNDLE;
  } else {
    process.env.ADV_SUMMARY_CANDIDATES_CLI_BUNDLE = originalBundle;
  }
});

async function setupStore(
  records: Array<{
    id: string;
    shardStatus?: string;
    canonical?: Record<string, unknown>;
  }>,
): Promise<void> {
  testRoot = await mkdtemp(join(tmpdir(), "live-status-classification-"));
  process.env.XDG_DATA_HOME = testRoot;
  const stateRoot = join(
    testRoot,
    "opencode",
    "plugins",
    "advance",
    PROJECT_ID,
  );
  const summariesRoot = join(stateRoot, "summaries");
  const changesRoot = join(stateRoot, "changes");
  await mkdir(summariesRoot, { recursive: true });
  await mkdir(changesRoot, { recursive: true });

  for (const record of records) {
    const shardPath = join(summariesRoot, record.id, "shard.json");
    await mkdir(join(summariesRoot, record.id), { recursive: true });
    await writeFile(
      join(summariesRoot, record.id, "current.json"),
      JSON.stringify({ shard_path: shardPath }),
    );
    await writeFile(
      shardPath,
      JSON.stringify(shard(record.id, record.shardStatus)),
    );
    if (record.canonical) {
      await mkdir(join(changesRoot, record.id), { recursive: true });
      await writeFile(
        join(changesRoot, record.id, "change.json"),
        JSON.stringify(record.canonical),
      );
    }
  }
}

describe("summary shard canonical classification", () => {
  test("suppresses excluded rows and reports each exclusion as residue", async () => {
    delete process.env.ADV_SUMMARY_CANDIDATES_CLI_BUNDLE;
    await setupStore([
      { id: "valid", canonical: canonicalChange("valid") },
      { id: "missing" },
      {
        id: "terminal",
        canonical: canonicalChange("terminal", "archived"),
      },
      { id: "corrupt", canonical: { id: "corrupt" } },
      { id: "shard-terminal", shardStatus: "archived" },
    ]);

    const result = await loadLiveSummariesWithResidue(PROJECT_ID, NOW);

    expect(result.summaries.map((summary) => summary.id)).toEqual(["valid"]);
    const payload = buildLiveStatusPayloadFromSummaries(result.summaries, {
      projectId: PROJECT_ID,
      archivedCount: 0,
      closedCount: 0,
      now: NOW,
      summaryResidue: result.summaryResidue,
    });
    expect(payload.summary_residue).toEqual({
      excluded: [
        { id: "corrupt", reason: "canonical_error", detail: "schema_error" },
        { id: "missing", reason: "canonical_missing" },
        { id: "terminal", reason: "canonical_terminal" },
      ],
    });
  });

  test("reports missing classifier bundle without suppressing rows", async () => {
    process.env.ADV_SUMMARY_CANDIDATES_CLI_BUNDLE = join(
      tmpdir(),
      "does-not-exist-summary-candidates-bundle.js",
    );
    await setupStore([{ id: "unvalidated", canonical: canonicalChange("unvalidated") }]);

    const result = await loadLiveSummariesWithResidue(PROJECT_ID, NOW);

    expect(result.summaries.map((summary) => summary.id)).toEqual(["unvalidated"]);
    expect(result.summaryResidue).toEqual({
      excluded: [],
      validation_unavailable: true,
    });
  });
});
