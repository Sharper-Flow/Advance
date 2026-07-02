/**
 * Approval Consequence Context Builder
 *
 * Pure helper that renders the bounded summary an approver (human or ADV
 * gate) needs before signing off on a change. Enforces a stable 8-category
 * vocabulary, a finite status vocabulary, and evidence pointers for every
 * row. It never emits raw logs, diffs, task lists, or full scanner reports.
 */

// ─── Vocabulary ─────────────────────────────────────────────────────────────

export type ApprovalConsequenceStatus =
  | "pass"
  | "warning"
  | "blocked"
  | "pending"
  | "n/a";

export type ApprovalConsequenceCategory =
  | "delivered_value"
  | "enabling_only_dependency"
  | "ops_readiness"
  | "migration_data_impact"
  | "frontend_preview_impact"
  | "collision_release_risk"
  | "open_follow_ups"
  | "next_action";

/** Stable category order used by the renderer. */
export const APPROVAL_CONSEQUENCE_CATEGORIES: ApprovalConsequenceCategory[] = [
  "delivered_value",
  "enabling_only_dependency",
  "ops_readiness",
  "migration_data_impact",
  "frontend_preview_impact",
  "collision_release_risk",
  "open_follow_ups",
  "next_action",
];

/** Human-readable labels for each category key. */
export const APPROVAL_CONSEQUENCE_LABELS: Record<
  ApprovalConsequenceCategory,
  string
> = {
  delivered_value: "delivered value",
  enabling_only_dependency: "enabling-only/follow-up dependency",
  ops_readiness: "ops readiness",
  migration_data_impact: "migration/data impact",
  frontend_preview_impact: "frontend/preview impact",
  collision_release_risk: "collision/release risk",
  open_follow_ups: "open follow-ups",
  next_action: "next action",
};

// ─── Input types ────────────────────────────────────────────────────────────

export interface ApprovalConsequenceCategoryInput {
  status: ApprovalConsequenceStatus;
  /** Brief evidence or N/A rationale. Must be non-empty. */
  evidence: string;
  /** Optional pointer to the source of the evidence (file, report, contract). */
  source?: string;
}

export interface ApprovalConsequenceContextInput {
  /** One entry for every category in APPROVAL_CONSEQUENCE_CATEGORIES. */
  categories: Record<
    ApprovalConsequenceCategory,
    ApprovalConsequenceCategoryInput
  >;
  /** Optional byte budget; output is truncated past this limit. */
  maxBytes?: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_MAX_BYTES = 4_000;
const MAX_EVIDENCE_CHARS = 600;
const UTF8_ENCODER = new TextEncoder();

// ─── Helpers ────────────────────────────────────────────────────────────────

function assertValidStatus(
  status: string,
): asserts status is ApprovalConsequenceStatus {
  const valid: readonly string[] = [
    "pass",
    "warning",
    "blocked",
    "pending",
    "n/a",
  ];
  if (!valid.includes(status)) {
    throw new TypeError(
      `Invalid approval consequence status: ${status}. ` +
        `Expected one of ${valid.join(", ")}.`,
    );
  }
}

function validateEvidence(
  category: ApprovalConsequenceCategory,
  evidence: string,
): void {
  if (evidence == null) {
    throw new TypeError(
      `Approval consequence category "${category}" is missing evidence. ` +
        `Provide a brief rationale or source pointer; do not render missing ` +
        `required evidence as n/a.`,
    );
  }

  const trimmed = evidence.trim();
  if (trimmed.length === 0) {
    throw new TypeError(
      `Approval consequence category "${category}" has empty evidence. ` +
        `Provide a brief rationale or source pointer; do not render missing ` +
        `required evidence as n/a.`,
    );
  }
}

function truncateEvidence(evidence: string): string {
  if (evidence.length <= MAX_EVIDENCE_CHARS) return evidence;
  const marker = " [...]";
  return (
    evidence.slice(0, Math.max(0, MAX_EVIDENCE_CHARS - marker.length)) + marker
  );
}

function renderRow(
  index: number,
  category: ApprovalConsequenceCategory,
  input: ApprovalConsequenceCategoryInput,
): string {
  assertValidStatus(input.status);
  validateEvidence(category, input.evidence);

  const lines: string[] = [
    `${index + 1}. ${category}: ${APPROVAL_CONSEQUENCE_LABELS[category]} — ${input.status}`,
    `   Evidence: ${truncateEvidence(input.evidence.trim())}`,
  ];

  if (input.source && input.source.trim().length > 0) {
    lines.push(`   Source: ${input.source.trim()}`);
  }

  return lines.join("\n");
}

function applyByteBudget(text: string, maxBytes: number): string {
  if (UTF8_ENCODER.encode(text).length <= maxBytes) return text;

  const marker =
    "\n\n[...truncated for approval consequence context budget...]";
  const markerBytes = UTF8_ENCODER.encode(marker).length;
  if (maxBytes <= markerBytes) {
    let usedBytes = 0;
    let truncatedMarker = "";
    for (const char of marker) {
      const charBytes = UTF8_ENCODER.encode(char).length;
      if (usedBytes + charBytes > maxBytes) break;
      truncatedMarker += char;
      usedBytes += charBytes;
    }
    return truncatedMarker;
  }

  const contentByteBudget = Math.max(0, maxBytes - markerBytes);
  let usedBytes = 0;
  let truncated = "";

  for (const char of text) {
    const charBytes = UTF8_ENCODER.encode(char).length;
    if (usedBytes + charBytes > contentByteBudget) break;
    truncated += char;
    usedBytes += charBytes;
  }

  return truncated + marker;
}

// ─── Orchestrator ───────────────────────────────────────────────────────────

/**
 * Render an approval consequence context block.
 *
 * Enforces:
 *   - exactly the 8 categories in APPROVAL_CONSEQUENCE_CATEGORIES order
 *   - finite status vocabulary
 *   - non-empty evidence for every row (no silent n/a fallback)
 *   - per-row evidence cap and overall byte budget
 */
export function buildApprovalConsequenceContext(
  input: ApprovalConsequenceContextInput,
): string {
  const rows: string[] = [];

  for (let i = 0; i < APPROVAL_CONSEQUENCE_CATEGORIES.length; i++) {
    const category = APPROVAL_CONSEQUENCE_CATEGORIES[i];
    const categoryInput = input.categories[category];
    if (!categoryInput) {
      throw new TypeError(
        `Missing approval consequence category: ${category}. ` +
          `All 8 categories are required.`,
      );
    }
    rows.push(renderRow(i, category, categoryInput));
  }

  const combined = rows.join("\n\n");
  return applyByteBudget(combined, input.maxBytes ?? DEFAULT_MAX_BYTES);
}
