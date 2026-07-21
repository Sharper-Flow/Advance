import { describe, expect, it } from "vitest";
import {
  AFFECTED_POISONED_CHANGE_IDS,
  PoisonedHistoryClassificationSchema,
  assertCompletePoisonedHistoryClassifications,
  auditSanitizedHistory,
  sanitizeHistoryForFixture,
} from "./replay-history-classification";

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

  it("requires concrete recovery evidence for immutable histories", () => {
    expect(() =>
      PoisonedHistoryClassificationSchema.parse({
        ...classification(AFFECTED_POISONED_CHANGE_IDS[0]),
        outcome: "immutable_history",
      }),
    ).toThrow(/recoveryEvidence/i);
  });
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

    expect(auditSanitizedHistory(history)).toEqual({ safe: true, findings: [] });
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
      Buffer.from(sanitized.events[0].input.payloads[0].data, "base64").toString(
        "utf8",
      ),
    ) as Record<string, unknown>;

    expect(decoded).toEqual({
      id: "change-id",
      proposal: "[REDACTED]",
      status: "draft",
    });
    expect(auditSanitizedHistory(sanitized)).toEqual({ safe: true, findings: [] });
  });
});
