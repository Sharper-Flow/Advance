import { z } from "zod";

export const AFFECTED_POISONED_CHANGE_IDS = [
  "fixArchiveDeltaReconciliation",
  "fixHealthViewTimeouts",
  "fixScopeRepoFixture",
  "makeLegacyDesignValidation",
  "refineTestEvidencePolicy",
  "addArchiveScaleRegression",
] as const;

const AffectedChangeIdSchema = z.enum(AFFECTED_POISONED_CHANGE_IDS);

export const ReplayDivergenceCauseSchema = z.enum([
  "patch_branch_unreachable",
  "activity_order_mismatch",
  "timer_order_mismatch",
  "search_attribute_order_mismatch",
  "bundle_identity_mismatch",
  "unknown_with_evidence",
]);

export type ReplayDivergenceCause = z.infer<typeof ReplayDivergenceCauseSchema>;

export const PoisonedHistoryClassificationSchema = z
  .object({
    changeId: AffectedChangeIdSchema,
    workflowId: z.string().min(1),
    fixture: z.string().min(1),
    failingEventId: z.number().int().nonnegative(),
    failingEventType: z.string().min(1),
    observedError: z.string().min(1),
    currentOperation: z.string().min(1),
    introducingCommit: z
      .string()
      .regex(/^[0-9a-f]{7,40}$/)
      .optional(),
    cause: ReplayDivergenceCauseSchema,
    outcome: z.enum(["reproduced", "self_healed", "immutable_history"]),
    recoveryEvidence: z.string().min(1).optional(),
  })
  .superRefine((row, ctx) => {
    if (row.outcome === "immutable_history" && !row.recoveryEvidence) {
      ctx.addIssue({
        code: "custom",
        path: ["recoveryEvidence"],
        message: "recoveryEvidence is required for immutable_history",
      });
    }
  });

export type PoisonedHistoryClassification = z.infer<
  typeof PoisonedHistoryClassificationSchema
>;

export function assertCompletePoisonedHistoryClassifications(
  input: unknown[],
  options: { requireTerminal?: boolean } = {},
): PoisonedHistoryClassification[] {
  const rows = input.map((row) =>
    PoisonedHistoryClassificationSchema.parse(row),
  );
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.changeId, (counts.get(row.changeId) ?? 0) + 1);
  }

  const duplicate = AFFECTED_POISONED_CHANGE_IDS.filter(
    (changeId) => (counts.get(changeId) ?? 0) > 1,
  );
  const missing = AFFECTED_POISONED_CHANGE_IDS.filter(
    (changeId) => !counts.has(changeId),
  );
  if (duplicate.length > 0 || missing.length > 0) {
    throw new Error(
      `Classification coverage invalid: duplicate=[${duplicate.join(", ")}], missing=[${missing.join(", ")}].`,
    );
  }
  if (options.requireTerminal) {
    const pending = rows
      .filter((row) => row.outcome === "reproduced")
      .map((row) => row.changeId);
    if (pending.length > 0) {
      throw new Error(
        `Classification outcomes are not terminal: [${pending.join(", ")}].`,
      );
    }
  }
  return rows;
}

const SENSITIVE_KEY = /^(proposal|agreement|task|tasks|evidence|acceptance)$/i;
const SECRET_TEXT =
  /(?:api[_-]?key|secret|token|password|private[_-]?key)\s*[:=]/i;
const REPLAY_PLACEHOLDER = { redacted: true, kind: "adv-payload" } as const;
const REDACTED_TEXT = "[REDACTED]";

export interface SanitizationAudit {
  safe: boolean;
  findings: string[];
}

function decodePayloadData(data: string): unknown {
  try {
    return JSON.parse(Buffer.from(data, "base64").toString("utf8"));
  } catch {
    return undefined;
  }
}

function containsSensitiveValue(value: unknown): boolean {
  if (typeof value === "string") return SECRET_TEXT.test(value);
  if (Array.isArray(value)) return value.some(containsSensitiveValue);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(
    ([key, nested]) =>
      SENSITIVE_KEY.test(key)
        ? !isRedactedValue(nested)
        : containsSensitiveValue(nested),
  );
}

function isRedactedValue(value: unknown): boolean {
  if (value === REDACTED_TEXT) return true;
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.every(isRedactedValue);
  if (!value || typeof value !== "object") return false;
  if (
    (value as Record<string, unknown>).redacted === true &&
    (value as Record<string, unknown>).kind === "adv-payload"
  ) {
    return true;
  }
  return Object.values(value as Record<string, unknown>).every((nested) =>
    typeof nested === "string"
      ? nested === REDACTED_TEXT
      : isRedactedValue(nested),
  );
}

function redactAllText(value: unknown): unknown {
  if (typeof value === "string") return REDACTED_TEXT;
  if (Array.isArray(value)) return value.map(redactAllText);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
      key,
      redactAllText(nested),
    ]),
  );
}

function redactDecodedPayload(value: unknown): unknown {
  if (typeof value === "string") {
    return SECRET_TEXT.test(value) ? REDACTED_TEXT : value;
  }
  if (Array.isArray(value)) return value.map(redactDecodedPayload);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
      key,
      SENSITIVE_KEY.test(key)
        ? redactAllText(nested)
        : redactDecodedPayload(nested),
    ]),
  );
}

function walkPayloadData(
  value: unknown,
  visit: (data: string, path: string) => void,
  path = "$",
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      walkPayloadData(item, visit, `${path}[${index}]`),
    );
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(
    value as Record<string, unknown>,
  )) {
    const nextPath = `${path}.${key}`;
    if (key === "data" && typeof nested === "string") visit(nested, nextPath);
    else walkPayloadData(nested, visit, nextPath);
  }
}

export function auditSanitizedHistory(history: unknown): SanitizationAudit {
  const findings: string[] = [];
  walkPayloadData(history, (data, path) => {
    const decoded = decodePayloadData(data);
    if (containsSensitiveValue(decoded)) findings.push(path);
  });
  return { safe: findings.length === 0, findings };
}

/**
 * Deterministically redact sensitive JSON payloads while preserving all
 * non-sensitive payload bytes (including Temporal core_patch marker ids).
 * Callers must replay the result before promoting it to a committed fixture.
 */
export function sanitizeHistoryForFixture(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeHistoryForFixture);
  if (!value || typeof value !== "object") return value;

  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (key === "identity" && typeof nested === "string") {
      out[key] = "temporal-cli@replay-host";
      continue;
    }
    if (key === "data" && typeof nested === "string") {
      const decoded = decodePayloadData(nested);
      if (containsSensitiveValue(decoded)) {
        const redacted = redactDecodedPayload(decoded);
        out[key] = Buffer.from(
          JSON.stringify(redacted ?? REPLAY_PLACEHOLDER),
        ).toString("base64");
      } else {
        out[key] = nested;
      }
      continue;
    }
    out[key] = sanitizeHistoryForFixture(nested);
  }
  return out;
}
