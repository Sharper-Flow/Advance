export type DecisionRationaleTriggerKind =
  | "date"
  | "metric"
  | "event"
  | "state";

export interface DecisionRationaleField {
  text: string;
  source: string;
}

export interface DecisionRationaleTriggerField extends DecisionRationaleField {
  triggerKind: DecisionRationaleTriggerKind;
  condition: string;
}

export interface ParsedDecisionRationaleBlock {
  fields: {
    chosenDirection: DecisionRationaleField;
    whyItFits: DecisionRationaleField;
    alternatives: DecisionRationaleField;
    reEvaluationTrigger: DecisionRationaleTriggerField;
  };
}

export class SourceMarkerMalformedError extends Error {
  constructor(message: string) {
    super(`SOURCE_MARKER_MALFORMED: ${message}`);
    this.name = "SourceMarkerMalformedError";
  }
}

const SOURCE_MARKER = /\[source:\s*([^\]]+)\]/i;
const SOURCE_REF =
  /^(?:spec:[A-Za-z0-9][A-Za-z0-9_-]*|agreement:[A-Z]+\d+|contract:[A-Z]+\d+|adr:\d{4}|[A-Za-z0-9_./-]+(?:#[A-Za-z0-9_.-]+)?)$/;
const TRIGGER_KIND = /trigger_kind:\s*(date|metric|event|state)\b\s*;\s*(.+)$/i;

function parseField(raw: string, label: string): DecisionRationaleField {
  const prefix = `- ${label}:`;
  if (!raw.startsWith(prefix)) {
    throw new SourceMarkerMalformedError(`missing field ${label}`);
  }
  const value = raw.slice(prefix.length).trim();
  const sourceMatch = value.match(SOURCE_MARKER);
  if (!sourceMatch) {
    throw new SourceMarkerMalformedError(`missing source marker for ${label}`);
  }
  const source = (sourceMatch[1] ?? "").trim();
  if (!SOURCE_REF.test(source)) {
    throw new SourceMarkerMalformedError(
      `invalid source marker "${source}" for ${label}`,
    );
  }
  const text = value.replace(SOURCE_MARKER, "").replace(/\s+/g, " ").trim();
  if (!text) {
    throw new SourceMarkerMalformedError(`empty field ${label}`);
  }
  return { text, source };
}

function parseTrigger(raw: string): DecisionRationaleTriggerField {
  const parsed = parseField(raw, "Re-evaluation trigger");
  const triggerMatch = parsed.text.match(TRIGGER_KIND);
  if (!triggerMatch) {
    throw new SourceMarkerMalformedError(
      "Re-evaluation trigger must include trigger_kind: date|metric|event|state; concrete condition",
    );
  }
  const condition = (triggerMatch[2] ?? "").trim();
  if (!condition) {
    throw new SourceMarkerMalformedError(
      "Re-evaluation trigger must include a concrete condition",
    );
  }
  return {
    ...parsed,
    triggerKind: triggerMatch[1]!.toLowerCase() as DecisionRationaleTriggerKind,
    condition,
  };
}

export function parseDecisionRationaleBlock(
  raw: string,
): ParsedDecisionRationaleBlock {
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines[0] !== "Decision rationale (major decision):") {
    throw new SourceMarkerMalformedError(
      "block must start with Decision rationale (major decision):",
    );
  }

  if (lines.length !== 5) {
    throw new SourceMarkerMalformedError(
      "block must contain exactly four rationale fields",
    );
  }

  return {
    fields: {
      chosenDirection: parseField(lines[1] ?? "", "Chosen direction"),
      whyItFits: parseField(lines[2] ?? "", "Why it fits"),
      alternatives: parseField(
        lines[3] ?? "",
        "Alternatives rejected/deferred",
      ),
      reEvaluationTrigger: parseTrigger(lines[4] ?? ""),
    },
  };
}
