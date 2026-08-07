/**
 * status-enrich fail-closed plan routing (AC9, C5, DONT4).
 *
 * Before an active build-bound receipt, a directive derivation failure falls
 * back to the first-open-gate next-action recommendation (legacy). After
 * activation, a degraded plan stops the plan-dependent next-gate
 * recommendation and attaches typed degraded diagnostics instead.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTempDir, cleanupTempDir } from "../__tests__/setup";
import type { Store } from "../storage/store";
import type { Change, ChangeRecency, Gates } from "../types";
import {
  enrichRecentChangeStatus,
  type StatusRecommendationCarrier,
} from "./status-enrich";

let tempDir: string | undefined;

beforeEach(() => {
  tempDir = undefined;
});

afterEach(async () => {
  delete process.env.ADV_PLAN_ROUTING_FAIL_CLOSED;
  if (tempDir) await cleanupTempDir(tempDir);
  tempDir = undefined;
});

/** Gates missing `release`: guaranteed to break plan derivation. */
const MALFORMED_GATES = {
  proposal: { status: "done" },
  discovery: { status: "done" },
  design: { status: "done" },
  planning: { status: "pending" },
  execution: { status: "pending" },
  acceptance: { status: "pending" },
} as unknown as Gates;

function changeWithMalformedGates(id: string): Change {
  return {
    $schema: "https://advance.dev/schemas/change.v1.json",
    id,
    title: `Change ${id}`,
    status: "active",
    created_at: "2026-05-07T00:00:00.000Z",
    tasks: [],
    deltas: {},
    gates: MALFORMED_GATES,
    reentry_history: [],
    wisdom: [],
    documents: { proposal: `# Proposal for ${id}` },
  } as Change;
}

function recency(id: string): ChangeRecency {
  return {
    id,
    title: `Change ${id}`,
    status: "active",
    completedTasks: 0,
    taskCount: 0,
    lastActivityAt: new Date().toISOString(),
    minutesSinceActivity: 5,
  };
}

describe("enrichRecentChangeStatus fail-closed plan routing (AC9)", () => {
  it("pre-cutover: derivation failure falls back to first-open-gate routing", async () => {
    tempDir = await createTempDir();
    const store = {
      changes: { get: vi.fn().mockResolvedValue({ success: false }) },
      paths: { root: tempDir, changes: `${tempDir}/.adv/changes` },
    } as unknown as Store;
    const status: StatusRecommendationCarrier = { recommendations: [] };
    const rc = recency("change-x");

    await enrichRecentChangeStatus(rc, status, store, "off", true, {
      change: changeWithMalformedGates("change-x"),
    });

    expect(rc._directive).toBeUndefined();
    expect(rc._phasePlan).toBeUndefined();
    // The directive-sourced recommendation needs a directive, so the legacy
    // fallback routes via the recency item's gateId (first open gate).
    const nextGate = status.recommendation_items?.find(
      (item) => item.kind === "next_gate" && item.source === "gate",
    );
    expect(nextGate).toBeUndefined();
    const recencyItems = status.recommendation_items?.filter(
      (item) => item.source === "recency",
    );
    expect(recencyItems?.some((item) => item.gateId === "planning")).toBe(true);
  });
});
