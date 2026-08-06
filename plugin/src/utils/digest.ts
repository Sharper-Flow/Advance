export const SIGNAL_REJECTION_PAYLOAD_SAMPLE_CHARS = 256;

export interface SignalPayloadDigest {
  payload_size: number;
  payload_sample: string;
  payload_fnv1a: string;
}

function stableJson(value: unknown, inArray = false): string | undefined {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
    case "boolean":
      return JSON.stringify(value);
    case "number":
      return Number.isFinite(value) ? JSON.stringify(value) : "null";
    case "undefined":
    case "function":
    case "symbol":
      return inArray ? "null" : undefined;
    case "bigint":
      return JSON.stringify(value.toString());
    case "object":
      break;
  }
  if (Array.isArray(value))
    return `[${value.map((v) => stableJson(v, true) ?? "null").join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => {
      const rendered = stableJson(record[key]);
      return rendered === undefined
        ? undefined
        : `${JSON.stringify(key)}:${rendered}`;
    })
    .filter((entry): entry is string => entry !== undefined)
    .join(",")}}`;
}

export function stableStringify(value: unknown): string {
  return stableJson(value) ?? "null";
}
export function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
export function describePayloadDigest(payload: unknown): SignalPayloadDigest {
  const rendered = stableStringify(payload);
  return {
    payload_size: rendered.length,
    payload_sample: rendered.slice(0, SIGNAL_REJECTION_PAYLOAD_SAMPLE_CHARS),
    payload_fnv1a: fnv1a32(rendered),
  };
}
const TRANSPORT_ONLY_COMMAND_PATHS = new Set([
  "updatedAt",
  "addedAt",
  "cancelledAt",
  "completedAt",
  "reenteredAt",
  "modifiedAt",
  "amendedAt",
  "retractedAt",
  "removedAt",
  "renamedAt",
  "task.created_at",
  "entry.recorded_at",
]);
const COMMAND_ENVELOPE_KEYS = new Set([
  "operation_id",
  "command_kind",
  "payload_hash",
  "mutationReceiptId",
]);
function sanitizeForCommandHash(value: unknown, path: string[] = []): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value))
    return value.map((entry) => sanitizeForCommandHash(entry, path));
  const record = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    const keyPath = [...path, key].join(".");
    if (
      TRANSPORT_ONLY_COMMAND_PATHS.has(keyPath) ||
      COMMAND_ENVELOPE_KEYS.has(key)
    )
      continue;
    out[key] = sanitizeForCommandHash(record[key], [...path, key]);
  }
  return out;
}
export function canonicalCommandPayloadString(payload: unknown): string {
  return stableStringify(sanitizeForCommandHash(payload));
}
