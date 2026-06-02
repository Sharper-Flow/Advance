/**
 * ChangeSchema workflow-state sidecar field tests (AI-007 / AC6 of
 * remediateSlopScanFindings).
 *
 * seenReportIds, signal_rejections, and signal_rejections_total must be
 * explicitly typed on ChangeSchema (not merely survive via .passthrough()),
 * so change-state.ts can read them without `as unknown as` casts.
 */

import { describe, expect, test } from "vitest";
import { ChangeSchema } from "./changes";

describe("ChangeSchema signal-rejection sidecar fields", () => {
  const minimalValidChange = {
    id: "test-change",
    title: "Test",
    status: "draft",
    created_at: "2026-01-01T00:00:00.000Z",
    tasks: [],
    deltas: {},
  };

  const validRejection = {
    signalName: "acceptanceUpdated",
    errorMessage: "AGGREGATE_OVERSIZED",
    errorClass: "SEMANTIC",
    payloadDigest: {
      payload_size: 1234,
      payload_sample: "abc",
      payload_fnv1a: "deadbeef",
    },
    rejectedAt: "2026-01-01T00:00:01.000Z",
  };

  test("accepts and types valid sidecar fields", () => {
    const result = ChangeSchema.parse({
      ...minimalValidChange,
      seenReportIds: ["r1", "r2"],
      signal_rejections: [validRejection],
      signal_rejections_total: 1,
    });
    expect(result.seenReportIds).toEqual(["r1", "r2"]);
    expect(result.signal_rejections).toEqual([validRejection]);
    expect(result.signal_rejections_total).toBe(1);
  });

  test("rejects non-number signal_rejections_total (typed, not passthrough)", () => {
    expect(() =>
      ChangeSchema.parse({
        ...minimalValidChange,
        signal_rejections_total: "not-a-number",
      }),
    ).toThrow();
  });

  test("rejects signal_rejections entry missing payloadDigest", () => {
    const { payloadDigest: _omit, ...rejectionNoDigest } = validRejection;
    expect(() =>
      ChangeSchema.parse({
        ...minimalValidChange,
        signal_rejections: [rejectionNoDigest],
      }),
    ).toThrow();
  });
});
