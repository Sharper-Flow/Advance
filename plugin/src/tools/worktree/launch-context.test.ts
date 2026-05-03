/**
 * Tests for launch-context.ts (T11 — KD-6 split, plain-mode-only port).
 */

import { describe, expect, it } from "vitest";
import {
  buildSessionLaunchArgv,
  parseActiveLaunchContext,
} from "./launch-context";

describe("launch-context (T11)", () => {
  describe("buildSessionLaunchArgv", () => {
    it("returns exactly 3 elements: ['opencode', '--session', sessionID]", () => {
      const argv = buildSessionLaunchArgv("sess_AbCdEfGh");
      expect(argv).toEqual(["opencode", "--session", "sess_AbCdEfGh"]);
      expect(argv).toHaveLength(3);
    });

    it("preserves arbitrary session-id strings verbatim", () => {
      expect(buildSessionLaunchArgv("ses_X")).toEqual([
        "opencode",
        "--session",
        "ses_X",
      ]);
    });
  });

  describe("parseActiveLaunchContext", () => {
    it("always returns mode: plain (no OCX detection in v1)", () => {
      expect(parseActiveLaunchContext({})).toEqual({ mode: "plain" });
      expect(parseActiveLaunchContext({ OCX_CONTEXT: "1" })).toEqual({
        mode: "plain",
      });
      expect(parseActiveLaunchContext({ OCX_BIN: "/usr/bin/ocx" })).toEqual({
        mode: "plain",
      });
      expect(parseActiveLaunchContext()).toEqual({ mode: "plain" });
    });
  });
});
