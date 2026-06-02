/**
 * AC6 — signal invariant for `ArtifactPayload`.
 *
 * Invariant: for every defined field on `ArtifactPayload`, exactly ONE
 * content signal fires with matching `kind`. Undefined fields fire zero
 * signals. Signal ordering matches `ARTIFACT_SIGNAL_ORDER` (proposal →
 * problemStatement → agreement → design → executiveSummary → acceptance).
 *
 * Tested at the tool-layer fan-out boundary using a recording mock for
 * `getGuardedChangeHandle`. The structural invariant is what protects the
 * sequential-await ordering (C5) and the metadata signal pairing.
 */

import { describe, expect, it, vi } from "vitest";

import { createChangeOps } from "./store-temporal/changes";
import type { ArtifactPayload } from "../types";

interface RecordedSignal {
  signalName: string;
  kind?: string;
  text?: string;
}

function buildRecordingDeps(): {
  signals: RecordedSignal[];
  deps: Parameters<typeof createChangeOps>[0];
} {
  const signals: RecordedSignal[] = [];

  const handle = {
    signal: vi.fn(async (def: { name?: string }, payload: unknown) => {
      const signalName = def.name ?? "unknown";
      const p = payload as { text?: string; kind?: string };
      signals.push({
        signalName,
        kind: p.kind,
        text: p.text,
      });
    }),
  };

  const workflowClient = {
    workflow: {
      start: vi.fn(),
      getHandle: vi.fn(() => handle),
    },
  };

  const change = {
    id: "test-change",
    title: "test",
    status: "draft",
    created_at: "2026-05-28T00:00:00.000Z",
    tasks: [],
    deltas: {},
    wisdom: [],
    gates: {},
    reentry_history: [],
  };

  const legacy = {
    paths: { changes: "/tmp/changes", root: "/tmp/project" },
    changes: {
      create: vi
        .fn()
        .mockResolvedValue({ changeId: change.id, path: "/tmp/x/proposal.md" }),
      get: vi.fn().mockResolvedValue({ success: true, data: change }),
      save: vi.fn().mockResolvedValue(undefined),
      updateArtifacts: vi.fn().mockResolvedValue({ success: true }),
    },
  };

  const deps = {
    input: {
      legacy,
      temporal: { client: workflowClient },
      projectId: "test-project",
    },
    legacy,
    invalidateChange: vi.fn(),
    updateOverlay: vi.fn(),
    emitChangeSummarySignal: vi.fn(),
    indexTasksFromState: vi.fn(),
    setCachedChange: vi.fn(),
    getTemporalChange: vi
      .fn()
      .mockResolvedValue({ success: true, data: { documents: {} } }),
    listResolvedChanges: vi.fn(),
    getTemporalWorkflowClient: () => workflowClient,
    dualWriteAfterMutation: vi.fn(),
  } as never;

  return { signals, deps };
}

describe("AC6 — ArtifactPayload signal invariant", () => {
  it("fires zero content signals when artifacts payload is empty", async () => {
    const { signals, deps } = buildRecordingDeps();
    const ops = createChangeOps(deps);

    await ops.updateArtifacts("test-change", {});

    const contentSignals = signals.filter(
      (s) =>
        s.signalName.endsWith("Updated") && !s.signalName.includes("Metadata"),
    );
    expect(contentSignals).toHaveLength(0);
  });

  it("fires exactly one content signal per defined field (single field)", async () => {
    const { signals, deps } = buildRecordingDeps();
    const ops = createChangeOps(deps);

    await ops.updateArtifacts("test-change", { proposal: "p" });

    // Content signal kinds (excluding metadata signals)
    const contentSignals = signals.filter((s) => s.text !== undefined);
    expect(contentSignals).toHaveLength(1);
    expect(contentSignals[0].text).toBe("p");
  });

  it("fires content signals in canonical order for full payload", async () => {
    const { signals, deps } = buildRecordingDeps();
    const ops = createChangeOps(deps);

    const payload: ArtifactPayload = {
      proposal: "p",
      problemStatement: "ps",
      agreement: "ag",
      design: "d",
      executiveSummary: "es",
      acceptance: "ac",
    };
    await ops.updateArtifacts("test-change", payload);

    const contentTexts = signals
      .filter((s) => s.text !== undefined)
      .map((s) => s.text);
    expect(contentTexts).toEqual(["p", "ps", "ag", "d", "es", "ac"]);
  });

  it("fires content signals only for defined fields (subset)", async () => {
    const { signals, deps } = buildRecordingDeps();
    const ops = createChangeOps(deps);

    await ops.updateArtifacts("test-change", {
      proposal: "p",
      design: "d",
      acceptance: "ac",
    });

    const contentTexts = signals
      .filter((s) => s.text !== undefined)
      .map((s) => s.text);
    expect(contentTexts).toEqual(["p", "d", "ac"]);
  });

  it("preserves order even when fields are provided out-of-canonical order", async () => {
    const { signals, deps } = buildRecordingDeps();
    const ops = createChangeOps(deps);

    // Intentionally specify fields in non-canonical order
    await ops.updateArtifacts("test-change", {
      acceptance: "ac",
      proposal: "p",
      design: "d",
    });

    const contentTexts = signals
      .filter((s) => s.text !== undefined)
      .map((s) => s.text);
    // ARTIFACT_SIGNAL_ORDER fan-out: proposal → design → acceptance
    expect(contentTexts).toEqual(["p", "d", "ac"]);
  });

  it("each content signal is paired with a metadata signal", async () => {
    const { signals, deps } = buildRecordingDeps();
    const ops = createChangeOps(deps);

    await ops.updateArtifacts("test-change", {
      proposal: "p",
      design: "d",
    });

    // 2 content signals + 2 metadata signals = 4 total
    expect(signals.filter((s) => s.text !== undefined)).toHaveLength(2);
    expect(signals.filter((s) => s.kind !== undefined)).toHaveLength(2);
  });
});
