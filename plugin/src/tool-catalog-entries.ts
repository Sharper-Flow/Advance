/**
 * SDK-free ADV tool catalog entries (task tk-9ad1a04909a2 / KD2).
 *
 * Pure types, pure functions, and pure derivation tables for the canonical
 * ADV tool surface. This module has ZERO `@opencode-ai/plugin` imports and
 * ZERO imports from `./tools/*` or `./storage/*` — it depends only on Zod
 * (already a peer of the plugin). The future MCP server (plugin/src/mcp-server/)
 * consumes these types and functions to build tool descriptors without
 * coupling to the OpenCode plugin SDK.
 *
 * The actual PUBLIC_TOOL_ENTRIES / ADV_TOOL_NAMES / ADV_TOOL_METADATA data
 * remain in `tool-registry.ts` because they are derived from PUBLIC_TOOL_GROUPS,
 * which imports tool-group modules (./tools/*) that ARE SDK-coupled. The MCP
 * server accesses that data via dynamic import (`await import("../tool-registry.js")`)
 * — same pattern as `adv_contract_mint` (see comment at tool-registry.ts:1330-1332).
 *
 * Boundary test: `tool-catalog-entries.test.ts` enforces the SDK-free property
 * structurally (P33 — structural correctness over heuristic inference).
 */

import { z } from "zod";

// =============================================================================
// ToolArgsSchema — Zod-only schema map type
// =============================================================================

export type ToolArgsSchema = Record<string, z.ZodTypeAny>;

// =============================================================================
// PublicToolGroup / PublicToolEntry — canonical definition records
// =============================================================================

/** One retained public `*Tools` export group (data-only view). */
export type PublicToolGroup = Readonly<
  Record<string, { description: string; args: ToolArgsSchema }>
>;

/** Canonical definition record: name, required description, original Zod args. */
export interface PublicToolEntry {
  readonly name: string;
  readonly description: string;
  readonly args: ToolArgsSchema;
}

/**
 * Flatten retained public groups into ordered definition records.
 *
 * DDC2: a duplicate exported public name across groups is rejected BEFORE any
 * Set/Map construction can collapse it — a collision throws instead of
 * silently dropping one of the colliding tools.
 *
 * SC4: every record must carry a non-empty description and the original Zod
 * args; the silent `args ?? {}` fallback is removed (addAdvanceMetadata).
 */
export function collectPublicToolEntries(
  groups: readonly PublicToolGroup[],
): PublicToolEntry[] {
  const entries: PublicToolEntry[] = [];
  const firstGroupIndex = new Map<string, number>();
  groups.forEach((group, groupIndex) => {
    for (const [name, def] of Object.entries(group)) {
      const first = firstGroupIndex.get(name);
      if (first !== undefined) {
        throw new Error(
          `Duplicate public tool name "${name}" exported by public tool inventory groups at index ${first} and ${groupIndex}. Public names must be unique across retained groups before any Set/Map construction (consolidateAdvToolSurface2 DDC2).`,
        );
      }
      if (typeof def.description !== "string" || def.description.length === 0) {
        throw new Error(
          `Public tool "${name}" is missing a required description. Every canonical definition record must carry a non-empty description (addAdvanceMetadata SC4).`,
        );
      }
      if (
        !def.args ||
        typeof def.args !== "object" ||
        Array.isArray(def.args)
      ) {
        throw new Error(
          `Public tool "${name}" is missing required original Zod args. Every canonical definition record must carry its args schema (addAdvanceMetadata SC4).`,
        );
      }
      firstGroupIndex.set(name, groupIndex);
      entries.push({ name, description: def.description, args: def.args });
    }
  });
  return entries;
}

// =============================================================================
// Tool catalog projections (addAdvanceMetadata AC3/C3/C4)
// =============================================================================

/** One entry in the read-only ADV tool catalog. */
export interface ToolCatalogItem {
  readonly name: string;
  readonly description: string;
  readonly argKeys: readonly string[];
  readonly visibility: ToolMetadataV1;
}

/** Result of converting a tool's canonical Zod args to JSON Schema. */
export type ToolInputSchemaResult =
  | { readonly ok: true; readonly schema: Record<string, unknown> }
  | { readonly ok: false; readonly code: string; readonly error: string };

