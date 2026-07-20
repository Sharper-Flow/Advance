import { z } from "zod";
import type { ToolDefinition } from "@opencode-ai/plugin";
import { formatToolOutput } from "../utils/tool-output";
import { recordFacadedAdvToolTarget } from "../utils/metrics";

/**
 * Result of resolving a target tool through the facade's lookup function.
 *
 * `definition` is the SAME wrapped `ToolDefinition` that direct calls use,
 * so dispatching through `definition.execute(args, ctx)` re-runs the canonical
 * Zod-pre-flight, lifecycle hooks, and `safeExecute` envelope of the wrapped
 * tool. `rawArgs` is the ORIGINAL (unwrapped) Zod schema for the target
 * tool, taken from `PublicToolEntry.args`, so the facade re-validates its
 * own args against the canonical Zod before handing them to the wrapped
 * execute (AC2 typed-rejection with canonical Zod).
 */
export interface ToolLookupResult {
  readonly definition: ToolDefinition;
  readonly rawArgs: Record<string, z.ZodTypeAny>;
}

/** Facade argument shape. Validated by the facade's own Zod schema before lookup. */
export interface AdvInvokeArgs {
  readonly name: string;
  readonly args: Record<string, unknown>;
}

/**
 * Lookup callback used by the facade. The production site (the
 * `createToolMap` registration in `tool-registry.ts`) closes over
 * `PUBLIC_TOOL_ENTRIES` + `baseToolMap` and returns the same wrapped
 * definition that direct calls dispatch to. Tests inject a stub that
 * returns a local mock definition + schema.
 */
export type ToolLookup = (name: string) => ToolLookupResult | undefined;

/**
 * Names that may NOT be dispatched via the facade.
 *
 * - `adv_tool_invoke`: cannot self-invoke (infinite recursion).
 * - `adv_tool_catalog`, `adv_tool_describe`: read-only projections; must
 *   not be reachable through the facade to keep facade surface minimal
 *   and to avoid a profile-bypass (the denial profile allows these, but
 *   allowing the facade to dispatch them would re-create the surface the
 *   profile is trying to hide).
 * - `execute`: OpenCode's CodeMode `execute` tool. Recursion through it
 *   would re-enter the facade with arbitrary tool names and bypass the
 *   `ToolDefinition` registry entirely. Excluded explicitly per AC3.
 */
const RECURSIVE_TOOL_NAMES: ReadonlySet<string> = new Set([
  "adv_tool_invoke",
  "adv_tool_catalog",
  "adv_tool_describe",
  "execute",
]);

/**
 * `adv_tool_invoke` facade.
 *
 * Strict in-process dispatcher that wraps the SAME canonical `ToolDefinition.execute`
 * that direct calls use. Preserves `ToolContext`, the canonical Zod schema
 * for `args`, and every wrapped tool's own validation / authorization /
 * approval / target-path / recovery-only / audit / timeout / cancellation
 * behaviour. See `tool-registry.ts` for the production `registerTool` site
 * that closes a `ToolLookup` over the canonical registry.
 *
 * The `execute` signature is `(args, lookup, ctx)` — three positional
 * arguments — and is NOT the OpenCode `ToolDefinition.execute` shape. The
 * extra `lookup` parameter is supplied by the wrapping site in
 * `tool-registry.ts` and injected here as a closure; tests inject their own
 * `lookup`. OpenCode's two-arg `(args, ctx)` contract is preserved at the
 * outer wrapper layer (the actual `ToolDefinition` registered with OpenCode).
 */
export const advInvokeTools = {
  adv_tool_invoke: {
    description:
      "Invoke a canonical ADV tool by exact name with typed arguments. Dispatches through the same wrapped ToolDefinition.execute path used by direct calls, preserving ToolContext, validation, authorization, approvals, recovery restrictions, and timeouts.",
    args: {
      name: z
        .string()
        .min(1)
        .describe(
          "Exact canonical ADV tool name to invoke (e.g. adv_change_show)",
        ),
      args: z
        .record(z.string(), z.unknown())
        .describe(
          "Arguments object for the target tool; must match the target's canonical Zod schema",
        ),
    },
    execute: async (
      args: AdvInvokeArgs,
      lookup: ToolLookup,
      ctx: unknown,
    ): Promise<string> => {
      // AC3: recursion exclusion runs BEFORE any lookup, dispatch, or
      // schema parse so a facaded call never reaches another facade tool
      // or the CodeMode `execute` shim.
      if (RECURSIVE_TOOL_NAMES.has(args.name)) {
        return formatToolOutput({
          error: `Recursive invocation of ${args.name} is not allowed`,
          code: "RECURSIVE_INVOCATION",
        });
      }

      // AC2: typed rejection before dispatch when name is unknown.
      const found = lookup(args.name);
      if (!found) {
        return formatToolOutput({
          error: `Tool not found: ${args.name}`,
          code: "TOOL_NOT_FOUND",
        });
      }

      const { definition, rawArgs } = found;

      // AC2: typed rejection when args do not match the canonical Zod schema.
      // Uses the original (unwrapped) Zod schema from `PublicToolEntry.args`
      // so validation matches the wrapped tool's own first-pass validation
      // step exactly.
      // `z.object()` strips unknown keys by default. The facade boundary must
      // reject them instead: otherwise strict-mode providers can send an
      // argument that never reaches the canonical wrapped execute and AC2's
      // typed unknown-argument rejection is bypassed.
      const parseResult = z.object(rawArgs).strict().safeParse(args.args);
      if (!parseResult.success) {
        return formatToolOutput({
          error: `Schema validation failed for ${args.name}`,
          code: "SCHEMA_VALIDATION_FAILED",
          details: parseResult.error.message,
        });
      }

      // AC1 + AC4: dispatch through the SAME wrapped `ToolDefinition.execute`
      // that direct calls use. The caller's `ctx` is passed straight through
      // (no fabrication, no stripping), so the wrapped tool sees identical
      // authorization, approval, target-path-trust, recovery-only, audit,
      // and timeout semantics as it would have seen on a direct call.
      const result = await definition.execute(
        parseResult.data,
        ctx as unknown as Parameters<ToolDefinition["execute"]>[1],
      );

      // Audit mirror: add the target-tool breakdown without incrementing the
      // global call count. The outer `tool.execute.after` hook already records
      // this one facade invocation; counting it again here would inflate
      // `adv_tool_calls` for every facaded operation.
      recordFacadedAdvToolTarget(args.name);

      // Normalise the dispatch result into a string. Every registered ADV
      // tool is wrapped through `safeExecute` which returns `Promise<string>`,
      // so `result` is a string in practice. The defensive `typeof` /
      // `JSON.stringify` fallback only matters if a future custom-registered
      // tool returns the object form of `ToolResult` directly.
      return typeof result === "string" ? result : JSON.stringify(result);
    },
  },
};
