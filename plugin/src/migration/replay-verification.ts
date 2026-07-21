/**
 * replay-verification — pre-cutover replay proof (DDC6, AC11).
 *
 * Design decision: workflow command-producing changes replay committed
 * sanitized histories before cutover. This module runs every committed
 * `*.metadata.json` + `*.history.json` pair through
 * `Worker.runReplayHistory` against the CURRENT workflows bundle and
 * returns a typed report. Activation requires `passed: true` — a replay
 * failure means the deployed bundle cannot deterministically re-execute
 * existing histories, and failing closed after cutover would compound the
 * damage.
 *
 * The replay runner is injectable so structural validation (metadata ↔
 * history consistency) is tested without Temporal; the committed-fixture
 * integration test exercises the real runner.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  PoisonedHistoryClassificationSchema,
  type PoisonedHistoryClassification,
} from "../temporal/replay-history-classification";

export interface ReplayFixtureRef {
  stem: string;
  metadataPath: string;
  historyPath: string;
  classificationPath: string;
}

/** Discover `*.metadata.json`/`*.history.json` pairs, sorted for determinism. */
export function discoverReplayFixtures(
  historiesDir: string,
): ReplayFixtureRef[] {
  let names: string[];
  try {
    names = readdirSync(historiesDir);
  } catch {
    return [];
  }
  return names
    .filter((name) => name.endsWith(".metadata.json"))
    .sort()
    .map((name) => {
      const stem = name.slice(0, name.length - ".metadata.json".length);
      return {
        stem,
        metadataPath: join(historiesDir, name),
        historyPath: join(historiesDir, `${stem}.history.json`),
        classificationPath: join(
          historiesDir,
          `${stem}.classification.json`,
        ),
      };
    });
}

export interface ReplayFixtureResult {
  name: string;
  workflowId: string;
  events: number;
  ok: boolean;
  error?: string;
  classificationOutcome?: PoisonedHistoryClassification["outcome"];
}

export interface ReplayVerificationReport {
  passed: boolean;
  fixtures: ReplayFixtureResult[];
  verifiedAt: string;
  workflowsPath: string;
  historiesDir: string;
  error?: string;
}

export interface ReplayRunInput {
  workflowsPath: string;
  replayName: string;
  history: unknown;
  workflowId: string;
}

export type ReplayRunner = (input: ReplayRunInput) => Promise<void>;

interface ReplayFixtureMetadata {
  name?: string;
  workflowType?: string;
  workflowId?: string;
  eventCount?: number;
  incidentEventId?: string;
  incidentEventType?: string;
}

interface ReplayHistoryEvent {
  eventId?: string;
  eventType?: string;
}

/** Structural metadata ↔ history consistency checks (pre-replay). */
function validateFixture(
  metadata: ReplayFixtureMetadata,
  history: { events?: ReplayHistoryEvent[] },
): string | null {
  if (metadata.workflowType !== "changeWorkflow") {
    return `unexpected workflowType: ${String(metadata.workflowType)}`;
  }
  if (
    typeof metadata.workflowId !== "string" ||
    metadata.workflowId.length === 0
  ) {
    return "metadata missing workflowId";
  }
  const events = history.events;
  if (!Array.isArray(events)) return "history missing events array";
  if (
    typeof metadata.eventCount !== "number" ||
    events.length !== metadata.eventCount
  ) {
    return `eventCount mismatch: metadata=${String(metadata.eventCount)} history=${events.length}`;
  }
  const hasIncident = events.some(
    (event) =>
      event.eventId === metadata.incidentEventId &&
      event.eventType === metadata.incidentEventType,
  );
  if (!hasIncident) {
    return `incident event ${String(metadata.incidentEventId)}/${String(metadata.incidentEventType)} absent from history`;
  }
  return null;
}

async function defaultRunReplay(input: ReplayRunInput): Promise<void> {
  const { Worker } = await import("@temporalio/worker");
  await Worker.runReplayHistory(
    { workflowsPath: input.workflowsPath, replayName: input.replayName },
    input.history,
    input.workflowId,
  );
}

/**
 * Verify every committed replay fixture. Never throws: per-fixture failures
 * are recorded in the report; a top-level `error` covers discovery-level
 * problems (no fixtures found — nothing was verified, so the proof fails).
 */
export async function verifyCommittedReplayFixtures(input: {
  historiesDir: string;
  workflowsPath: string;
  runReplay?: ReplayRunner;
  replayNamePrefix?: string;
}): Promise<ReplayVerificationReport> {
  const runReplay = input.runReplay ?? defaultRunReplay;
  const fixtures = discoverReplayFixtures(input.historiesDir);
  const report: ReplayVerificationReport = {
    passed: false,
    fixtures: [],
    verifiedAt: new Date().toISOString(),
    workflowsPath: input.workflowsPath,
    historiesDir: input.historiesDir,
  };
  if (fixtures.length === 0) {
    report.error = `no replay fixtures discovered under ${input.historiesDir}`;
    return report;
  }
  for (const ref of fixtures) {
    const result: ReplayFixtureResult = {
      name: ref.stem,
      workflowId: "",
      events: 0,
      ok: false,
    };
    report.fixtures.push(result);
    try {
      const metadata = JSON.parse(
        readFileSync(ref.metadataPath, "utf8"),
      ) as ReplayFixtureMetadata;
      const history = JSON.parse(readFileSync(ref.historyPath, "utf8")) as {
        events?: ReplayHistoryEvent[];
      };
      result.name = metadata.name ?? ref.stem;
      result.workflowId = metadata.workflowId ?? "";
      result.events = Array.isArray(history.events) ? history.events.length : 0;
      const structuralError = validateFixture(metadata, history);
      if (structuralError) {
        result.error = structuralError;
        continue;
      }
      const classification = existsSync(ref.classificationPath)
        ? PoisonedHistoryClassificationSchema.parse(
            JSON.parse(readFileSync(ref.classificationPath, "utf8")),
          )
        : undefined;
      result.classificationOutcome = classification?.outcome;
      if (classification?.outcome === "reproduced") {
        result.error = "classification outcome remains nonterminal: reproduced";
        continue;
      }
      try {
        await runReplay({
          workflowsPath: input.workflowsPath,
          replayName: `${input.replayNamePrefix ?? "cutover-replay"}:${result.name}`,
          history,
          workflowId: metadata.workflowId as string,
        });
        if (classification?.outcome === "immutable_history") {
          result.error =
            "immutable_history classification unexpectedly replayed cleanly";
          continue;
        }
        result.ok = true;
      } catch (error) {
        if (classification?.outcome === "immutable_history") {
          result.ok = true;
          continue;
        }
        throw error;
      }
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
    }
  }
  report.passed = report.fixtures.every((fixture) => fixture.ok);
  return report;
}
