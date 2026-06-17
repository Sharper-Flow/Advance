import { describe, expect, it } from "vitest";
import { extractTerminalSuccess } from "./plugin-output";

describe("extractTerminalSuccess", () => {
  it("returns changeId when top-level success is true", () => {
    expect(
      extractTerminalSuccess(JSON.stringify({ success: true, changeId: "c1" })),
    ).toEqual({ changeId: "c1" });
  });

  it("returns changeId when nested data.success is true", () => {
    expect(
      extractTerminalSuccess(
        JSON.stringify({ data: { success: true, changeId: "c2" } }),
      ),
    ).toEqual({ changeId: "c2" });
  });

  it("returns null when success is false", () => {
    expect(
      extractTerminalSuccess(
        JSON.stringify({ success: false, changeId: "c1" }),
      ),
    ).toBeNull();
  });

  it("returns null when changeId is missing", () => {
    expect(
      extractTerminalSuccess(JSON.stringify({ success: true })),
    ).toBeNull();
  });

  it("returns null for non-JSON output", () => {
    expect(extractTerminalSuccess("plain text")).toBeNull();
  });

  it("unwraps a ToolResult-shaped object", () => {
    expect(
      extractTerminalSuccess({
        title: "adv_change_close",
        output: JSON.stringify({ success: true, changeId: "c3" }),
      }),
    ).toEqual({ changeId: "c3" });
  });
});
