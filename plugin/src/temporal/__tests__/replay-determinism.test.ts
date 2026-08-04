import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Worker } from "@temporalio/worker";
import {
  AFFECTED_POISONED_CHANGE_IDS,
  auditSanitizedHistory,
  PoisonedHistoryClassificationSchema,
  assertCompletePoisonedHistoryClassifications,
} from "../replay-history-classification";

// rq-workflowVersioning01 — committed workflow histories must replay in CI.
const workflowsPath = fileURLToPath(
  new URL("../workflows.ts", import.meta.url),
);

interface ReplayFixtureMetadata {
  name: string;
  workflowType: "changeWorkflow";
  workflowId: string;
  covers: string[];
  eventCount: number;
  incidentEventId: string;
  incidentEventType: string;
  /** Patch marker id (core_patch VersionMarker) the history records, when any. */
  patchMarker?: string;
  /** Patch marker ids when a fixture covers multiple workflow patches. */
  patchMarkers?: string[];
}

interface ReplayFixture {
  metadataUrl: URL;
  historyUrl: URL;
  classificationUrl?: URL;
  /**
   * Patch marker id the committed history must record as a core_patch
   * VersionMarker. Omit for pre-patch legacy histories (which instead prove
   * the current patched code replays a history that predates the marker).
   */
  patchMarker?: string;
  patchMarkers?: string[];
  absentPatchMarkers?: string[];
  /** Substring the metadata `covers[]` must include (branch-specific coverage). */
  coversIncludes?: string;
}

