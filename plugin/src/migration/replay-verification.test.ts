/**
 * replay-verification tests — pre-cutover replay proof (DDC6, AC11).
 *
 * Verifies the committed sanitized changeWorkflow histories replay
 * deterministically against the current worker bundle before a cutover
 * receipt may activate. The integration case runs the real committed
 * fixtures (mirroring `replay-determinism.test.ts`); negative cases use
 * synthetic metadata/history pairs and never touch Temporal.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";

import { cleanupTempDir, createTempDir } from "../__tests__/setup";
import {
  discoverReplayFixtures,
  verifyCommittedReplayFixtures,
} from "./replay-verification";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => cleanupTempDir(dir)));
  tempDirs = [];
});

async function tempDir(prefix: string): Promise<string> {
  const dir = await createTempDir(prefix);
  tempDirs.push(dir);
  return dir;
}

const REAL_HISTORIES_DIR = fileURLToPath(
  new URL("../temporal/__tests__/replay/histories/", import.meta.url),
);
const REAL_WORKFLOWS_PATH = fileURLToPath(
  new URL("../temporal/workflows.ts", import.meta.url),
);

function writeFixturePair(
  dir: string,
  stem: string,
  metadata: Record<string, unknown>,
  history: Record<string, unknown>,
): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${stem}.metadata.json`), JSON.stringify(metadata));
  writeFileSync(join(dir, `${stem}.history.json`), JSON.stringify(history));
}

const BASE_METADATA = {
  name: "synthetic-fixture",
  workflowType: "changeWorkflow",
  workflowId: "adv/change/proj/synthetic",
  covers: ["SYNTHETIC"],
  eventCount: 2,
  incidentEventId: "2",
  incidentEventType: "EVENT_TYPE_MARKER_RECORDED",
};

describe("discoverReplayFixtures", () => {
  test("pairs metadata with histories in deterministic order", async () => {
    const dir = await tempDir("adv-replay-discover-");
    writeFixturePair(dir, "b.two", BASE_METADATA, { events: [] });
    writeFixturePair(dir, "a.one", BASE_METADATA, { events: [] });
    const fixtures = discoverReplayFixtures(dir);
    expect(fixtures.map((f) => f.stem)).toEqual(["a.one", "b.two"]);
  });

  test("an empty histories dir discovers no fixtures", async () => {
    const dir = await tempDir("adv-replay-discover-empty-");
    expect(discoverReplayFixtures(dir)).toEqual([]);
  });
});

describe("verifyCommittedReplayFixtures — structural validation", () => {
  test("fails when no fixtures are present (nothing verified)", async () => {
    const dir = await tempDir("adv-replay-none-");
    const report = await verifyCommittedReplayFixtures({
      historiesDir: dir,
      workflowsPath: REAL_WORKFLOWS_PATH,
      // No replay runner needed — validation fails before replay.
      runReplay: async () => {},
    });
    expect(report.passed).toBe(false);
    expect(report.fixtures).toEqual([]);
    expect(report.error).toMatch(/no replay fixtures/i);
  });

  test("fails when event count does not match metadata", async () => {
    const dir = await tempDir("adv-replay-count-");
    writeFixturePair(dir, "bad.count", BASE_METADATA, {
      events: [
        { eventId: "1", eventType: "EVENT_TYPE_WORKFLOW_EXECUTION_STARTED" },
      ],
    });
    const report = await verifyCommittedReplayFixtures({
      historiesDir: dir,
      workflowsPath: REAL_WORKFLOWS_PATH,
      runReplay: async () => {},
    });
    expect(report.passed).toBe(false);
    expect(report.fixtures[0].ok).toBe(false);
    expect(report.fixtures[0].error).toMatch(/eventCount/);
  });

  test("fails when the incident event is absent from the history", async () => {
    const dir = await tempDir("adv-replay-incident-");
    writeFixturePair(dir, "bad.incident", BASE_METADATA, {
      events: [
        { eventId: "1", eventType: "EVENT_TYPE_WORKFLOW_EXECUTION_STARTED" },
        { eventId: "2", eventType: "EVENT_TYPE_WORKFLOW_TASK_COMPLETED" },
      ],
    });
    const report = await verifyCommittedReplayFixtures({
      historiesDir: dir,
      workflowsPath: REAL_WORKFLOWS_PATH,
      runReplay: async () => {},
    });
    expect(report.passed).toBe(false);
    expect(report.fixtures[0].error).toMatch(/incident/);
  });

  test("fails when a replay runner rejection is recorded per fixture", async () => {
    const dir = await tempDir("adv-replay-reject-");
    writeFixturePair(dir, "replay.fails", BASE_METADATA, {
      events: [
        { eventId: "1", eventType: "EVENT_TYPE_WORKFLOW_EXECUTION_STARTED" },
        { eventId: "2", eventType: "EVENT_TYPE_MARKER_RECORDED" },
      ],
    });
    const report = await verifyCommittedReplayFixtures({
      historiesDir: dir,
      workflowsPath: REAL_WORKFLOWS_PATH,
      runReplay: async () => {
        throw new Error("nondeterminism: replay mismatch");
      },
    });
    expect(report.passed).toBe(false);
    expect(report.fixtures[0].error).toContain("nondeterminism");
  });

  test("passes when validation and injected replay succeed", async () => {
    const dir = await tempDir("adv-replay-pass-");
    writeFixturePair(dir, "replay.ok", BASE_METADATA, {
      events: [
        { eventId: "1", eventType: "EVENT_TYPE_WORKFLOW_EXECUTION_STARTED" },
        { eventId: "2", eventType: "EVENT_TYPE_MARKER_RECORDED" },
      ],
    });
    const seen: string[] = [];
    const report = await verifyCommittedReplayFixtures({
      historiesDir: dir,
      workflowsPath: REAL_WORKFLOWS_PATH,
      runReplay: async (input) => {
        seen.push(input.workflowId);
      },
    });
    expect(report.passed).toBe(true);
    expect(report.fixtures).toHaveLength(1);
    expect(report.fixtures[0]).toMatchObject({
      workflowId: "adv/change/proj/synthetic",
      events: 2,
      ok: true,
    });
    expect(seen).toEqual(["adv/change/proj/synthetic"]);
  });
});

describe("verifyCommittedReplayFixtures — committed sanitized histories", () => {
  test("replays every committed fixture against the current workflows bundle", async () => {
    const report = await verifyCommittedReplayFixtures({
      historiesDir: REAL_HISTORIES_DIR,
      workflowsPath: REAL_WORKFLOWS_PATH,
    });
    expect(report.fixtures.length).toBeGreaterThanOrEqual(4);
    expect(report.passed).toBe(true);
    expect(report.fixtures.every((f) => f.ok)).toBe(true);
  }, 120_000);
});
