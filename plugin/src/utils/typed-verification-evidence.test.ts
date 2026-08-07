import { describe, expect, it } from "vitest";
import { resolveTypedVerificationWarnings } from "./typed-verification-evidence";

describe("resolveTypedVerificationWarnings", () => {
  it("resolves the exact run ID returned by adv_run_test", () => {
    expect(
      resolveTypedVerificationWarnings(
        [{ test_run_id: "tr_recorded", exit_code: 0 }],
        [
          {
            runId: "tr_recorded",
            exitCode: 0,
            command: "pnpm test -- focused",
          },
        ],
      ),
    ).toEqual([]);
  });

  it("fails closed when no durable record has the referenced run ID", () => {
    expect(
      resolveTypedVerificationWarnings(
        [{ test_run_id: "tr_missing", exit_code: 0 }],
        [{ runId: "tr_other", exitCode: 0 }],
      ),
    ).toEqual([
      {
        kind: "verification_missing",
        message:
          "No durable adv_run_test evidence found for run_id: tr_missing",
      },
    ]);
  });
});
