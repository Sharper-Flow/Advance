import { describe, expect, test } from "vitest";

/**
 * OpenCode 1.18.4+ invokes EVERY function-valued export of a plugin entry
 * module as a plugin factory with PluginInput. Any additional function export
 * whose signature is not (input: PluginInput) throws when the loader calls it,
 * and OpenCode drops the whole plugin ("failed to load plugin").
 *
 * This contract test pins the entry to exactly one function-valued export:
 * `default`. Helpers must live in non-entry modules.
 */
describe("plugin entry factory contract", () => {
  test("entry module exports exactly one function-valued symbol (default)", async () => {
    const entry = await import("../index");
    const functionExports = Object.entries(entry).filter(
      ([, value]) => typeof value === "function",
    );
    const names = functionExports.map(([name]) => name).sort();
    expect(
      names,
      `entry exports function-valued symbols beyond default: ${names.join(", ")}`,
    ).toEqual(["default"]);
  });
});
