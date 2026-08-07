/**
 * Host-only idempotency identity for one canonical ADV tool invocation.
 *
 * Tool execution is asynchronous and may overlap with other sessions, so this
 * uses AsyncLocalStorage rather than a mutable module-level current value.
 * Store adapters derive command children from this context; runtime adapters
 * must never import this module.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { computeHostCanonicalHash } from "./command-payload-hash";

export interface ToolOperationContext {
  baseOperationId: string;
  toolName: string;
  sessionID: string;
  messageID: string;
  argsHash: string;
}

export interface ToolOperationIdentityInput {
  sessionID?: unknown;
  messageID?: unknown;
}

const toolOperationStorage = new AsyncLocalStorage<ToolOperationContext>();

/**
 * Build a stable base id after tool-argument preflight has normalized the
 * canonical args. Session + message distinguish separate user invocations;
 * the exact canonical tool name and normalized args distinguish targets.
 */
export function createToolOperationContext(
  toolName: string,
  normalizedArgs: unknown,
  input: ToolOperationIdentityInput,
): ToolOperationContext | undefined {
  if (
    typeof input.sessionID !== "string" ||
    input.sessionID.length === 0 ||
    typeof input.messageID !== "string" ||
    input.messageID.length === 0
  ) {
    return undefined;
  }
  const argsHash = computeHostCanonicalHash(normalizedArgs);
  const baseOperationId = computeHostCanonicalHash({
    sessionID: input.sessionID,
    messageID: input.messageID,
    toolName,
    normalizedArgs,
  });
  return {
    baseOperationId,
    toolName,
    sessionID: input.sessionID,
    messageID: input.messageID,
    argsHash,
  };
}

export function withToolOperationContext<T>(
  context: ToolOperationContext | undefined,
  execute: () => Promise<T>,
): Promise<T> {
  if (!context) return execute();
  return toolOperationStorage.run(context, execute);
}

export function getToolOperationContext(): ToolOperationContext | undefined {
  return toolOperationStorage.getStore();
}
