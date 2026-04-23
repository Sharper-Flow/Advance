/**
 * Mock for @opencode-ai/plugin
 *
 * Provides minimal mocks for testing without requiring the full SDK.
 */

import { z } from "zod";

// Type definitions
export type Plugin = (input: PluginInput) => Promise<Hooks>;

export interface PluginInput {
  client: unknown;
  project: {
    id: string;
    worktree: string;
    vcsDir?: string;
    vcs?: "git";
    time: { created: number; initialized?: number };
  };
  directory: string;
  worktree: string;
  serverUrl: URL;
  $: unknown;
}

export interface ToolDefinition {
  description: string;
  args: Record<string, z.ZodType>;
  execute: (args: unknown, context: unknown) => Promise<string>;
}

export interface Hooks {
  tool?: Record<string, ToolDefinition>;
  event?: (input: { event: unknown }) => Promise<void>;
  "tool.execute.before"?: (input: unknown, output: unknown) => Promise<void>;
  "tool.execute.after"?: (input: unknown, output: unknown) => Promise<void>;
  "experimental.session.compacting"?: (
    input: unknown,
    output: unknown,
  ) => Promise<void>;
  "experimental.chat.system.transform"?: (
    input: { sessionID: string },
    output: { system: string[] },
  ) => Promise<void>;
}

export interface ToolContext {
  sessionID: string;
  messageID: string;
  agent: string;
  abort: AbortSignal;
  metadata: () => void;
  ask: () => Promise<void>;
}

// Tool helper function
export const tool = <TArgs extends Record<string, z.ZodType>>(definition: {
  description: string;
  args: TArgs;
  execute: (
    args: z.infer<z.ZodObject<TArgs>>,
    context: ToolContext,
  ) => Promise<string>;
}): ToolDefinition => {
  return {
    description: definition.description,
    args: definition.args,
    execute: definition.execute as (
      args: unknown,
      context: unknown,
    ) => Promise<string>,
  };
};

// Schema helpers attached to tool
tool.schema = {
  string: () => z.string(),
  number: () => z.number(),
  boolean: () => z.boolean(),
  literal: <T extends string | number | bigint | boolean | null | undefined>(
    value: T,
  ) => z.literal(value),
  array: <T extends z.ZodType>(schema: T) => z.array(schema),
  enum: <T extends [string, ...string[]]>(values: T) => z.enum(values),
  object: <T extends z.ZodRawShape>(shape: T) => z.object(shape),
  record: <V extends z.ZodType>(
    key: z.ZodString,
    value: V,
  ) => z.record(key, value),
};

// Re-export types
export type { z };
