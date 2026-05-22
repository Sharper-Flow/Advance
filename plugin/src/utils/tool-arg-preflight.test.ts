import { describe, expect, test } from "vitest";
import { z } from "zod";
import {
  formatToolArgPreflightError,
  validateToolArgsBeforeExecute,
} from "./tool-arg-preflight";

describe("tool arg preflight", () => {
  test("reports missing required fields while allowing optional/default fields", () => {
    const result = validateToolArgsBeforeExecute(
      "test_tool",
      {
        requiredName: z.string(),
        optionalFlag: z.boolean().optional(),
        defaultLimit: z.number().default(10),
      },
      {},
    );

    expect(result).toEqual({
      ok: false,
      missing: ["requiredName"],
      invalid: [],
    });
  });

  test("reports nested field validation errors for present objects", () => {
    const result = validateToolArgsBeforeExecute(
      "adv_change_show",
      {
        changeId: z.string(),
        include: z
          .object({ readyTasksLimit: z.number().min(1).max(50).optional() })
          .optional(),
      },
      { changeId: "abc", include: { readyTasksLimit: 99 } },
    );

    expect(result.ok).toBe(false);
    expect(result.invalid[0]?.field).toBe("include.readyTasksLimit");
  });

  test("formats zero-arg required field failures without timeout language", () => {
    const output = JSON.parse(
      formatToolArgPreflightError(
        "adv_wisdom_add",
        {
          changeId: z.string(),
          type: z.enum([
            "pattern",
            "success",
            "failure",
            "gotcha",
            "convention",
          ]),
          content: z.string().max(2000),
        },
        {},
      ) ?? "{}",
    );

    expect(output.code).toBe("INVALID_TOOL_ARGS");
    expect(output.tool).toBe("adv_wisdom_add");
    expect(output.missing).toEqual(["changeId", "type", "content"]);
    expect(output.errorClass).toBeUndefined();
    expect(output.error).not.toContain("timeout");
  });

  test("enforces adv_change_update artifact cross-field constraints", () => {
    const schema = {
      changeId: z.string(),
      proposal: z.string().optional(),
      problemStatement: z.string().optional(),
      agreement: z.string().optional(),
      design: z.string().optional(),
    };

    expect(
      validateToolArgsBeforeExecute("adv_change_update", schema, {
        changeId: "abc",
      }).invalid[0]?.message,
    ).toContain("At least one artifact field");

    expect(
      validateToolArgsBeforeExecute("adv_change_update", schema, {
        changeId: "abc",
        proposal: "",
        agreement: "   ",
      }).invalid[0]?.message,
    ).toContain("non-blank strings");

    expect(
      validateToolArgsBeforeExecute("adv_change_update", schema, {
        changeId: "abc",
        proposal: "real content",
      }).ok,
    ).toBe(true);

    const mixedBlank = validateToolArgsBeforeExecute(
      "adv_change_update",
      schema,
      {
        changeId: "abc",
        proposal: "real content",
        design: "",
      },
    );
    expect(mixedBlank.ok).toBe(false);
    expect(mixedBlank.invalid).toEqual([
      {
        field: "design",
        message:
          "Provided artifact fields must be non-blank strings; omit fields you do not want to change.",
      },
    ]);

    // fixWarpSessionLookup regression: executiveSummary must be recognized
    // as a valid artifact field (see plugin/src/utils/tool-arg-preflight.ts
    // ARTIFACT_FIELDS — historically omitted, blocking acceptance flows).
    const schemaWithSummary = {
      ...schema,
      executiveSummary: z.string().optional(),
    };
    expect(
      validateToolArgsBeforeExecute("adv_change_update", schemaWithSummary, {
        changeId: "abc",
        executiveSummary: "post-acceptance narrative",
      }).ok,
    ).toBe(true);
  });

  test("redacts sensitive received args in preflight errors", () => {
    const output = JSON.parse(
      formatToolArgPreflightError(
        "secret_tool",
        { changeId: z.string() },
        { apiKey: "secret", nested: { token: "also-secret" } },
      ) ?? "{}",
    );

    expect(output.received_args.apiKey).toBe("[REDACTED]");
    expect(output.received_args.nested.token).toBe("[REDACTED]");
  });
});
