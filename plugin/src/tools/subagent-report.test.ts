/** Sub-agent report identity and validation contracts. */

import { describe, expect, test } from "vitest";
import {
  SubagentConsumerWarningSchema,
  type ScopedSubagentReport,
} from "../types";
import { subagentReportKey } from "../types/subagent-reports";
import { verificationWarnings } from "./subagent-report";

describe("subagent report contracts", () => {
  test("keys task-scoped reports deterministically", () => {
    expect(
      subagentReportKey({
        changeId: "change-1",
        taskId: "tk-1",
        agent: "adv-engineer",
        attempt: 2,
      }),
    ).toBe("change-1|tk-1|adv-engineer|2");
  });

  test("keys change-scoped reports and binds implementation cycles", () => {
    expect(
      subagentReportKey({
        changeId: "change-1",
        scope: { kind: "change", scope_key: "research" },
        agent: "adv-researcher",
        attempt: 1,
      }),
    ).toBe("change-1|change:research|adv-researcher|1");
    expect(
      subagentReportKey({
        changeId: "change-1",
        taskId: "tk-1",
        agent: "adv-engineer",
        attempt: 1,
        implementationCycleId: "ic-1",
      }),
    ).toContain("|cycle:ic-1");
  });

  test("validates bounded consumer warnings", () => {
    expect(
      SubagentConsumerWarningSchema.safeParse({
        kind: "consumer_failure",
        message: "Review required",
      }).success,
    ).toBe(true);
    expect(
      SubagentConsumerWarningSchema.safeParse({ code: "", message: "" })
        .success,
    ).toBe(false);
  });

  test("does not fabricate missing test evidence for independent reviewer summaries", () => {
    const report = {
      agent: "adv-reviewer",
      verification: {
        tests_run: ["pnpm --dir plugin run check"],
        results: "pass",
        evidence: "Plugin check passed.",
      },
    } as ScopedSubagentReport;

    expect(verificationWarnings(report)).toEqual([]);
  });
});
