/**
 * RED-phase runtime + classification table tests for read-model-aware Tier-4
 * MCP degradation.
 *
 * Desired contract:
 *   - Classifications are exactly: pure, needs-read-model, or existing
 *     host-only classes (needs-host-git / needs-host-probe).
 *   - Read-model outage degrades only needs-read-model tools.
 *   - Pure tools are unaffected by read-model outage.
 *   - There is no fallback / catch-all classification such as needs-context.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import {
  TOOL_CLASSIFICATIONS,
  executeTier4Tool,
  type Tier4ToolName,
  type CreateToolMapFn,
} from "./tools/index.js";
import { createDiskStore } from "../storage/store-disk.js";

vi.mock("../storage/store-disk.js", () => ({
  createDiskStore: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFactory(): CreateToolMapFn {
  return vi.fn(() => ({
    adv_epic_list: {
      execute: vi.fn(async () => "epic_list result"),
    },
    adv_tool_catalog: {
      execute: vi.fn(async () => JSON.stringify({ ok: true })),
    },
  })) as unknown as CreateToolMapFn;
}

const ALLOWED_CLASSIFICATIONS = new Set([
  "pure",
  "needs-read-model",
  "needs-host-git",
  "needs-host-probe",
]);

describe("Tier-4 tool classification table", () => {
  it("uses only allowed classifications", () => {
    const bad: { tool: Tier4ToolName; classification: string }[] = [];
    for (const [tool, classes] of Object.entries(TOOL_CLASSIFICATIONS) as [
      Tier4ToolName,
      string[],
    ][]) {
      for (const c of classes) {
        if (!ALLOWED_CLASSIFICATIONS.has(c)) {
          bad.push({ tool, classification: c });
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("status is read-model-backed", () => {
    expect(TOOL_CLASSIFICATIONS.status).toContain("needs-read-model");
    expect(TOOL_CLASSIFICATIONS.status).not.toContain("needs-host-probe");
  });

  it("read-model tools are not mixed with host-probe classes", () => {
    const bad: { tool: Tier4ToolName; classes: string[] }[] = [];
    for (const [tool, classes] of Object.entries(TOOL_CLASSIFICATIONS) as [
      Tier4ToolName,
      string[],
    ][]) {
      if (!classes.includes("needs-read-model")) continue;
      if (classes.includes("needs-host-probe")) {
        bad.push({ tool, classes });
      }
    }
    expect(bad).toEqual([]);
  });
});

describe("Runtime degradation behavior", () => {
  it("read-model outage degrades needs-read-model tools", async () => {
    vi.mocked(createDiskStore).mockRejectedValue(
      new Error("read-model outage"),
    );

    const result = await executeTier4Tool(
      process.cwd(),
      "epic_list",
      {},
      {
        createToolMap: mockFactory(),
      },
    );
    const parsed = JSON.parse(result);

    expect(parsed.degraded).toBe(true);
    expect(parsed.source).toBe("disk_projection");
  });

  it("read-model outage does not affect pure tools", async () => {
    vi.mocked(createDiskStore).mockRejectedValue(
      new Error("read-model outage"),
    );

    const result = await executeTier4Tool(
      process.cwd(),
      "tool_catalog",
      {},
      {
        createToolMap: mockFactory(),
      },
    );
    const parsed = JSON.parse(result);

    expect(parsed.error).toBeUndefined();
  });
});
