import { describe, expect, test } from "vitest";

import {
  collectConcurrencyEvidence,
  createBaselineSnapshot,
  HISTORICAL_PEAK_ORCHESTRATORS,
  HISTORICAL_PEAK_TOTAL_AGENTS,
  HISTORICAL_WORKER_RSS_MAX_MB,
  HISTORICAL_WORKER_RSS_MIN_MB,
  renderMarkdownReport,
  type SessionDbRow,
} from "./concurrency-evidence-collector";

describe("concurrency-evidence-collector", () => {
  const nowMs = Date.parse("2026-07-29T22:00:00.000Z");

  test("baseline snapshot preserves historical peak and population split", () => {
    const snapshot = createBaselineSnapshot();
    expect(snapshot.historicalPeak?.totalAgents).toBe(
      HISTORICAL_PEAK_TOTAL_AGENTS,
    );
    expect(snapshot.historicalPeak?.orchestrators).toBe(
      HISTORICAL_PEAK_ORCHESTRATORS,
    );
    expect(snapshot.historicalPeak?.workerRssMinMb).toBe(
      HISTORICAL_WORKER_RSS_MIN_MB,
    );
    expect(snapshot.historicalPeak?.workerRssMaxMb).toBe(
      HISTORICAL_WORKER_RSS_MAX_MB,
    );
    expect(snapshot.historicalPeak?.source).toBe("historical_baseline");
    expect(snapshot.historicalPeak?.totalAgents).not.toBe(
      snapshot.historicalPeak?.orchestrators,
    );
  });

  test("baseline report does not claim ten-orchestrator latency", async () => {
    const report = await collectConcurrencyEvidence({
      readSessionRows: async () => [],
      readGlobalSessionRows: async () => [],
      readProcessSnapshot: async () => [],
      listProjectShards: async () => [],
      nowMs,
    });

    expect(report.claims.tenOrchestratorLatencyMeasured).toBe(false);
    expect(report.claims.tenAgentDemandSupported).toBe(true);
    expect(report.summary.historicalPeakMeetsTenAgentTarget).toBe(true);
    expect(report.limits).toContain(
      "This report does not measure ten orchestrator latency.",
    );
    expect(report.limits).toContain(
      "Total agent count is not equivalent to orchestrator count.",
    );
  });

  test("report counts total agents separately from orchestrators", async () => {
    const rows: SessionDbRow[] = [
      {
        sessionId: "ses-orchestrator-1",
        timeCreatedMs: nowMs,
        metadata: JSON.stringify({ sessionKind: "orchestrator" }),
      },
      {
        sessionId: "ses-orchestrator-2",
        timeCreatedMs: nowMs,
        metadata: JSON.stringify({ sessionKind: "orchestrator" }),
      },
      {
        sessionId: "ses-sub-agent-1",
        timeCreatedMs: nowMs,
        metadata: JSON.stringify({ sessionKind: "sub-agent" }),
      },
    ];

    const report = await collectConcurrencyEvidence({
      readSessionRows: async () => rows,
      readGlobalSessionRows: async () => [],
      readProcessSnapshot: async () => [],
      listProjectShards: async () => ["/tmp/project-a"],
      nowMs,
    });

    expect(report.summary.totalAgentsObserved).toBe(3);
    expect(report.summary.orchestratorsObserved).toBe(2);
    expect(report.summary.subAgentsObserved).toBe(1);
    expect(report.summary.totalAgentsObserved).not.toBe(
      report.summary.orchestratorsObserved,
    );
  });

  test("session classification defaults to sub-agent when metadata is absent", async () => {
    const report = await collectConcurrencyEvidence({
      readSessionRows: async () => [
        { sessionId: "ses-unknown", timeCreatedMs: nowMs },
      ],
      readGlobalSessionRows: async () => [],
      readProcessSnapshot: async () => [],
      listProjectShards: async () => ["/tmp/project-a"],
      nowMs,
    });

    expect(report.summary.totalAgentsObserved).toBe(1);
    expect(report.summary.orchestratorsObserved).toBe(0);
  });

  test("orchestrator tools in toolHistory classify session as orchestrator", async () => {
    const report = await collectConcurrencyEvidence({
      readSessionRows: async () => [
        {
          sessionId: "ses-orchestrator",
          timeCreatedMs: nowMs,
          metadata: JSON.stringify({ toolHistory: ["adv_status", "bash"] }),
        },
      ],
      readGlobalSessionRows: async () => [],
      readProcessSnapshot: async () => [],
      listProjectShards: async () => ["/tmp/project-a"],
      nowMs,
    });

    expect(report.summary.orchestratorsObserved).toBe(1);
  });

  test("process samples produce RSS range and stay within budget", async () => {
    const report = await collectConcurrencyEvidence({
      readSessionRows: async () => [],
      readGlobalSessionRows: async () => [],
      readProcessSnapshot: async () => [
        {
          pid: 1001,
          command: "opencode --session ses_abc",
          rssMb: 500,
          source: "process_snapshot",
          provenance: "/proc/1001/stat",
        },
        {
          pid: 1002,
          command: "opencode --session ses_def",
          rssMb: 1500,
          source: "process_snapshot",
          provenance: "/proc/1002/stat",
        },
      ],
      listProjectShards: async () => [],
      nowMs,
    });

    expect(report.summary.workerRssMinMb).toBe(500);
    expect(report.summary.workerRssMaxMb).toBe(1500);
    expect(report.claims.tenAgentMemoryWithinBudget).toBe(true);
  });

  test("current process rss is recorded and budget claim uses historical peak", async () => {
    const report = await collectConcurrencyEvidence({
      readSessionRows: async () => [],
      readGlobalSessionRows: async () => [],
      readProcessSnapshot: async () => [
        {
          pid: 1001,
          command: "opencode",
          rssMb: 2200,
          source: "process_snapshot",
          provenance: "/proc/1001/stat",
        },
      ],
      listProjectShards: async () => [],
      nowMs,
    });

    expect(report.summary.workerRssMaxMb).toBe(2200);
    expect(report.claims.tenAgentMemoryWithinBudget).toBe(true);
    expect(report.snapshot.historicalPeak?.workerRssMaxMb).toBe(
      HISTORICAL_WORKER_RSS_MAX_MB,
    );
  });

  test("failed workflow samples are counted", async () => {
    const report = await collectConcurrencyEvidence({
      readSessionRows: async () => [],
      readGlobalSessionRows: async () => [],
      readProcessSnapshot: async () => [],
      listProjectShards: async () => [],
      sampleWorkflows: async () => [
        {
          workflowId: "wf-ok",
          status: "COMPLETED",
          source: "temporal_visibility",
          provenance: "mock",
        },
        {
          workflowId: "wf-failed",
          status: "FAILED",
          source: "temporal_visibility",
          provenance: "mock",
        },
      ],
      nowMs,
    });

    expect(report.summary.failedWorkflowSamples).toBe(1);
  });

  test("bounded limits are recorded when data sources are unavailable", async () => {
    const report = await collectConcurrencyEvidence({
      readSessionRows: async () => {
        throw new Error("disk offline");
      },
      readGlobalSessionRows: async () => [],
      readProcessSnapshot: async () => [],
      listProjectShards: async () => ["/tmp/project-a"],
      nowMs,
    });

    expect(report.snapshot.limits.some((l) => l.includes("disk offline"))).toBe(
      true,
    );
    expect(report.summary.totalAgentsObserved).toBe(0);
    expect(report.claims.tenAgentDemandSupported).toBe(true); // baseline still supports it
  });

  test("session samples are bounded per source by sessionLimit", async () => {
    const rows: SessionDbRow[] = Array.from({ length: 10 }, (_, i) => ({
      sessionId: `ses-${i}`,
      timeCreatedMs: nowMs,
    }));

    const report = await collectConcurrencyEvidence({
      readSessionRows: async () => rows,
      readGlobalSessionRows: async () => rows,
      readProcessSnapshot: async () => [],
      listProjectShards: async () => ["/tmp/project-a"],
      sessionLimit: 5,
      nowMs,
    });

    // Project and global sources are sampled independently, each capped at 5.
    expect(report.summary.totalAgentsObserved).toBe(10);
    expect(report.snapshot.sessionSamples).toHaveLength(10);
  });

  test("markdown report contains no ten-orchestrator-latency claim", async () => {
    const report = await collectConcurrencyEvidence({
      readSessionRows: async () => [],
      readGlobalSessionRows: async () => [],
      readProcessSnapshot: async () => [],
      listProjectShards: async () => [],
      nowMs,
    });
    const markdown = renderMarkdownReport(report);

    expect(markdown).toContain("Ten-Agent Concurrency Evidence Report");
    expect(markdown).toContain("Ten-orchestrator latency measured: **false**");
    expect(markdown).toContain(
      "This report does not measure ten orchestrator latency.",
    );
    expect(markdown).not.toContain("ten orchestrator latency measured");
    expect(markdown.toLowerCase()).not.toMatch(
      /ten[\s-]orchestrator[\s-]latency[\s-]was[\s-]measured/,
    );
  });

  test("markdown report renders historical peak and current samples", async () => {
    const report = await collectConcurrencyEvidence({
      readSessionRows: async () => [
        {
          sessionId: "ses-live",
          timeCreatedMs: nowMs,
          metadata: JSON.stringify({ sessionKind: "orchestrator" }),
        },
      ],
      readGlobalSessionRows: async () => [],
      readProcessSnapshot: async () => [
        {
          pid: 1234,
          command: "opencode --session ses_live",
          rssMb: 1024,
          source: "process_snapshot",
          provenance: "/proc/1234/stat",
        },
      ],
      listProjectShards: async () => ["/tmp/project-a"],
      nowMs,
    });
    const markdown = renderMarkdownReport(report);

    expect(markdown).toContain("Historical Peak");
    expect(markdown).toContain(String(HISTORICAL_PEAK_TOTAL_AGENTS));
    expect(markdown).toContain("Current Session Samples");
    expect(markdown).toContain("ses-live");
    expect(markdown).toContain("Current Process Samples");
    expect(markdown).toContain("1234");
  });

  test("process samples are bounded by processLimit", async () => {
    const samples = Array.from({ length: 10 }, (_, i) => ({
      pid: 1000 + i,
      command: "opencode",
      rssMb: 100 * (i + 1),
      source: "process_snapshot" as const,
      provenance: "/proc/stat",
    }));

    const report = await collectConcurrencyEvidence({
      readSessionRows: async () => [],
      readGlobalSessionRows: async () => [],
      readProcessSnapshot: async () => samples,
      listProjectShards: async () => [],
      processLimit: 3,
      nowMs,
    });

    expect(report.summary.totalAgentsObserved).toBe(0);
    expect(report.snapshot.processSamples).toHaveLength(3);
  });
});