const replayFixtures: ReplayFixture[] = [
  {
    // TERMINAL_PROJECTION_PATCH + GATE_COMPLETED_PROJECTION_PATCH:
    // a current history completes a release gate, receives archiveChange, and
    // records both projection markers before the awaited projections.
    metadataUrl: new URL(
      "./replay/histories/fixArchiveTerminalDurability.terminal-archive.metadata.json",
      import.meta.url,
    ),
    historyUrl: new URL(
      "./replay/histories/fixArchiveTerminalDurability.terminal-archive.history.json",
      import.meta.url,
    ),
    patchMarkers: ["gate-completed-projection-v1", "terminal-projection-v1"],
    coversIncludes: "TERMINAL_PROJECTION_PATCH",
  },
  {
    // Pre-patch terminal archive history: the same gate and archive signals
    // execute without either projection marker, preserving the legacy
    // fire-and-forget projection command sequence during replay.
    metadataUrl: new URL(
      "./replay/histories/fixArchiveTerminalDurability.terminal-archive-legacy.metadata.json",
      import.meta.url,
    ),
    historyUrl: new URL(
      "./replay/histories/fixArchiveTerminalDurability.terminal-archive-legacy.history.json",
      import.meta.url,
    ),
    absentPatchMarkers: [
      "gate-completed-projection-v1",
      "terminal-projection-v1",
    ],
    coversIncludes: "TERMINAL_PROJECTION_PATCH (terminal-projection-v1)",
  },
  {
    // Pre-patch archiveConverged in-flight history: the terminal path is
    // entered via the atomic converged signal (handler mutations + Activity +
    // projection in one handler) without either new projection marker, so
    // in-flight converged executions replay through the legacy branches.
    metadataUrl: new URL(
      "./replay/histories/fixArchiveTerminalDurability.terminal-archive-converged-legacy.metadata.json",
      import.meta.url,
    ),
    historyUrl: new URL(
      "./replay/histories/fixArchiveTerminalDurability.terminal-archive-converged-legacy.history.json",
      import.meta.url,
    ),
    absentPatchMarkers: [
      "gate-completed-projection-v1",
      "terminal-projection-v1",
    ],
    coversIncludes: "archiveConverged legacy",
  },
  {
    // Protects DISCOVERY_CONTRACT_READINESS_PATCH in workflows.ts. Keep this
    // fixture while pre-contract discovery histories can still replay through
    // the legacy branch; removing it should coincide with patch deprecation.
    metadataUrl: new URL(
      "./replay/histories/fixGateAutoWorktree.discovery-gate-tmprl1100.metadata.json",
      import.meta.url,
    ),
    historyUrl: new URL(
      "./replay/histories/fixGateAutoWorktree.discovery-gate-tmprl1100.history.json",
      import.meta.url,
    ),
    // Pre-patch poisoned history: no marker; it proves the patched code
    // replays a TMPRL1100 discovery-gate history deterministically.
    coversIncludes: "TMPRL1100",
  },
  {
    // STATE_BACKED_GATE_ARTIFACT_PROOF_PATCH (state-backed-gate-artifact-proof-v1):
    // new history completing the proposal gate via state-backed artifact
    // evidence, recording the patch marker before deriving evidence from
    // state.documents without disk inspection.
    metadataUrl: new URL(
      "./replay/histories/addReplayReportBounds.state-backed-gate-artifact.metadata.json",
      import.meta.url,
    ),
    historyUrl: new URL(
      "./replay/histories/addReplayReportBounds.state-backed-gate-artifact.history.json",
      import.meta.url,
    ),
    patchMarker: "state-backed-gate-artifact-proof-v1",
    coversIncludes: "STATE_BACKED_GATE_ARTIFACT_PROOF_PATCH",
  },
  {
    // STATE_BACKED_ACCEPTANCE_PROOF_PATCH (state-backed-acceptance-proof-v1):
    // new history completing the acceptance gate via state-backed acceptance
    // proof, materializing executive-summary.md and acceptance.md.
    metadataUrl: new URL(
      "./replay/histories/addReplayReportBounds.state-backed-acceptance.metadata.json",
      import.meta.url,
    ),
    historyUrl: new URL(
      "./replay/histories/addReplayReportBounds.state-backed-acceptance.history.json",
      import.meta.url,
    ),
    patchMarker: "state-backed-acceptance-proof-v1",
    coversIncludes: "STATE_BACKED_ACCEPTANCE_PROOF_PATCH",
  },
  {
    // ACCEPTANCE_EXECUTIVE_SUMMARY_PROOF_PATCH (acceptance-executive-summary-proof-v1):
    // legacy history completing the acceptance gate via the disk-inspect
    // branch; current code replays it through the legacy path because the
    // STATE_BACKED_ACCEPTANCE_PROOF_PATCH marker is absent.
    metadataUrl: new URL(
      "./replay/histories/addReplayReportBounds.acceptance-executive-summary.metadata.json",
      import.meta.url,
    ),
    historyUrl: new URL(
      "./replay/histories/addReplayReportBounds.acceptance-executive-summary.history.json",
      import.meta.url,
    ),
    patchMarker: "acceptance-executive-summary-proof-v1",
    coversIncludes: "ACCEPTANCE_EXECUTIVE_SUMMARY_PROOF_PATCH",
  },
  {
    // ACCEPTANCE_READINESS_FENCE_PATCH (acceptance-readiness-revision-v1):
    // new history completing the acceptance gate via the state-backed proof
    // branch, recording the fence marker before checking the readiness revision
    // and before the final completion.
    metadataUrl: new URL(
      "./replay/histories/fixAcceptanceReadiness.acceptance-readiness-fence.metadata.json",
      import.meta.url,
    ),
    historyUrl: new URL(
      "./replay/histories/fixAcceptanceReadiness.acceptance-readiness-fence.history.json",
      import.meta.url,
    ),
    patchMarker: "acceptance-readiness-revision-v1",
    coversIncludes: "ACCEPTANCE_READINESS_FENCE_PATCH",
  },
  {
    // ACCEPTANCE_READINESS_FENCE_PATCH (acceptance-readiness-revision-v1):
    // legacy history completing the acceptance gate before the fence marker
    // existed. Current patched code skips the fence check because the marker is
    // absent, preserving replay determinism for pre-fence acceptance histories.
    metadataUrl: new URL(
      "./replay/histories/fixAcceptanceReadiness.acceptance-readiness-fence-legacy.metadata.json",
      import.meta.url,
    ),
    historyUrl: new URL(
      "./replay/histories/fixAcceptanceReadiness.acceptance-readiness-fence-legacy.history.json",
      import.meta.url,
    ),
    // Pre-patch poisoned history: no fence marker; it proves the patched code
    // replays a pre-fence acceptance history deterministically.
    coversIncludes:
      "ACCEPTANCE_READINESS_FENCE_PATCH (acceptance-readiness-revision-v1) (legacy)",
  },
  {
    // WORKER_BUNDLE_FRESHNESS_PROVENANCE_PATCH (worker-bundle-freshness-v1):
    // legacy history completing the release gate before the worker-bundle
    // provenance patch existed. Current patched code skips the provenance check
    // because the marker is absent, preserving replay determinism for pre-patch
    // release histories.
    metadataUrl: new URL(
      "./replay/histories/addWorkerBundleFreshness.worker-bundle-freshness-legacy.metadata.json",
      import.meta.url,
    ),
    historyUrl: new URL(
      "./replay/histories/addWorkerBundleFreshness.worker-bundle-freshness-legacy.history.json",
      import.meta.url,
    ),
    coversIncludes:
      "WORKER_BUNDLE_FRESHNESS_PROVENANCE_PATCH (worker-bundle-freshness-v1) (legacy)",
  },
  ...AFFECTED_POISONED_CHANGE_IDS.map((changeId) => ({
    metadataUrl: new URL(
      `./replay/histories/${changeId}.poisoned-production.metadata.json`,
      import.meta.url,
    ),
    historyUrl: new URL(
      `./replay/histories/${changeId}.poisoned-production.history.json`,
      import.meta.url,
    ),
    classificationUrl: new URL(
      `./replay/histories/${changeId}.poisoned-production.classification.json`,
      import.meta.url,
    ),
  })),
];

async function readJson<T>(url: URL): Promise<T> {
  return JSON.parse(await readFile(url, "utf8")) as T;
}

interface ReplayHistoryEvent {
  eventId: string;
  eventType: string;
  markerRecordedEventAttributes?: {
    markerName?: string;
    details?: Record<string, { payloads?: Array<{ data?: string }> }>;
  };
}

