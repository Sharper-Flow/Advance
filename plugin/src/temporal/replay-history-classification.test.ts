import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  AFFECTED_POISONED_CHANGE_IDS,
  POISONED_HISTORY_RECOVERY_TARGET,
  PoisonedHistoryClassificationSchema,
  assertCompletePoisonedHistoryClassifications,
  auditSanitizedHistory,
  classifyReplayNondeterminismError,
  sanitizeHistoryForFixture,
} from "./replay-history-classification";

async function readJson<T>(url: URL): Promise<T> {
  return JSON.parse(await readFile(url, "utf8")) as T;
}

function classification(changeId: string) {
  return {
    changeId,
    workflowId: `adv/change/project/${changeId}`,
    fixture: `${changeId}.history.json`,
    failingEventId: 42,
    failingEventType: "EVENT_TYPE_WORKFLOW_TASK_FAILED",
    observedError: "TMPRL1100 replay divergence",
    currentOperation: "scheduleActivity:writeProjectionActivity",
    cause: "activity_order_mismatch" as const,
    outcome: "self_healed" as const,
  };
}

describe("poisoned history classification", () => {
  it("accepts exactly one classification for each affected workflow", () => {
    const rows = AFFECTED_POISONED_CHANGE_IDS.map(classification);

    expect(assertCompletePoisonedHistoryClassifications(rows)).toEqual(rows);
  });

  it("rejects duplicate and missing affected workflows", () => {
    const rows = AFFECTED_POISONED_CHANGE_IDS.slice(0, -1).map(classification);
    rows.push(classification(rows[0].changeId));

    expect(() => assertCompletePoisonedHistoryClassifications(rows)).toThrow(
      /duplicate.*missing/i,
    );
  });

  it("requires concrete recovery evidence and target for immutable histories", () => {
    expect(() =>
      PoisonedHistoryClassificationSchema.parse({
        ...classification(AFFECTED_POISONED_CHANGE_IDS[0]),
        outcome: "immutable_history",
      }),
    ).toThrow(/recoveryEvidence/i);
    expect(() =>
      PoisonedHistoryClassificationSchema.parse({
        ...classification(AFFECTED_POISONED_CHANGE_IDS[0]),
        outcome: "immutable_history",
        recoveryEvidence: "Recorded replay evidence",
      }),
    ).toThrow(/recoveryTarget/i);
  });

  it("rejects malformed immutable recovery targets and accepts self-healed rows without one", () => {
    expect(() =>
      PoisonedHistoryClassificationSchema.parse({
        ...classification(AFFECTED_POISONED_CHANGE_IDS[0]),
        outcome: "immutable_history",
        recoveryEvidence: "Recorded replay evidence",
        recoveryTarget: {
          ...POISONED_HISTORY_RECOVERY_TARGET,
          entryId: "wrong",
        },
      }),
    ).toThrow(/entryId/i);
    expect(() =>
      PoisonedHistoryClassificationSchema.parse({
        ...classification(AFFECTED_POISONED_CHANGE_IDS[0]),
        recoveryTarget: POISONED_HISTORY_RECOVERY_TARGET,
      }),
    ).toThrow(/only valid/i);
    expect(
      PoisonedHistoryClassificationSchema.parse(
        classification(AFFECTED_POISONED_CHANGE_IDS[0]),
      ),
    ).not.toHaveProperty("recoveryTarget");
  });
});

it("classifies the committed makeLegacyDesignValidation fixture as self-healed without immutable recovery fields", async () => {
  const classification = PoisonedHistoryClassificationSchema.parse(
    await readJson<unknown>(
      new URL(
        "./__tests__/replay/histories/makeLegacyDesignValidation.poisoned-production.classification.json",
        import.meta.url,
      ),
    ),
  );
  expect(classification.changeId).toBe("makeLegacyDesignValidation");
  expect(classification.outcome).toBe("self_healed");
  expect(classification).not.toHaveProperty("recoveryEvidence");
  expect(classification).not.toHaveProperty("recoveryTarget");
});

