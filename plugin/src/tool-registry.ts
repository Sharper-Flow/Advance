/**
 * Tool Registry Helper
 *
 * Provides two helpers for registering tools in index.ts:
 *
 * 1. `registerTool(description, args, execute)` — low-level, explicit
 * 2. `bindTool(toolDef, name, execFn)` — high-level, one-liner per tool
 *
 * Both reduce index.ts boilerplate from ~15-line blocks per tool down to
 * a single line per tool. Arg schemas live in each tool file alongside
 * description and execute, keeping them co-located and readable.
 *
 * Note: tool files use Zod v3 schemas while the SDK expects Zod v4. The
 * `as any` cast is safe at runtime — both versions produce compatible objects.
 */

import { tool } from "@opencode-ai/plugin";
import { z } from "zod";
import { safeExecute, safeExecuteSimple } from "./utils/safe-execute";

type ToolArgsSchema = Record<string, z.ZodTypeAny>;
type ToolExecute<TArgs> = (
  args: TArgs,
  contextOrExtra?: unknown,
) => Promise<string>;

/** Low-level helper: explicit description, args, and pre-wrapped execute. */
export function registerTool(
  description: string,
  args: ToolArgsSchema,
  execute: ToolExecute<unknown>,
) {
  // SDK uses Zod v4 while tool modules currently export Zod v3 schemas.
  // Runtime objects are compatible, but the type systems are not identical.
  // Keep the compatibility cast isolated to this single boundary.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return tool({ description, args: args as any, execute });
}

/** Tool definition shape expected by bindTool / bindToolSimple. */
export interface ToolDef<TArgs, TStore> {
  description: string;
  args: ToolArgsSchema;
  execute: (args: TArgs, store: TStore) => Promise<string>;
}

/** Tool definition shape for agenda-style tools (directory + optional path). */
export interface ToolDefSimple<TArgs> {
  description: string;
  args: ToolArgsSchema;
  execute: (args: TArgs, dir: string, path?: string) => Promise<string>;
}

/**
 * Bind a store-based tool definition to a store instance.
 * Usage: `adv_spec: bindTool(specTools.adv_spec, "adv_spec", store)`
 */
export function bindTool<TArgs, TStore>(
  def: ToolDef<TArgs, TStore>,
  name: string,
  store: TStore,
) {
  return registerTool(
    def.description,
    def.args,
    safeExecute(async (args) => def.execute(args as TArgs, store), name),
  );
}

/**
 * Bind an agenda-style tool definition to a directory + optional path.
 * Usage: `adv_agenda_list: bindToolSimple(agendaTools.adv_agenda_list, "adv_agenda_list", directory, store.paths.agenda)`
 */
export function bindToolSimple<TArgs>(
  def: ToolDefSimple<TArgs>,
  name: string,
  dir: string,
  path?: string,
) {
  return registerTool(
    def.description,
    def.args,
    safeExecuteSimple(
      async (args) => def.execute(args as TArgs, dir, path),
      name,
    ),
  );
}
