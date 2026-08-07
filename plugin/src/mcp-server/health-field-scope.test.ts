import { describe, expect, it } from "vitest";

import { tagHostProbeFields } from "./degradation";
import { TOOL_CLASSIFICATIONS } from "./tools/index";

describe("MCP host-probe field contract", () => {
  it("adds degradation metadata without rewriting nested field values", () => {
    const payload = tagHostProbeFields({
      worker_processes: {
        count: 0,
        processes: [],
      },
      ordinary_field: "unchanged",
    });

    expect(payload.worker_processes).toEqual({
      count: 0,
      processes: [],
      degraded: true,
      source: "host_probe_unavailable_in_mcp",
    });
    expect(payload.ordinary_field).toBe("unchanged");
  });

  it("wraps scalar host-probe fields in an explicit degraded envelope", () => {
    expect(
      tagHostProbeFields({ worker_processes: null }).worker_processes,
    ).toEqual({
      value: null,
      degraded: true,
      source: "host_probe_unavailable_in_mcp",
    });
  });

  it("keeps status classified as a read-model read", () => {
    expect(TOOL_CLASSIFICATIONS.status).toContain("needs-read-model");
  });
});
