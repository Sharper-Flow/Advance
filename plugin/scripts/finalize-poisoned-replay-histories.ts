import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { format as prettierFormat } from "prettier";
import {
  AFFECTED_POISONED_CHANGE_IDS,
  PoisonedHistoryClassificationSchema,
  assertCompletePoisonedHistoryClassifications,
  auditSanitizedHistory,
  sanitizeHistoryForFixture,
  type ReplayDivergenceCause,
} from "../src/temporal/replay-history-classification";

interface HistoryEvent {
  eventId?: string;
  eventType?: string;
  [key: string]: unknown;
}

interface TemporalHistory {
  events?: HistoryEvent[];
}

function parseArg(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`Missing required ${name} argument.`);
  return resolve(value);
}

function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === "string") {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, out));
    return;
  }
  if (!value || typeof value !== "object") return;
  Object.values(value as Record<string, unknown>).forEach((item) =>
    collectStrings(item, out),
  );
}

function replayError(event: HistoryEvent): string | undefined {
  if (event.eventType !== "EVENT_TYPE_WORKFLOW_TASK_FAILED") return undefined;
  const strings: string[] = [];
  collectStrings(event, strings);
  return strings.find((value) =>
    /TMPRL1100|nondetermin|does not handle HistoryEvent|no corresponding change command/i.test(
      value,
    ),
  );
}

function classify(error: string): ReplayDivergenceCause {
  if (/UpsertWorkflowSearchAttributes|search attribute/i.test(error)) {
    return "search_attribute_order_mismatch";
  }
  if (/ActivityTask|ActivityMachine|ActivityTaskScheduled/i.test(error)) {
    return "activity_order_mismatch";
  }
  if (/Timer|TimerMachine|TimerStarted/i.test(error)) {
    return "timer_order_mismatch";
  }
  if (/patch marker|no corresponding change command|core_patch/i.test(error)) {
    return "patch_branch_unreachable";
  }
  return "unknown_with_evidence";
}

function currentOperation(error: string): string {
  const machine = error.match(/[A-Za-z][A-Za-z0-9]+Machine/iu)?.[0];
  const event = error.match(/HistoryEvent\([^)]{1,160}\)/u)?.[0];
  return [machine, event].filter(Boolean).join(": ") || "unresolved command boundary";
}

async function writeJson(path: string, value: unknown): Promise<void> {
  const contents = await prettierFormat(JSON.stringify(value), { filepath: path });
  await writeFile(path, contents, "utf8");
}

async function main(): Promise<void> {
  const rawDir = parseArg("--raw-dir");
  const outputDir = parseArg("--output-dir");
  const workflowsPath = parseArg("--workflows-path");
  await mkdir(outputDir, { recursive: true });
  const { Worker } = await import("@temporalio/worker");

  const classifications = [];
  const summary: Array<Record<string, unknown>> = [];
  for (const changeId of AFFECTED_POISONED_CHANGE_IDS) {
    const rawPath = join(rawDir, `${changeId}.raw-history.json`);
    const raw = JSON.parse(await readFile(rawPath, "utf8")) as TemporalHistory;
    if (!Array.isArray(raw.events) || raw.events.length === 0) {
      throw new Error(`${changeId}: exported history has no events.`);
    }
    let incident = [...raw.events]
      .reverse()
      .map((event) => ({ event, error: replayError(event) }))
      .find((candidate) => candidate.error);
    let replayedCleanly = false;
    if (!incident?.error) {
      try {
        await Worker.runReplayHistory(
          { workflowsPath, replayName: `${changeId} poisoned production history` },
          raw,
          `adv/change/bdf259aa162ae192af5b18899ccdc653b085528d/${changeId}`,
        );
        replayedCleanly = true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const eventId = message.match(/HistoryEvent\(id:\s*(\d+)/u)?.[1];
        const event =
          raw.events.find((candidate) => candidate.eventId === eventId) ??
          raw.events[raw.events.length - 1];
        if (event) incident = { event, error: message };
      }
    }
    if (replayedCleanly) {
      const event = raw.events[raw.events.length - 1];
      if (!event) throw new Error(`${changeId}: exported history has no events.`);
      incident = {
        event,
        error:
          "Captured production history replays cleanly against current source; historical live failure is therefore classified as worker bundle identity drift rather than a current workflow-code divergence.",
      };
    }
    if (!incident?.error) {
      throw new Error(`${changeId}: replay produced no terminal classification.`);
    }

    const sanitized = sanitizeHistoryForFixture(raw) as TemporalHistory;
    const audit = auditSanitizedHistory(sanitized);
    if (!audit.safe) {
      throw new Error(
        `${changeId}: sanitization audit failed at ${audit.findings.join(", ")}.`,
      );
    }
    let sanitizedReplayError: string | undefined;
    try {
      await Worker.runReplayHistory(
        { workflowsPath, replayName: `${changeId} sanitized production history` },
        sanitized,
        `adv/change/bdf259aa162ae192af5b18899ccdc653b085528d/${changeId}`,
      );
    } catch (error) {
      sanitizedReplayError = error instanceof Error ? error.message : String(error);
    }

    const stem = `${changeId}.poisoned-production`;
    const historyPath = join(outputDir, `${stem}.history.json`);
    const metadataPath = join(outputDir, `${stem}.metadata.json`);
    const classificationPath = join(outputDir, `${stem}.classification.json`);
    const failingEventId = Number(incident.event.eventId);
    const sanitizedImmutable = replayedCleanly && Boolean(sanitizedReplayError);
    const row = PoisonedHistoryClassificationSchema.parse({
      changeId,
      workflowId: `adv/change/bdf259aa162ae192af5b18899ccdc653b085528d/${changeId}`,
      fixture: basename(historyPath),
      failingEventId: Number.isFinite(failingEventId) ? failingEventId : 0,
      failingEventType:
        incident.event.eventType ?? "EVENT_TYPE_WORKFLOW_TASK_FAILED",
      observedError: incident.error.slice(0, 2_000),
      currentOperation: currentOperation(incident.error),
      cause: replayedCleanly ? "bundle_identity_mismatch" : classify(incident.error),
      outcome: sanitizedImmutable
        ? "immutable_history"
        : replayedCleanly
          ? "self_healed"
          : "reproduced",
      recoveryEvidence: sanitizedImmutable
        ? `Raw production history replays cleanly against current source, but deterministic payload sanitization changes branch-driving state and the safe committed fixture fails replay: ${sanitizedReplayError?.slice(0, 1_000)}`
        : undefined,
    });
    classifications.push(row);

    await writeJson(historyPath, sanitized);
    await writeJson(metadataPath, {
      name: `${changeId} poisoned production history`,
      workflowType: "changeWorkflow",
      workflowId: row.workflowId,
      source:
        "Captured from local Temporal with temporal workflow show --no-json-shorthand-payloads; deterministically sanitized before repository promotion.",
      covers: [row.observedError],
      expected: "Pre-fix replay reproduces the classified divergence.",
      sanitized: true,
      eventCount: sanitized.events?.length ?? 0,
      incidentEventId: String(row.failingEventId),
      incidentEventType: row.failingEventType,
      classification: basename(classificationPath),
    });
    await writeJson(classificationPath, row);
    summary.push({
      changeId,
      events: sanitized.events?.length ?? 0,
      incidentEventId: row.failingEventId,
      cause: row.cause,
      operation: row.currentOperation,
    });
  }

  assertCompletePoisonedHistoryClassifications(classifications);
  process.stdout.write(`${JSON.stringify({ outputDir, classifications: summary })}\n`);
}

await main();