/**
 * Render the input JSON Schema for a canonical tool definition using Zod's
 * native `toJSONSchema` with input semantics. Failures are surfaced as typed
 * projection errors rather than falling back to argument names (AC4).
 */
export function renderToolInputSchema(
  entry: PublicToolEntry,
): ToolInputSchemaResult {
  try {
    const schema = z.toJSONSchema(z.object(entry.args), {
      io: "input",
      unrepresentable: "throw",
    }) as Record<string, unknown>;
    return { ok: true, schema };
  } catch (err) {
    return {
      ok: false,
      code: "SCHEMA_CONVERSION_FAILED",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Live tool-surface lookup (addAcWarrantGuard): tool name → set of declared
 * argument keys, derived from a PublicToolEntry list (data only — no `execute`
 * invocation). This is the source of truth used to verify capability warrants
 * at contract mint. Because it operates on the typed inventory, the warrant
 * surface cannot drift from the canonical list (DDC1), and per-tool argument
 * keys always equal the declared definition keys (DDC3).
 */
export function getToolSurface(
  entries: readonly PublicToolEntry[],
): Map<string, Set<string>> {
  const surface = new Map<string, Set<string>>();
  for (const entry of entries) {
    surface.set(entry.name, new Set(Object.keys(entry.args)));
  }
  return surface;
}

// =============================================================================
// ADV_PUBLIC_TOOL_BASELINE_COUNT
// =============================================================================

/**
 * SC1 source baseline: the number of registered public ADV tools recorded at
 * the start of consolidateAdvToolSurface2 implementation (2026-07-15). The
 * final canonical count must be strictly lower once a change's contracted
 * public removals land; the baseline/final exact-accounting assertion lives
 * in tool-registry.inventory.test.ts.
 */
export const ADV_PUBLIC_TOOL_BASELINE_COUNT = 80;

// =============================================================================
// Descriptive visibility metadata (addAdvanceMetadata AC1/AC5/C1/C2/C5)
// =============================================================================

export type ToolRealm =
  | "archive"
  | "backlog"
  | "change"
  | "conformance"
  | "contract"
  | "design"
  | "epic"
  | "followup"
  | "gate"
  | "lightweight"
  | "ops"
  | "project"
  | "reflection"
  | "report"
  | "session"
  | "snapshot"
  | "spec"
  | "status"
  | "store"
  | "task"
  | "test"
  | "tool"
  | "verification"
  | "wisdom"
  | "worktree";

export type ToolGroup =
  | "bulk"
  | "diagnostics"
  | "lifecycle"
  | "metadata"
  | "read"
  | "repair"
  | "write";

export type ToolLifecycleGate =
  | "proposal"
  | "discovery"
  | "design"
  | "planning"
  | "execution"
  | "acceptance"
  | "release";

/**
 * Canonical descriptive metadata for every retained ADV tool.
 *
 * Owned facts only: realm, group, lifecycle gates, risk, and recovery-only
 * flag. This table does NOT copy authority from TOOL_ROLE_POLICY (class,
 * agentActions, operatorActions, rationale) or manifest grants from
 * AGENT_TOOL_POLICY (allowed, explicitBlocked, denyWildcard). It is a
 * descriptive, non-authorizing source used by catalog/describe projections
 * and profile authoring (addAdvanceMetadata SC4/AC1/AC5/C1/C2/C5).
 */
export interface ToolMetadataV1 {
  readonly realm: ToolRealm;
  readonly group: ToolGroup;
  readonly lifecycle: ReadonlyArray<ToolLifecycleGate>;
  readonly risk: "low" | "medium" | "high" | "operator";
  readonly recoveryOnly: boolean;
}

// =============================================================================
// Realm / Group / Lifecycle derivation tables (pure data + pure functions)
// =============================================================================

export const REALM_OVERRIDES: Readonly<Record<string, ToolRealm>> = {
  adv_subagent_report_submit: "report",
  adv_run_test: "test",
  adv_spec: "spec",
  adv_status: "status",
  adv_wip_state: "status",
  adv_reflect: "reflection",
  adv_reflection_list: "reflection",
};

export const REALM_PREFIXES: ReadonlyArray<readonly [string, ToolRealm]> = [
  ["adv_archive_", "archive"],
  ["adv_backlog_", "backlog"],
  ["adv_change_", "change"],
  ["adv_contract_", "contract"],
  ["adv_epic_", "epic"],
  ["adv_gate_", "gate"],
  ["adv_ops_", "ops"],
  ["adv_project_", "project"],
  ["adv_session_", "session"],
  ["adv_store_", "store"],
  ["adv_task_", "task"],
  ["adv_tool_", "tool"],
  ["adv_worktree_", "worktree"],
  ["adv_wisdom_", "wisdom"],
];

export function deriveToolRealm(name: string): ToolRealm {
  const override = REALM_OVERRIDES[name];
  if (override) return override;
  for (const [prefix, realm] of REALM_PREFIXES) {
    if (name.startsWith(prefix)) return realm;
  }
  return "change";
}

export const GROUP_OVERRIDES: Readonly<Record<string, ToolGroup>> = {
  // Repair / operator-only recovery surface
  adv_change_workflow_terminate: "repair",

  // Diagnostics / read-heavy analysis surface
  adv_run_test: "diagnostics",

  // Metadata / submission surface
  adv_reflect: "metadata",
  adv_subagent_report_submit: "metadata",

  // Read surface
  adv_change_list: "read",
  adv_change_show: "read",
  adv_gate_status: "read",
  adv_project_context: "read",
  adv_reflection_list: "read",
  adv_spec: "read",
  adv_status: "read",
  adv_task_list: "read",
  adv_task_ready: "read",
  adv_task_show: "read",
  adv_tool_catalog: "read",
  adv_tool_describe: "read",
  adv_wip_state: "read",
  adv_wisdom_list: "read",
  adv_worktree_triage: "read",

  // Lifecycle transitions
  adv_change_archive: "lifecycle",
  adv_change_reenter: "lifecycle",
  adv_gate_complete: "lifecycle",

  // Bulk operations
};

export const LIFECYCLE_BY_REALM: Readonly<
  Record<ToolRealm, ReadonlyArray<ToolLifecycleGate>>
> = {
  archive: ["release"],
  backlog: ["proposal", "discovery"],
  change: [
    "proposal",
    "discovery",
    "design",
    "planning",
    "execution",
    "acceptance",
    "release",
  ],
  conformance: ["acceptance"],
  contract: ["discovery", "planning"],
  design: ["execution"],
  epic: ["proposal", "discovery", "planning", "execution"],
  followup: ["execution", "acceptance"],
  gate: ["acceptance", "release"],
  lightweight: ["execution"],
  ops: ["execution"],
  project: [
    "proposal",
    "discovery",
    "design",
    "planning",
    "execution",
    "acceptance",
    "release",
  ],
  reflection: ["release"],
  report: ["execution", "acceptance"],
  session: [
    "proposal",
    "discovery",
    "design",
    "planning",
    "execution",
    "acceptance",
    "release",
  ],
  snapshot: [
    "proposal",
    "discovery",
    "design",
    "planning",
    "execution",
    "acceptance",
    "release",
  ],
  spec: ["proposal", "discovery"],
  status: [
    "proposal",
    "discovery",
    "design",
    "planning",
    "execution",
    "acceptance",
    "release",
  ],
  store: ["release"],
  task: ["planning", "execution"],
  test: ["execution", "acceptance"],
  tool: [
    "proposal",
    "discovery",
    "design",
    "planning",
    "execution",
    "acceptance",
    "release",
  ],
  verification: ["acceptance"],
  wisdom: ["execution", "acceptance", "release"],
  worktree: ["execution"],
};

export const REPAIR_LIFECYCLE: ReadonlyArray<ToolLifecycleGate> = [
  "execution",
  "acceptance",
  "release",
];

export function deriveToolMetadata(name: string): ToolMetadataV1 {
  const realm = deriveToolRealm(name);
  const group = GROUP_OVERRIDES[name] ?? "write";
  const lifecycle: ReadonlyArray<ToolLifecycleGate> =
    group === "repair" ? REPAIR_LIFECYCLE : LIFECYCLE_BY_REALM[realm];
  const risk: ToolMetadataV1["risk"] =
    group === "repair"
      ? "operator"
      : group === "bulk" || group === "write"
        ? "high"
        : group === "diagnostics"
          ? "medium"
          : "low";
  const recoveryOnly = group === "repair";
  return { realm, group, lifecycle, risk, recoveryOnly };
}
