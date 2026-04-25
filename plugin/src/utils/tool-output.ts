/**
 * Tool Output Formatting
 *
 * Central utility for all ADV tool responses. Ensures:
 * 1. Compact JSON by default (saves ~15-25% tokens)
 * 2. Token-budget-aware truncation with valid JSON envelope
 * 3. Continuation protocol for paginated/truncated results
 * 4. Configurable via environment variables
 */

// =============================================================================
// Configuration
// =============================================================================

const ENV_MAX_CHARS = parseInt(process.env.ADV_TOOL_MAX_CHARS || "", 10);
const ENV_OUTPUT_MODE = process.env.ADV_TOOL_OUTPUT_MODE;

/** Hard character cap. Approximate ~6k tokens at 3.5 chars/token. */
const DEFAULT_MAX_CHARS = 21000;

/** Use compact JSON unless env says "pretty" */
const OUTPUT_MODE: "compact" | "pretty" =
  ENV_OUTPUT_MODE === "pretty" ? "pretty" : "compact";

const MAX_CHARS =
  !isNaN(ENV_MAX_CHARS) && ENV_MAX_CHARS > 0
    ? ENV_MAX_CHARS
    : DEFAULT_MAX_CHARS;

// =============================================================================
// Types
// =============================================================================

interface ToolOutputOptions {
  /** Tool name for truncation envelope */
  tool?: string;
  /** Override max chars for this call */
  maxChars?: number;
  /** Force pretty output for this call */
  pretty?: boolean;
}

interface PaginationMeta {
  /** Total items available */
  total: number;
  /** Number of items returned */
  returned: number;
  /** Offset of first returned item */
  offset: number;
  /** Whether more items exist */
  hasMore: boolean;
  /** Hint for next call */
  resumeHint?: string;
}

interface TruncationEnvelope {
  _truncated: true;
  _meta: {
    totalChars: number;
    returnedChars: number;
    budgetChars: number;
    estTokensSaved: number;
  };
  _hint: string;
  data: unknown;
}

function stringifyForSizing(value: unknown): string {
  return JSON.stringify(value) ?? "null";
}

// =============================================================================
// Core
// =============================================================================

/**
 * Serialize data to JSON string respecting output mode and budget.
 *
 * - Compact by default (no indentation)
 * - Truncates with valid JSON envelope if over budget
 * - Never returns invalid JSON
 */
export function formatToolOutput(
  data: unknown,
  options?: ToolOutputOptions,
): string {
  const indent = options?.pretty || OUTPUT_MODE === "pretty" ? 2 : undefined;
  const maxChars = options?.maxChars ?? MAX_CHARS;

  const serialized = JSON.stringify(data, null, indent);

  if (serialized.length <= maxChars) {
    return serialized;
  }

  return buildTruncationEnvelope(data, serialized.length, maxChars, options);
}

/**
 * Build a valid JSON truncation envelope that fits within budget.
 */
function buildTruncationEnvelope(
  data: unknown,
  totalChars: number,
  maxChars: number,
  options?: ToolOutputOptions,
): string {
  const estTokensSaved = Math.round((totalChars - maxChars) / 3.5);

  // Try to produce a useful preview
  const preview = buildPreview(data, maxChars);

  const envelope: TruncationEnvelope = {
    _truncated: true,
    _meta: {
      totalChars,
      returnedChars: 0, // filled below
      budgetChars: maxChars,
      estTokensSaved,
    },
    _hint: options?.tool
      ? `Output exceeded ${maxChars} char budget. Use more specific filters or pagination.`
      : `Output exceeded ${maxChars} char budget.`,
    data: preview,
  };

  const result = JSON.stringify(envelope);
  envelope._meta.returnedChars = result.length;
  return JSON.stringify(envelope);
}

/**
 * Build a useful preview of data that fits within a char budget.
 *
 * Strategies:
 * - Arrays: return first N items + count
 * - Objects with arrays: truncate the largest array fields
 * - Primitive/small: return as-is
 */
function buildPreview(data: unknown, maxChars: number): unknown {
  // Reserve chars for envelope overhead
  const budget = Math.max(maxChars - 500, maxChars * 0.7);

  if (data === null || data === undefined) return data;
  if (typeof data !== "object") return data;

  if (Array.isArray(data)) {
    return truncateArray(data, budget);
  }

  // Object: try to fit, truncating large array fields first
  const obj = data as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  // Sort fields: put small fields first, large arrays last
  const entries = Object.entries(obj).sort(([, a], [, b]) => {
    const sizeA = stringifyForSizing(a).length;
    const sizeB = stringifyForSizing(b).length;
    return sizeA - sizeB;
  });

  let usedChars = 2; // {}
  for (const [key, value] of entries) {
    const serialized = stringifyForSizing(value);

    if (usedChars + key.length + serialized.length + 4 <= budget) {
      result[key] = value;
      usedChars += key.length + serialized.length + 4; // "key":value,
    } else if (Array.isArray(value)) {
      // Truncate the array to fit
      const remaining = budget - usedChars - key.length - 10;
      if (remaining > 50) {
        result[key] = truncateArray(value, remaining);
        usedChars = budget; // consumed remaining
      } else {
        result[key] = `[${value.length} items truncated]`;
        usedChars += key.length + 30;
      }
    } else if (typeof value === "string" && serialized.length > 200) {
      const remaining = Math.max(100, budget - usedChars - key.length - 10);
      result[key] = (value as string).slice(0, remaining) + "...";
      usedChars += key.length + remaining + 10;
    } else {
      result[key] = `[truncated: ${serialized.length} chars]`;
      usedChars += key.length + 30;
    }
  }

  return result;
}

/**
 * Truncate an array to fit within a char budget.
 * Returns first N items that fit + a summary item.
 */
function truncateArray(arr: unknown[], budget: number): unknown[] {
  if (arr.length === 0) return arr;

  const result: unknown[] = [];
  let usedChars = 2; // []
  const summarySize = 60; // reserve for summary

  for (const item of arr) {
    const serialized = stringifyForSizing(item);
    if (usedChars + serialized.length + 2 <= budget - summarySize) {
      result.push(item);
      usedChars += serialized.length + 2;
    } else {
      break;
    }
  }

  if (result.length < arr.length) {
    result.push({
      _more: `${arr.length - result.length} of ${arr.length} items not shown`,
    });
  }

  return result;
}

// =============================================================================
// Pagination Helpers
// =============================================================================

/**
 * Apply pagination to an array and return items + metadata.
 */
export function paginate<T>(
  items: T[],
  options: { limit?: number; offset?: number; tool?: string; args?: string },
): { items: T[]; pagination: PaginationMeta } {
  const limit = Math.min(options.limit ?? 50, 200);
  const offset = options.offset ?? 0;

  const sliced = items.slice(offset, offset + limit);
  const hasMore = offset + limit < items.length;

  return {
    items: sliced,
    pagination: {
      total: items.length,
      returned: sliced.length,
      offset,
      hasMore,
      resumeHint: hasMore
        ? `${options.tool ?? "tool"}(${options.args ? options.args + ", " : ""}offset: ${offset + limit}, limit: ${limit})`
        : undefined,
    },
  };
}

// =============================================================================
// Exports for convenience
// =============================================================================

/** Compact JSON.stringify (no indentation) */
function _compact(data: unknown): string {
  return JSON.stringify(data);
}
