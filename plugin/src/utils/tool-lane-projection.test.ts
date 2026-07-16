import { describe, expect, test, vi } from "vitest";

import {
  getLaneProjections,
  getLaneProjection,
  resetLaneProjectionsCache,
} from "./tool-lane-projection";

const mockExecFile = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({
  execFile: mockExecFile,
}));

const manifest = {
  total_tools: 2,
  total_schema_bytes: 200,
  total_approx_tokens_4char_rule: 50,
  conversion_errors: 0,
  tools: {
    adv_status: {
      status: "available" as const,
      schema_bytes: 150,
      approx_tokens_4char_rule: 38,
    },
    adv_engineer: {
      status: "available" as const,
      schema_bytes: 50,
      approx_tokens_4char_rule: 12,
    },
  },
};

describe("tool-lane-projection", () => {
  test("returns available projection when opencode debug agent resolves permissions", async () => {
    resetLaneProjectionsCache();
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        args: string[],
        _opts: unknown,
        callback: (err: Error | null, stdout: string, stderr: string) => void,
      ) => {
        const lane = args[2];
        if (lane === "adv-ci-waiter") {
          callback(
            null,
            '{"level":"info"}\n{"tools":{"adv_status":true,"adv_engineer":false}}',
            "",
          );
        } else {
          callback(
            null,
            '{"tools":{"adv_status":true,"adv_engineer":true}}',
            "",
          );
        }
      },
    );

    const projections = await getLaneProjections(manifest);

    expect(projections["adv-ci-waiter"]).toEqual({
      availability: "available",
      enabled_tools: 1,
      schema_bytes: 150,
      approx_tokens_4char_rule: 38,
      conversion_errors: 0,
    });
    expect(projections["adv-engineer"]).toEqual({
      availability: "available",
      enabled_tools: 2,
      schema_bytes: 200,
      approx_tokens_4char_rule: 50,
      conversion_errors: 0,
    });
  });

  test("returns unavailable projection when opencode debug agent fails", async () => {
    resetLaneProjectionsCache();
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        _opts: unknown,
        callback: (err: Error | null, stdout: string, stderr: string) => void,
      ) => {
        callback(new Error("opencode not found"), "", "");
      },
    );

    const projection = await getLaneProjection(manifest, "adv-engineer");

    expect(projection).toEqual({
      availability: "unavailable",
      enabled_tools: 0,
      schema_bytes: 0,
      approx_tokens_4char_rule: 0,
      conversion_errors: 0,
    });
  });
});