/** Decode the core_patch VersionMarker patch id from a MARKER_RECORDED event. */
function markerPatchId(event: ReplayHistoryEvent): string | undefined {
  const details = event.markerRecordedEventAttributes?.details;
  if (!details) return undefined;
  for (const value of Object.values(details)) {
    for (const payload of value.payloads ?? []) {
      if (!payload.data) continue;
      try {
        const decoded = JSON.parse(
          Buffer.from(payload.data, "base64").toString("utf8"),
        ) as { id?: string };
        if (typeof decoded.id === "string") return decoded.id;
      } catch {
        // Not a JSON payload; skip.
      }
    }
  }
  return undefined;
}

describe("changeWorkflow replay determinism", () => {
  it("records one terminal classification for each affected production history", async () => {
    const rows = await Promise.all(
      AFFECTED_POISONED_CHANGE_IDS.map((changeId) =>
        readJson<unknown>(
          new URL(
            `./replay/histories/${changeId}.poisoned-production.classification.json`,
            import.meta.url,
          ),
        ),
      ),
    );

    expect(
      assertCompletePoisonedHistoryClassifications(rows, {
        requireTerminal: true,
      }),
    ).toHaveLength(AFFECTED_POISONED_CHANGE_IDS.length);
  });

  it("makeLegacyDesignValidation poisoned production history is self-healed and replays cleanly", async () => {
    const metadata = await readJson<ReplayFixtureMetadata>(
      new URL(
        "./replay/histories/makeLegacyDesignValidation.poisoned-production.metadata.json",
        import.meta.url,
      ),
    );
    const history = await readJson<{ events: ReplayHistoryEvent[] }>(
      new URL(
        "./replay/histories/makeLegacyDesignValidation.poisoned-production.history.json",
        import.meta.url,
      ),
    );
    const classification = PoisonedHistoryClassificationSchema.parse(
      await readJson<unknown>(
        new URL(
          "./replay/histories/makeLegacyDesignValidation.poisoned-production.classification.json",
          import.meta.url,
        ),
      ),
    );

    expect(classification.outcome).toBe("self_healed");
    expect(classification).not.toHaveProperty("recoveryEvidence");
    expect(classification).not.toHaveProperty("recoveryTarget");
    expect(metadata.covers.join("\n")).toContain(classification.observedError);
    await expect(
      Worker.runReplayHistory(
        { workflowsPath, replayName: metadata.name },
        history,
        metadata.workflowId,
      ),
    ).resolves.toBeUndefined();
  }, 30_000);

  it.each(replayFixtures)(
    "replays committed history fixture %#",
    async ({
      metadataUrl,
      historyUrl,
      classificationUrl,
      patchMarker,
      patchMarkers,
      absentPatchMarkers,
      coversIncludes,
    }) => {
      const metadata = await readJson<ReplayFixtureMetadata>(metadataUrl);
      const history = await readJson<{ events: ReplayHistoryEvent[] }>(
        historyUrl,
      );

      expect(metadata.workflowType).toBe("changeWorkflow");
      expect(history.events).toHaveLength(metadata.eventCount);
      expect(history.events).toContainEqual(
        expect.objectContaining({
          eventId: metadata.incidentEventId,
          eventType: metadata.incidentEventType,
        }),
      );
      if (coversIncludes) {
        expect(metadata.covers.join("\n")).toContain(coversIncludes);
      }

      if (patchMarker) {
        // Branch-specific coverage: the committed history must record the
        // target patch marker as a core_patch VersionMarker.
        const recordedMarkers = history.events
          .filter((e) => e.eventType === "EVENT_TYPE_MARKER_RECORDED")
          .map(markerPatchId);
        expect(recordedMarkers).toContain(patchMarker);
      }
      if (patchMarkers) {
        const recordedMarkers = history.events
          .filter((e) => e.eventType === "EVENT_TYPE_MARKER_RECORDED")
          .map(markerPatchId);
        for (const marker of patchMarkers) {
          expect(recordedMarkers).toContain(marker);
        }
      }
      if (absentPatchMarkers) {
        const recordedMarkers = history.events
          .filter((e) => e.eventType === "EVENT_TYPE_MARKER_RECORDED")
          .map(markerPatchId);
        for (const marker of absentPatchMarkers) {
          expect(recordedMarkers).not.toContain(marker);
        }
      }

      const replay = () =>
        Worker.runReplayHistory(
          {
            workflowsPath,
            replayName: metadata.name,
          },
          history,
          metadata.workflowId,
        );
      if (classificationUrl) {
        const classification = PoisonedHistoryClassificationSchema.parse(
          await readJson<unknown>(classificationUrl),
        );
        expect(auditSanitizedHistory(history)).toEqual({
          safe: true,
          findings: [],
        });
        expect(classification.workflowId).toBe(metadata.workflowId);
        expect(metadata.covers.join("\n")).toContain(
          classification.observedError,
        );
        if (
          classification.outcome === "reproduced" ||
          classification.outcome === "immutable_history"
        ) {
          await expect(replay()).rejects.toThrow();
        } else {
          await expect(replay()).resolves.toBeUndefined();
        }
      } else {
        await replay();
      }
    },
    30_000,
  );
});
