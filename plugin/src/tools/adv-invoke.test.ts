import { describe, test, expect, vi } from "vitest";
import { z } from "zod";
import { advInvokeTools, type ToolLookupResult } from "./adv-invoke";

type MockToolDefinition = {
  execute: ReturnType<typeof vi.fn>;
};

function createMockDefinition(result: string): MockToolDefinition {
  return {
    execute: vi.fn().mockResolvedValue(result),
  };
}

function wrapDefinition(
  mock: MockToolDefinition,
): ToolLookupResult["definition"] {
  return mock as unknown as ToolLookupResult["definition"];
}

describe("adv_tool_invoke", () => {
  const ctx = { sessionID: "test-session" };

  test("AC1: invokes a known tool by name, passes same context, returns same result", async () => {
    const mockTool = createMockDefinition("mock-result");
    const lookup = vi.fn().mockReturnValue({
      definition: wrapDefinition(mockTool),
      rawArgs: { id: z.string() },
    } as ToolLookupResult);

    const result = await advInvokeTools.adv_tool_invoke.execute(
      { name: "adv_mock_tool", args: { id: "123" } },
      lookup,
      ctx,
    );

    expect(result).toBe("mock-result");
    expect(lookup).toHaveBeenCalledWith("adv_mock_tool");
    expect(mockTool.execute).toHaveBeenCalledWith({ id: "123" }, ctx);
  });

  test("AC2: unknown name returns typed TOOL_NOT_FOUND rejection", async () => {
    const lookup = vi.fn().mockReturnValue(undefined);
    const result = await advInvokeTools.adv_tool_invoke.execute(
      { name: "adv_unknown_tool", args: {} },
      lookup,
      ctx,
    );
    const parsed = JSON.parse(result);
    expect(parsed.error).toMatch(/not found/i);
    expect(parsed.code).toBe("TOOL_NOT_FOUND");
  });

  test("AC2: unknown args returns typed SCHEMA_VALIDATION_FAILED rejection", async () => {
    const mockTool = createMockDefinition("should-not-run");
    const lookup = vi.fn().mockReturnValue({
      definition: wrapDefinition(mockTool),
      rawArgs: { id: z.string().min(1) },
    } as ToolLookupResult);

    const result = await advInvokeTools.adv_tool_invoke.execute(
      { name: "adv_mock_tool", args: { id: 123 } },
      lookup,
      ctx,
    );
    const parsed = JSON.parse(result);
    expect(parsed.code).toBe("SCHEMA_VALIDATION_FAILED");
    expect(mockTool.execute).not.toHaveBeenCalled();
  });

  test("AC2: extra target args are rejected instead of silently stripped", async () => {
    const mockTool = createMockDefinition("should-not-run");
    const lookup = vi.fn().mockReturnValue({
      definition: wrapDefinition(mockTool),
      rawArgs: { id: z.string() },
    } as ToolLookupResult);

    const result = await advInvokeTools.adv_tool_invoke.execute(
      { name: "adv_mock_tool", args: { id: "123", unexpected: true } },
      lookup,
      ctx,
    );

    expect(JSON.parse(result).code).toBe("SCHEMA_VALIDATION_FAILED");
    expect(mockTool.execute).not.toHaveBeenCalled();
  });

  test("AC3: recursive names are rejected before lookup", async () => {
    const lookup = vi.fn().mockReturnValue({
      definition: wrapDefinition(createMockDefinition("should-not-run")),
      rawArgs: {},
    } as ToolLookupResult);

    for (const name of [
      "adv_tool_invoke",
      "adv_tool_catalog",
      "adv_tool_describe",
      "execute",
    ]) {
      const result = await advInvokeTools.adv_tool_invoke.execute(
        { name, args: {} },
        lookup,
        ctx,
      );
      const parsed = JSON.parse(result);
      expect(parsed.code).toBe("RECURSIVE_INVOCATION");
    }
    expect(lookup).not.toHaveBeenCalled();
  });

  test("AC4: approval-required tool still delegates to wrapped execute", async () => {
    const mockTool = createMockDefinition(
      JSON.stringify({
        status: "APPROVAL_REQUIRED",
        tool: "adv_approval_tool",
      }),
    );
    const lookup = vi.fn().mockReturnValue({
      definition: wrapDefinition(mockTool),
      rawArgs: { changeId: z.string() },
    } as ToolLookupResult);

    const result = await advInvokeTools.adv_tool_invoke.execute(
      { name: "adv_approval_tool", args: { changeId: "c1" } },
      lookup,
      ctx,
    );
    const parsed = JSON.parse(result);
    expect(parsed.status).toBe("APPROVAL_REQUIRED");
    expect(mockTool.execute).toHaveBeenCalledWith({ changeId: "c1" }, ctx);
  });

  test("AC4: recovery-only tool still rejects non-recovery agent via wrapped execute", async () => {
    const mockTool = createMockDefinition(
      JSON.stringify({
        error: "Recovery-only tool invoked outside recovery context",
        code: "RECOVERY_ONLY",
      }),
    );
    const lookup = vi.fn().mockReturnValue({
      definition: wrapDefinition(mockTool),
      rawArgs: { changeId: z.string() },
    } as ToolLookupResult);

    const result = await advInvokeTools.adv_tool_invoke.execute(
      { name: "adv_recovery_tool", args: { changeId: "c1" } },
      lookup,
      ctx,
    );
    const parsed = JSON.parse(result);
    expect(parsed.code).toBe("RECOVERY_ONLY");
    expect(mockTool.execute).toHaveBeenCalledWith({ changeId: "c1" }, ctx);
  });
});
