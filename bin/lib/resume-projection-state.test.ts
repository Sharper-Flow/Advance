/**
 * Bun tests for resume-projection completeness markers.
 *
 * AC6 / DONT5 regression cover. The original defect hid because a failed
 * projection and an empty projection were indistinguishable in the payload:
 * per-change timeouts were swallowed by a bare `catch {}` with the comment
 * "Skip unreachable changes; projection is advisory", so nothing surfaced in
 * output OR logs.
 *
 * Run with: bun test bin/lib/resume-projection-state.test.ts
 */

import { describe, expect, test } from "bun:test";

import { buildResumeProjectionState } from "./resume-projection-state";
import type { LiveResumeProjectionResult } from "./resume-projection-live";
import type { EnrichmentOutcome } from "./optional-enrichment";

const NOW = new Date("2026-07-28T12:00:00.000Z");

/** Minimal projection stand-in — shape is irrelevant to marker logic. */
const projection = (nodes: unknown[]) =>
  ({ ready: nodes, blocked: [], active: [] }) as unknown as NonNullable<
    LiveResumeProjectionResult["resume_projection"]
  >;

const settled = (
  value: LiveResumeProjectionResult,
): EnrichmentOutcome<LiveResumeProjectionResult> => ({
  settled: true,
  value,
});

const unsettled = (
  reason: string,
): EnrichmentOutcome<LiveResumeProjectionResult> => ({
  settled: false,
  reason,
});

describe("buildResumeProjectionState", () => {
  test("budget expiry yields unavailable with a reason", () => {
    const state = buildResumeProjectionState(
      unsettled("enrichment exceeded budget of 2000ms"),
      NOW,
    );

    expect(state.completeness).toBe("unavailable");
    expect(state.reason).toContain("budget");
  });

  test("unavailable results carry the underlying disk error", () => {
    const state = buildResumeProjectionState(
      settled({ live: false, error: "disk projection unreadable" }),
      NOW,
    );

    expect(state.completeness).toBe("unavailable");
    expect(state.reason).toContain("disk projection unreadable");
  });

  test("successful projection yields complete with no reason", () => {
    const state = buildResumeProjectionState(
      settled({ live: true, resume_projection: projection([{ id: "a" }]) }),
      NOW,
    );

    expect(state.completeness).toBe("complete");
    expect(state.reason).toBeUndefined();
  });

  test("AC6 — an EMPTY projection is distinguishable from an UNAVAILABLE one", () => {
    const empty = buildResumeProjectionState(
      settled({ live: true, resume_projection: projection([]) }),
      NOW,
    );
    const broken = buildResumeProjectionState(unsettled("timed out"), NOW);

    // "nothing is blocked" vs "we could not determine what is blocked"
    expect(empty.completeness).toBe("complete");
    expect(broken.completeness).toBe("unavailable");
    expect(empty.completeness).not.toBe(broken.completeness);
  });

  test("a reason is always present when completeness is not complete", () => {
    const cases = [
      buildResumeProjectionState(unsettled("timed out"), NOW),
      buildResumeProjectionState(settled({ live: false }), NOW),
    ];

    for (const state of cases) {
      expect(state.completeness).not.toBe("complete");
      expect(state.reason).toBeTruthy();
    }
  });

  test("state is always emitted with schema_version and generated_at", () => {
    const cases = [
      buildResumeProjectionState(unsettled("x"), NOW),
      buildResumeProjectionState(settled({ live: false }), NOW),
      buildResumeProjectionState(
        settled({ live: true, resume_projection: projection([]) }),
        NOW,
      ),
    ];

    for (const state of cases) {
      expect(state.schema_version).toBe(1);
      expect(state.generated_at).toBe(NOW.toISOString());
    }
  });

  test("truncation is signalled explicitly, never silent", () => {
    const state = buildResumeProjectionState(
      settled({
        live: true,
        resume_projection: projection([]),
        truncated: true,
        truncated_count: 52,
      }),
      NOW,
    );

    expect(state.truncated).toBe(true);
    expect(state.truncated_count).toBe(52);
    expect(state.completeness).toBe("partial");
    expect(state.reason).toBeTruthy();
  });
});
