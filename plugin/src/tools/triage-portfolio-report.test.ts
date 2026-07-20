import { describe, expect, test } from "vitest";
import { renderPortfolioBalance } from "./triage/portfolio-report";

describe("renderPortfolioBalance", () => {
  test("renders exactly three portfolio sections with Epic context", () => {
    const output = renderPortfolioBalance({
      importantToComplete: [
        {
          changeId: "finishCheckout",
          title: "Finish checkout",
          gate: "acceptance",
          tasksDone: 4,
          tasksTotal: 4,
          lastActivity: "2026-07-20T10:00:00.000Z",
          linkedIssue: { number: 9, priority: "critical" },
          epic: { id: "commerce", title: "Commerce launch", order: 2 },
        },
      ],
      cleanupNeeded: {
        readyToArchive: ["doneChange"],
        stuckAtProposal: [],
        abandonedMidFlight: [],
        duplicateOrSuperseded: [],
        staleEpicEntries: [],
      },
      openIssuesWorthSolving: [
        {
          number: 12,
          title: "Fix invoices",
          priority: "high",
          createdAt: "2026-07-19T00:00:00.000Z",
        },
      ],
    });

    expect(output.match(/^### /gm)).toHaveLength(3);
    expect(output).toContain("### Important to complete");
    expect(output).toContain("Epic commerce — Commerce launch — order 2");
    expect(output).toContain("### Cleanup needed");
    expect(output).toContain("→ /adv-cleanup");
    expect(output).toContain("### Open issues worth solving");
    expect(output).toContain("→ /adv-proposal #12");
  });

  test("sorts changes by issue priority then gate proximity", () => {
    const output = renderPortfolioBalance({
      importantToComplete: [
        {
          changeId: "lowRelease",
          title: "Low",
          gate: "release",
          tasksDone: 1,
          tasksTotal: 1,
          lastActivity: "2026-07-20T00:00:00.000Z",
          linkedIssue: { number: 1, priority: "low" },
        },
        {
          changeId: "highExecution",
          title: "High",
          gate: "execution",
          tasksDone: 1,
          tasksTotal: 2,
          lastActivity: "2026-07-19T00:00:00.000Z",
          linkedIssue: { number: 2, priority: "high" },
        },
      ],
      cleanupNeeded: {
        readyToArchive: [],
        stuckAtProposal: [],
        abandonedMidFlight: [],
        duplicateOrSuperseded: [],
        staleEpicEntries: [],
      },
      openIssuesWorthSolving: [],
    });
    expect(output.indexOf("highExecution")).toBeLessThan(
      output.indexOf("lowRelease"),
    );
  });

  test("caps every section at ten rows and reports overflow", () => {
    const ids = Array.from({ length: 12 }, (_, index) => `change${index}`);
    const output = renderPortfolioBalance({
      importantToComplete: ids.map((changeId) => ({
        changeId,
        title: changeId,
        gate: "execution",
        tasksDone: 0,
        tasksTotal: 1,
        lastActivity: "2026-07-20T00:00:00.000Z",
      })),
      cleanupNeeded: {
        readyToArchive: ids,
        stuckAtProposal: [],
        abandonedMidFlight: [],
        duplicateOrSuperseded: [],
        staleEpicEntries: [],
      },
      openIssuesWorthSolving: ids.map((_, index) => ({
        number: index + 1,
        title: `Issue ${index + 1}`,
        priority: "medium",
        createdAt: "2026-07-20T00:00:00.000Z",
      })),
    });
    expect(output.match(/\(2 more not shown\)/g)).toHaveLength(3);
    expect(output).not.toContain("change11 — change11");
    expect(output).not.toContain("#12 — Issue 12");
  });
});
