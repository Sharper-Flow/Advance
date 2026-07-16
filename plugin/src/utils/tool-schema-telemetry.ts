import { Buffer } from "node:buffer";
import { z } from "zod";

export type ToolSchemaTelemetryEntry = readonly [
  name: string,
  args: Record<string, unknown>,
];

export interface AvailableToolSchemaTelemetry {
  status: "available";
  schema_bytes: number;
  /** Advisory estimate only; UTF-8 bytes divided by four is not tokenizer exact. */
  approx_tokens_4char_rule: number;
}

export interface FailedToolSchemaTelemetry {
  status: "conversion_error";
  schema_bytes: null;
  approx_tokens_4char_rule: null;
  conversion_error: string;
}

export type ToolSchemaTelemetry =
  | AvailableToolSchemaTelemetry
  | FailedToolSchemaTelemetry;

export interface ToolSchemaManifest {
  total_tools: number;
  total_schema_bytes: number;
  total_approx_tokens_4char_rule: number;
  conversion_errors: number;
  tools: Record<string, ToolSchemaTelemetry>;
}

let manifest: ToolSchemaManifest = emptyManifest();
let lastInput: readonly ToolSchemaTelemetryEntry[] | undefined;

function emptyManifest(): ToolSchemaManifest {
  return {
    total_tools: 0,
    total_schema_bytes: 0,
    total_approx_tokens_4char_rule: 0,
    conversion_errors: 0,
    tools: {},
  };
}

/**
 * Measure the same JSON Schema payload OpenCode receives for each ADV tool.
 * Conversion failure is isolated to a tool so plugin initialization remains
 * fail-open and the health surface can expose the invalid definition.
 */
export function buildToolSchemaManifest(
  entries: readonly ToolSchemaTelemetryEntry[],
): ToolSchemaManifest {
  const next = emptyManifest();

  for (const [name, args] of entries) {
    if (!name.startsWith("adv_")) continue;
    next.total_tools++;
    try {
      const schema = z.toJSONSchema(z.object(args as z.ZodRawShape));
      const serialized = JSON.stringify(schema);
      if (typeof serialized !== "string") {
        throw new Error("Schema serialization produced no JSON string");
      }
      const bytes = Buffer.byteLength(serialized, "utf8");
      const approxTokens = Math.ceil(bytes / 4);
      next.tools[name] = {
        status: "available",
        schema_bytes: bytes,
        approx_tokens_4char_rule: approxTokens,
      };
      next.total_schema_bytes += bytes;
      next.total_approx_tokens_4char_rule += approxTokens;
    } catch (error) {
      next.conversion_errors++;
      next.tools[name] = {
        status: "conversion_error",
        schema_bytes: null,
        approx_tokens_4char_rule: null,
        conversion_error:
          error instanceof Error ? error.message : String(error),
      };
    }
  }

  return next;
}

/** Compute and retain the init-time manifest. Not called on the request path.
 * Memoized on the same static entry array so repeated plugin inits avoid
 * re-serializing every tool schema.
 */
export function initializeToolSchemaTelemetry(
  entries: readonly ToolSchemaTelemetryEntry[],
): ToolSchemaManifest {
  if (entries !== lastInput) {
    manifest = buildToolSchemaManifest(entries);
    lastInput = entries;
  }
  return getToolSchemaManifest();
}

/** Return a defensive copy so status rendering cannot mutate telemetry state. */
export function getToolSchemaManifest(): ToolSchemaManifest {
  return {
    ...manifest,
    tools: Object.fromEntries(
      Object.entries(manifest.tools).map(([name, entry]) => [
        name,
        { ...entry },
      ]),
    ),
  };
}

/** Test-only reset, paired with the session-reset behavior in plugin init. */
export function resetToolSchemaTelemetry(): void {
  manifest = emptyManifest();
  lastInput = undefined;
}