describe("sanitized history audit", () => {
  it("rejects user-authored and secret-bearing payload text", () => {
    const history = {
      events: [
        {
          workflowExecutionStartedEventAttributes: {
            input: {
              payloads: [
                {
                  metadata: { encoding: "json/plain" },
                  data: Buffer.from(
                    JSON.stringify({ proposal: "API_KEY=super-secret" }),
                  ).toString("base64"),
                },
              ],
            },
          },
        },
      ],
    };

    expect(auditSanitizedHistory(history)).toEqual(
      expect.objectContaining({ safe: false }),
    );
  });

  it("accepts bounded replay-safe placeholders", () => {
    const history = {
      events: [
        {
          activityTaskScheduledEventAttributes: {
            input: {
              payloads: [
                {
                  metadata: { encoding: "json/plain" },
                  data: Buffer.from(
                    JSON.stringify({ redacted: true, kind: "adv-payload" }),
                  ).toString("base64"),
                },
              ],
            },
          },
        },
      ],
    };

    expect(auditSanitizedHistory(history)).toEqual({
      safe: true,
      findings: [],
    });
  });

  it("redacts sensitive values without replacing surrounding payload shape", () => {
    const history = {
      events: [
        {
          input: {
            payloads: [
              {
                data: Buffer.from(
                  JSON.stringify({
                    id: "change-id",
                    proposal: "private proposal",
                    status: "draft",
                  }),
                ).toString("base64"),
              },
            ],
          },
        },
      ],
    };

    const sanitized = sanitizeHistoryForFixture(history) as typeof history;
    const decoded = JSON.parse(
      Buffer.from(
        sanitized.events[0].input.payloads[0].data,
        "base64",
      ).toString("utf8"),
    ) as Record<string, unknown>;

    expect(decoded).toEqual({
      id: "change-id",
      proposal: "[REDACTED]",
      status: "draft",
    });
    expect(auditSanitizedHistory(sanitized)).toEqual({
      safe: true,
      findings: [],
    });
  });

  it("rejects nested document, task, evidence, subagent-report, and secret payloads", () => {
    const history = {
      events: [
        {
          input: {
            payloads: [
              {
                data: Buffer.from(
                  JSON.stringify({
                    state: {
                      documents: { agreement: "private agreement" },
                      tasks: [{ title: "private task" }],
                      evidence: { proof: "private evidence" },
                      subagentReports: [{ summary: "private report" }],
                      nested: { credential: "token=super-secret" },
                    },
                  }),
                ).toString("base64"),
              },
            ],
          },
        },
      ],
    };

    expect(auditSanitizedHistory(history)).toEqual({
      safe: false,
      findings: ["$.events[0].input.payloads[0].data"],
    });
  });
});

describe("classifyReplayNondeterminismError", () => {
  it("classifies a TMPRL1100 message as TMPRL1100 evidence", () => {
    const error = new Error(
      "[TMPRL1100] Nondeterminism error: Activity machine does not handle this event: HistoryEvent(id: 479, UpsertWorkflowSearchAttributes)",
    );
    expect(classifyReplayNondeterminismError(error)).toEqual({
      kind: "TMPRL1100",
      evidence: error.message,
    });
  });

  it("classifies a plain Nondeterminism error as TMPRL1100 evidence", () => {
    const error = new Error(
      "Workflow activation completion failed: Nondeterminism: Timer machine does not handle this event",
    );
    expect(classifyReplayNondeterminismError(error)).toEqual({
      kind: "TMPRL1100",
      evidence: error.message,
    });
  });

  it("classifies an ADV-layer 'No command scheduled' text as TMPRL1100 evidence", () => {
    const error = new Error(
      "No command scheduled for event HistoryEvent(id: 42, WorkflowExecutionUpdateAccepted)",
    );
    expect(classifyReplayNondeterminismError(error)).toEqual({
      kind: "TMPRL1100",
      evidence: error.message,
    });
  });

  it("returns null for unrelated errors", () => {
    expect(
      classifyReplayNondeterminismError(new Error("network timeout")),
    ).toBeNull();
    expect(classifyReplayNondeterminismError("not an error")).toBeNull();
  });

  it("caps evidence at 500 characters", () => {
    const error = new Error(`[TMPRL1100] ${"x".repeat(1000)}`);
    const result = classifyReplayNondeterminismError(error);
    expect(result).not.toBeNull();
    expect(result!.evidence).toHaveLength(500);
  });
});
