import { describe, expect, it } from "vitest";
import {
  createToolOperationContext,
  getToolOperationContext,
  withToolOperationContext,
} from "./tool-operation-context";

const args = { changeId: "change-1", content: "same logical command" };

describe("tool operation context", () => {
  it("keeps concurrent AsyncLocalStorage scopes isolated", async () => {
    const first = createToolOperationContext("adv_wisdom_add", args, {
      sessionID: "session-a",
      messageID: "message-a",
    });
    const second = createToolOperationContext("adv_wisdom_add", args, {
      sessionID: "session-b",
      messageID: "message-b",
    });
    expect(first).toBeDefined();
    expect(second).toBeDefined();

    const observed = await Promise.all([
      withToolOperationContext(first, async () => {
        await Promise.resolve();
        return getToolOperationContext()?.baseOperationId;
      }),
      withToolOperationContext(second, async () => {
        await Promise.resolve();
        return getToolOperationContext()?.baseOperationId;
      }),
    ]);

    expect(observed).toEqual([first?.baseOperationId, second?.baseOperationId]);
    expect(observed[0]).not.toBe(observed[1]);
    expect(observed[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(first?.argsHash).toMatch(/^[0-9a-f]{64}$/);
    expect(getToolOperationContext()).toBeUndefined();
  });

  it("reuses one message identity but distinguishes identical commands in new messages", () => {
    const retry = createToolOperationContext("adv_wisdom_add", args, {
      sessionID: "session-a",
      messageID: "message-a",
    });
    const sameInvocation = createToolOperationContext("adv_wisdom_add", args, {
      sessionID: "session-a",
      messageID: "message-a",
    });
    const nextMessage = createToolOperationContext("adv_wisdom_add", args, {
      sessionID: "session-a",
      messageID: "message-b",
    });

    expect(retry?.baseOperationId).toBe(sameInvocation?.baseOperationId);
    expect(retry?.baseOperationId).not.toBe(nextMessage?.baseOperationId);
    expect(retry?.baseOperationId).toMatch(/^[0-9a-f]{64}$/);
  });
});
