import { describe, expect, test } from "vitest";
import {
  deriveDefectHint,
  renderPortfolioBalance,
  type ImportantChange,
  type PortfolioBalanceInput,
} from "./portfolio-report";

function change(
  changeId: string,
  overrides: Partial<ImportantChange> = {},
): ImportantChange {
  return {
    changeId,
    title: overrides.title ?? changeId,
    gate: overrides.gate ?? "execution",
    tasksDone: overrides.tasksDone ?? 1,
    tasksTotal: overrides.tasksTotal ?? 2,
    lastActivity: overrides.lastActivity ?? "2026-08-01T00:00:00.000Z",
    ...(overrides.linkedIssue ? { linkedIssue: overrides.linkedIssue } : {}),
    ...(overrides.defectHint ? { defectHint: overrides.defectHint } : {}),
    ...(overrides.epic ? { epic: overrides.epic } : {}),
  };
}

function input(importantToComplete: ImportantChange[]): PortfolioBalanceInput {
  return {
    importantToComplete,
    cleanupNeeded: {
      readyToArchive: [],
      stuckAtProposal: [],
      abandonedMidFlight: [],
      duplicateOrSuperseded: [],
      staleEpicEntries: [],
    },
    openIssuesWorthSolving: [],
  };
}

function importantRows(rendered: string): string[] {
  const start = rendered.indexOf("### Important to complete");
  const end = rendered.indexOf("### Cleanup needed");
  return rendered
    .slice(start, end)
    .split("\n")
    .filter((line) => line.startsWith("- "));
}

// ===========================================================================
// rq-backlogCoord10 — unlinked nonterminal changes are represented
// ===========================================================================

describe("renderPortfolioBalance — unlinked change representation (rq-backlogCoord10.1)", () => {
  test("a nonterminal change with no linked issue still appears", () => {
    const rendered = renderPortfolioBalance(input([change("fixThing")]));
    expect(rendered).toContain("fixThing");
    expect(importantRows(rendered)).toHaveLength(1);
  });

  test("unlinked changes are not crowded out by issue-linked changes", () => {
    const rendered = renderPortfolioBalance(
      input([
        change("hasIssue", {
          linkedIssue: { number: 7, priority: "low" },
        }),
        change("noIssue"),
      ]),
    );
    const rows = importantRows(rendered);
    expect(rows).toHaveLength(2);
    expect(rendered).toContain("noIssue");
  });
});

describe("renderPortfolioBalance — structural membership (rq-backlogCoord10.2)", () => {
  test("a change with no defect prefix and no defect hint still appears", () => {
    // Membership must derive from typed state, never from title inference.
    const rendered = renderPortfolioBalance(
      input([change("addSomethingEntirelyNew")]),
    );
    expect(rendered).toContain("addSomethingEntirelyNew");
    expect(importantRows(rendered)).toHaveLength(1);
  });

  test("hint presence never changes which rows are rendered", () => {
    const withoutHints = [change("alpha"), change("beta"), change("gamma")];
    const withHints = [
      change("alpha", {
        defectHint: { source: "origin_kind", evidence: "origin.kind=triage" },
      }),
      change("beta"),
      change("gamma", {
        defectHint: {
          source: "title_prefix",
          evidence: 'title starts with "fix"',
        },
      }),
    ];

    const plain = importantRows(renderPortfolioBalance(input(withoutHints)));
    const hinted = importantRows(renderPortfolioBalance(input(withHints)));

    expect(hinted).toHaveLength(plain.length);
    for (const id of ["alpha", "beta", "gamma"]) {
      expect(renderPortfolioBalance(input(withHints))).toContain(id);
    }
  });
});

describe("renderPortfolioBalance — advisory defect hint (rq-backlogCoord10.3)", () => {
  test("hint renders its evidence source", () => {
    const rendered = renderPortfolioBalance(
      input([
        change("fixThing", {
          defectHint: {
            source: "origin_kind",
            evidence: "origin.kind=triage",
          },
        }),
      ]),
    );
    expect(rendered).toMatch(/defect hint/i);
    expect(rendered).toContain("origin_kind");
    expect(rendered).toContain("origin.kind=triage");
    expect(rendered).toMatch(/advisory/i);
  });

  test("hint lifts an unlinked defect above a priority:low issue-linked change", () => {
    const rendered = renderPortfolioBalance(
      input([
        change("featureWithLowIssue", {
          linkedIssue: { number: 3, priority: "low" },
        }),
        change("fixUnlinked", {
          defectHint: {
            source: "origin_kind",
            evidence: "origin.kind=triage",
          },
        }),
      ]),
    );
    const rows = importantRows(rendered);
    expect(rows[0]).toContain("fixUnlinked");
    expect(rows[1]).toContain("featureWithLowIssue");
  });

  test("hint never outranks a deliberate medium-or-higher triage decision", () => {
    const rendered = renderPortfolioBalance(
      input([
        change("fixUnlinked", {
          defectHint: {
            source: "origin_kind",
            evidence: "origin.kind=triage",
          },
        }),
        change("featureWithMediumIssue", {
          linkedIssue: { number: 4, priority: "medium" },
        }),
      ]),
    );
    const rows = importantRows(rendered);
    expect(rows[0]).toContain("featureWithMediumIssue");
    expect(rows[1]).toContain("fixUnlinked");
  });
});

describe("renderPortfolioBalance — priority label scope (rq-backlogCoord10.4)", () => {
  test("an unlinked change row carries no priority: label", () => {
    const rendered = renderPortfolioBalance(
      input([
        change("fixUnlinked", {
          defectHint: {
            source: "title_prefix",
            evidence: 'title starts with "fix"',
          },
        }),
      ]),
    );
    const row = importantRows(rendered)[0];
    expect(row).not.toContain("priority:");
  });

  test("an issue-linked change still renders its GitHub issue priority", () => {
    const rendered = renderPortfolioBalance(
      input([
        change("hasIssue", {
          linkedIssue: { number: 9, priority: "high" },
        }),
      ]),
    );
    expect(importantRows(rendered)[0]).toContain("priority:high");
  });
});

// ===========================================================================
// deriveDefectHint — origin.kind primary, title prefix secondary
// ===========================================================================

describe("deriveDefectHint", () => {
  test("origin.kind is the primary hint source", () => {
    const hint = deriveDefectHint({
      originKind: "triage",
      title: "Add something new",
    });
    expect(hint?.source).toBe("origin_kind");
  });

  test("title prefix is a secondary hint source", () => {
    const hint = deriveDefectHint({ title: "Fix broken thing" });
    expect(hint?.source).toBe("title_prefix");
  });

  test("origin.kind wins when both signals are present", () => {
    const hint = deriveDefectHint({
      originKind: "triage",
      title: "Fix broken thing",
    });
    expect(hint?.source).toBe("origin_kind");
  });

  test("no signal yields no hint", () => {
    expect(
      deriveDefectHint({ originKind: "adhoc", title: "Add a feature" }),
    ).toBeUndefined();
  });

  test("every hint carries evidence", () => {
    for (const probe of [
      { originKind: "triage", title: "x" },
      { title: "fix y" },
    ]) {
      const hint = deriveDefectHint(probe);
      expect(hint?.evidence).toBeTruthy();
    }
  });
});
