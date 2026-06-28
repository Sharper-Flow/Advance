import { describe, expect, test } from "vitest";
import {
  parseDecisionRationaleBlock,
  SourceMarkerMalformedError,
} from "./source-marker";
import { parseWarrantTag } from "./warrant";

const validBlock = `Decision rationale (major decision):
- Chosen direction: Nest rationale inside ## Chosen direction. [source: spec:rq-handoffVoice01]
- Why it fits: Preserves the existing spine. [source: docs/command-voice-standard.md#gate-handoff-voice]
- Alternatives rejected/deferred: Top-level heading rejected. [source: agreement:DONT1]
- Re-evaluation trigger: trigger_kind: event; when Gate Handoff Voice changes. [source: contract:AC5]`;

describe("parseDecisionRationaleBlock", () => {
  test("parses all required fields and typed trigger kind", () => {
    expect(parseDecisionRationaleBlock(validBlock)).toEqual({
      fields: {
        chosenDirection: {
          text: "Nest rationale inside ## Chosen direction.",
          source: "spec:rq-handoffVoice01",
        },
        whyItFits: {
          text: "Preserves the existing spine.",
          source: "docs/command-voice-standard.md#gate-handoff-voice",
        },
        alternatives: {
          text: "Top-level heading rejected.",
          source: "agreement:DONT1",
        },
        reEvaluationTrigger: {
          text: "trigger_kind: event; when Gate Handoff Voice changes.",
          source: "contract:AC5",
          triggerKind: "event",
          condition: "when Gate Handoff Voice changes.",
        },
      },
    });
  });

  test("rejects missing source markers", () => {
    expect(() =>
      parseDecisionRationaleBlock(
        validBlock.replace(" [source: agreement:DONT1]", ""),
      ),
    ).toThrow(SourceMarkerMalformedError);
  });

  test("rejects missing trigger kind", () => {
    expect(() =>
      parseDecisionRationaleBlock(
        validBlock.replace("trigger_kind: event; ", ""),
      ),
    ).toThrow(/trigger_kind/);
  });

  test("rejects trigger kind without concrete condition", () => {
    expect(() =>
      parseDecisionRationaleBlock(
        validBlock.replace(
          "trigger_kind: event; when Gate Handoff Voice changes.",
          "trigger_kind: event",
        ),
      ),
    ).toThrow(/concrete condition/);
  });

  test("rejects extra rationale fields", () => {
    expect(() =>
      parseDecisionRationaleBlock(
        `${validBlock}\n- Extra field: not allowed. [source: agreement:AC1]`,
      ),
    ).toThrow(/exactly four rationale fields/);
  });

  test.each(["date", "metric", "event", "state"])(
    "accepts trigger kind %s",
    (kind) => {
      expect(
        parseDecisionRationaleBlock(
          validBlock.replace("trigger_kind: event", `trigger_kind: ${kind}`),
        ).fields.reEvaluationTrigger.triggerKind,
      ).toBe(kind);
    },
  );

  test("source markers are not warrant tags", () => {
    const parsed = parseWarrantTag(
      "Criterion uses rationale citation. [source: spec:rq-handoffVoice01]",
    );

    expect(parsed.refs).toEqual([]);
    expect(parsed.text).toContain("[source: spec:rq-handoffVoice01]");
  });
});
