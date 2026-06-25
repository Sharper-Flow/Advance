import { describe, expect, test } from "bun:test";

import {
  parseDashboardConfig,
  sanitizeDashboardState,
} from "./config";

describe("dashboard config parser", () => {
  test("accepts schema_version 1 with multiple absolute projects", () => {
    const parsed = parseDashboardConfig({
      schema_version: 1,
      refresh_seconds: 45,
      projects: [
        {
          id: "advance",
          label: "Advance",
          path: "/home/jon/dev/advance",
          github: { owner: "Sharper-Flow", repo: "Advance" },
        },
        {
          id: "toolbox",
          label: "Toolbox",
          path: "/home/jon/toolbox",
          github: { owner: "Sharper-Flow", repo: "toolbox" },
        },
      ],
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error("expected config to parse");
    expect(parsed.config.schema_version).toBe(1);
    expect(parsed.config.refresh_seconds).toBe(45);
    expect(parsed.config.projects.map((project) => project.id)).toEqual([
      "advance",
      "toolbox",
    ]);
    expect(parsed.projectResults.every((project) => project.ok)).toBe(true);
  });

  test("rejects refresh outside 30 to 60 seconds", () => {
    const parsed = parseDashboardConfig({
      schema_version: 1,
      refresh_seconds: 10,
      projects: [
        {
          id: "advance",
          label: "Advance",
          path: "/home/jon/dev/advance",
          github: { owner: "Sharper-Flow", repo: "Advance" },
        },
      ],
    });

    expect(parsed.ok).toBe(false);
    expect(parsed.errors.map((error) => error.code)).toContain(
      "INVALID_REFRESH_SECONDS",
    );
  });

  test("degrades invalid projects without dropping valid projects", () => {
    const parsed = parseDashboardConfig({
      schema_version: 1,
      refresh_seconds: 60,
      projects: [
        {
          id: "advance",
          label: "Advance",
          path: "/home/jon/dev/advance",
          github: { owner: "Sharper-Flow", repo: "Advance" },
        },
        {
          id: "relative",
          label: "Relative",
          path: "relative/path",
          github: { owner: "Sharper-Flow", repo: "Relative" },
        },
      ],
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error("expected partial config to parse");
    expect(parsed.config.projects.map((project) => project.id)).toEqual([
      "advance",
    ]);
    expect(parsed.projectResults).toEqual([
      { id: "advance", ok: true },
      {
        id: "relative",
        ok: false,
        degraded: {
          source: "config",
          code: "PROJECT_PATH_NOT_ABSOLUTE",
          message: "Project path must be absolute.",
        },
      },
    ]);
  });

  test("sanitizes token-like material from dashboard state", () => {
    const state = sanitizeDashboardState({
      schema_version: 1,
      generated_at: "2026-06-25T21:00:00.000Z",
      refresh_seconds: 45,
      projects: [],
      sources: [
        {
          source: "github",
          status: "degraded",
          message: "Authorization failed for token ghp_secret123",
          token: "ghp_secret123",
        },
      ],
    });

    const serialized = JSON.stringify(state);
    expect(serialized).not.toContain("ghp_secret123");
    expect(serialized).not.toContain("token");
    expect(serialized).toContain("[REDACTED]");
  });
});
