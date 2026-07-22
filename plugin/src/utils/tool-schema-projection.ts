import type { ToolSchemaManifest } from "./tool-schema-telemetry";

export interface ToolSchemaProjection {
  availability: "available" | "unavailable" | "stale";
  enabled_tools: number;
  schema_bytes: number;
  /** Advisory estimate only; bytes / 4 is not tokenizer exact. */
  approx_tokens_4char_rule: number;
  conversion_errors: number;
}

/**
 * Project manifest totals through OpenCode's already-resolved per-agent tool
 * permission map. This never recreates or interprets permission rules.
 */
export function projectToolSchemaManifest(
  manifest: ToolSchemaManifest,
  permissions: Record<string, boolean>,
): ToolSchemaProjection {
  const projection: ToolSchemaProjection = {
    availability: "available",
    enabled_tools: 0,
    schema_bytes: 0,
    approx_tokens_4char_rule: 0,
    conversion_errors: 0,
  };

  for (const [name, telemetry] of Object.entries(manifest.tools)) {
    if (permissions[name] !== true) continue;
    if (telemetry.status === "conversion_error") {
      projection.conversion_errors++;
      continue;
    }
    projection.enabled_tools++;
    projection.schema_bytes += telemetry.schema_bytes;
    projection.approx_tokens_4char_rule += telemetry.approx_tokens_4char_rule;
  }
  return projection;
}

/**
 * Extract the resolved tool map from `opencode debug agent <lane>` output.
 * Plugin diagnostics can precede the JSON config, so every JSON document
 * boundary is tried and accepted only when it has a boolean `tools` record.
 */
export function parseAgentToolPermissions(
  output: string,
): Record<string, boolean> | undefined {
  const starts = [0];
  for (let index = 0; index < output.length; index++) {
    if (output[index] === "\n" && output[index + 1] === "{")
      starts.push(index + 1);
  }
  for (const start of starts) {
    try {
      const value: unknown = JSON.parse(output.slice(start));
      if (!value || typeof value !== "object") continue;
      const tools = (value as { tools?: unknown }).tools;
      if (!tools || typeof tools !== "object" || Array.isArray(tools)) continue;
      const permissions: Record<string, boolean> = {};
      for (const [name, allowed] of Object.entries(tools)) {
        if (typeof allowed === "boolean") permissions[name] = allowed;
      }
      return permissions;
    } catch {
      // Try the next document boundary; callers surface unavailability.
    }
  }
  return undefined;
}
