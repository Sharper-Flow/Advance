import { describe, expect, test } from "vitest";
import {
  CrossEpicRedirectSchema,
  DependencyCycleErrorSchema,
  DepPrereqNonterminalErrorSchema,
  InvalidWorkNodeRefErrorSchema,
  ResumeProjectionSchema,
  ResumeRowSchema,
  ShellPrereqNonterminalErrorSchema,
  UnresolvedDependencyErrorSchema,
  WorkGraphDiagnosticsSchema,
  WorkNodeRefSchema,
} from "./work-graph";
import { EpicShellEntrySchema } from "./epics";
import { ChangeSchema } from "./changes";

describe("WorkNodeRefSchema", () => {
  test("parses epic_entry kind", () => {
    const ref = {
      kind: "epic_entry",
      epic_id: "systemizeAdvOrchestration",
      entry_id: "shell-1",
    };
    expect(WorkNodeRefSchema.parse(ref)).toEqual(ref);
  });

  test("parses change kind with 40-hex project_id", () => {
    const ref = {
      kind: "change",
      project_id: "bdf259aa162ae192af5b18899ccdc653b085528d",
      change_id: "addDependencyAwareResume",
    };
    expect(WorkNodeRefSchema.parse(ref)).toEqual(ref);
  });

  test("rejects unknown kind", () => {
    expect(() =>
      WorkNodeRefSchema.parse({
        kind: "unknown",
        epic_id: "x",
        entry_id: "y",
      }),
    ).toThrow();
  });

  test("rejects missing kind", () => {
    expect(() =>
      WorkNodeRefSchema.parse({ epic_id: "x", entry_id: "y" }),
    ).toThrow();
  });

  test("rejects change kind with malformed project_id", () => {
    expect(() =>
      WorkNodeRefSchema.parse({
        kind: "change",
        project_id: "not-a-hash",
        change_id: "x",
      }),
    ).toThrow();
  });

  test("rejects epic_entry missing entry_id", () => {
    expect(() =>
      WorkNodeRefSchema.parse({ kind: "epic_entry", epic_id: "x" }),
    ).toThrow();
  });

  test("rejects change missing change_id", () => {
    expect(() =>
      WorkNodeRefSchema.parse({
        kind: "change",
        project_id: "bdf259aa162ae192af5b18899ccdc653b085528d",
      }),
    ).toThrow();
  });
});

describe("ResumeRowSchema", () => {
  test("parses a ready_to_promote shell row", () => {
    const row = {
      node: { kind: "epic_entry", epic_id: "e1", entry_id: "s1" },
      title: "Future work",
      kind: "epic_shell",
      lifecycle: "ready_to_promote",
      advisory_rank: 0,
    };
    expect(ResumeRowSchema.parse(row)).toEqual({
      ...row,
      blockers: [],
    });
  });

  test("parses a blocked change row with blockers", () => {
    const row = {
      node: {
        kind: "change",
        project_id: "bdf259aa162ae192af5b18899ccdc653b085528d",
        change_id: "addFoo",
      },
      title: "Add foo",
      kind: "change",
      lifecycle: "blocked",
      advisory_rank: 5,
      blockers: [
        {
          kind: "change",
          project_id: "bdf259aa162ae192af5b18899ccdc653b085528d",
          change_id: "addBar",
        },
      ],
    };
    expect(ResumeRowSchema.parse(row)).toEqual(row);
  });
});

describe("CrossEpicRedirectSchema", () => {
  test("parses a redirect", () => {
    const redirect = {
      source_epic_id: "epicA",
      target_epic_id: "epicB",
      blocker_node: {
        kind: "change",
        project_id: "bdf259aa162ae192af5b18899ccdc653b085528d",
        change_id: "addBar",
      },
      blocked_node: {
        kind: "epic_entry",
        epic_id: "epicA",
        entry_id: "shell1",
      },
    };
    expect(CrossEpicRedirectSchema.parse(redirect)).toEqual(redirect);
  });
});

describe("WorkGraphDiagnosticsSchema", () => {
  test("defaults cycles and unresolved_refs to empty arrays", () => {
    expect(WorkGraphDiagnosticsSchema.parse({})).toEqual({
      cycles: [],
      unresolved_refs: [],
    });
  });

  test("parses with entries", () => {
    const diag = {
      cycles: [
        [
          {
            kind: "change",
            project_id: "bdf259aa162ae192af5b18899ccdc653b085528d",
            change_id: "a",
          },
          {
            kind: "change",
            project_id: "bdf259aa162ae192af5b18899ccdc653b085528d",
            change_id: "b",
          },
          {
            kind: "change",
            project_id: "bdf259aa162ae192af5b18899ccdc653b085528d",
            change_id: "a",
          },
        ],
      ],
      unresolved_refs: [],
    };
    expect(WorkGraphDiagnosticsSchema.parse(diag)).toEqual(diag);
  });
});

describe("ResumeProjectionSchema", () => {
  test("round-trip parse on a minimal projection", () => {
    const projection = {
      generated_at: "2026-07-23T00:00:00.000Z",
      scope: {
        project_id: "bdf259aa162ae192af5b18899ccdc653b085528d",
      },
      ordered_next: null,
      actionable: [],
      blocked: [],
      active: [],
      redirects: [],
      diagnostics: {},
    };
    const parsed = ResumeProjectionSchema.parse(projection);
    expect(parsed.ordered_next).toBeNull();
    expect(parsed.diagnostics.cycles).toEqual([]);
    expect(parsed.diagnostics.unresolved_refs).toEqual([]);
  });

  test("scope may carry optional epic_ids", () => {
    const projection = {
      generated_at: "2026-07-23T00:00:00.000Z",
      scope: {
        project_id: "bdf259aa162ae192af5b18899ccdc653b085528d",
        epic_ids: ["epicA", "epicB"],
      },
      ordered_next: null,
      actionable: [],
      blocked: [],
      active: [],
      redirects: [],
      diagnostics: {},
    };
    expect(ResumeProjectionSchema.parse(projection).scope.epic_ids).toEqual([
      "epicA",
      "epicB",
    ]);
  });
});

describe("Error result schemas", () => {
  test("DependencyCycleError carries closed cycle path", () => {
    const err = {
      code: "DEPENDENCY_CYCLE" as const,
      cycle_path: [
        {
          kind: "change",
          project_id: "bdf259aa162ae192af5b18899ccdc653b085528d",
          change_id: "a",
        },
        {
          kind: "change",
          project_id: "bdf259aa162ae192af5b18899ccdc653b085528d",
          change_id: "b",
        },
        {
          kind: "change",
          project_id: "bdf259aa162ae192af5b18899ccdc653b085528d",
          change_id: "a",
        },
      ],
    };
    expect(DependencyCycleErrorSchema.parse(err)).toEqual(err);
  });

  test("UnresolvedDependencyError carries the bad ref", () => {
    const err = {
      code: "UNRESOLVED_DEPENDENCY" as const,
      ref: {
        kind: "change",
        project_id: "bdf259aa162ae192af5b18899ccdc653b085528d",
        change_id: "missing",
      },
    };
    expect(UnresolvedDependencyErrorSchema.parse(err)).toEqual(err);
  });

  test("InvalidWorkNodeRefError covers self_edge, duplicate_ref, malformed", () => {
    for (const reason of ["self_edge", "duplicate_ref", "malformed"] as const) {
      const err = { code: "INVALID_WORK_NODE_REF" as const, reason };
      expect(InvalidWorkNodeRefErrorSchema.parse(err).reason).toBe(reason);
    }
  });

  test("InvalidWorkNodeRefError optional ref field", () => {
    const err = {
      code: "INVALID_WORK_NODE_REF" as const,
      reason: "self_edge" as const,
      ref: {
        kind: "change",
        project_id: "bdf259aa162ae192af5b18899ccdc653b085528d",
        change_id: "a",
      },
    };
    expect(InvalidWorkNodeRefErrorSchema.parse(err).ref).toBeDefined();
  });

  test("ShellPrereqNonterminalError carries blocking refs", () => {
    const err = {
      code: "SHELL_PREREQ_NONTERMINAL" as const,
      blocking_refs: [
        {
          kind: "change",
          project_id: "bdf259aa162ae192af5b18899ccdc653b085528d",
          change_id: "addBar",
        },
      ],
    };
    expect(ShellPrereqNonterminalErrorSchema.parse(err)).toEqual(err);
  });

  test("DepPrereqNonterminalError carries blocking refs", () => {
    const err = {
      code: "DEP_PREREQ_NONTERMINAL" as const,
      blocking_refs: [
        {
          kind: "change",
          project_id: "bdf259aa162ae192af5b18899ccdc653b085528d",
          change_id: "addBar",
        },
      ],
    };
    expect(DepPrereqNonterminalErrorSchema.parse(err)).toEqual(err);
  });
});

describe("Additive edge fields — pre-change corpus backward-compat (AC1, SC5)", () => {
  test("EpicShellEntrySchema yields blocked_by: [] when field absent (default([]))", () => {
    const preChangeShell = {
      kind: "shell",
      entry_id: "shell-1",
      order: 0,
      title: "Future work",
      success_hint: "Do the thing",
    };
    const parsed = EpicShellEntrySchema.parse(preChangeShell);
    // default([]) fills in [] on parse of absent field (AC1 additive schema).
    expect(parsed.blocked_by).toEqual([]);
  });

  test("EpicShellEntrySchema parses blocked_by with edges", () => {
    const shell = {
      kind: "shell",
      entry_id: "shell-2",
      order: 1,
      title: "Dependent work",
      success_hint: "After the thing",
      blocked_by: [
        {
          kind: "epic_entry",
          epic_id: "epicA",
          entry_id: "shell-1",
        },
      ],
    };
    const parsed = EpicShellEntrySchema.parse(shell);
    expect(parsed.blocked_by).toHaveLength(1);
    expect(parsed.blocked_by[0]).toEqual({
      kind: "epic_entry",
      epic_id: "epicA",
      entry_id: "shell-1",
    });
  });

  test("ChangeSchema yields same_project_dependencies: [] when field absent (default([]))", () => {
    // Minimal pre-change Change shape — only the required fields needed to parse.
    // ChangeSchema is large; this test focuses on the new field's default behavior.
    const minimalChange = {
      id: "addFoo",
      title: "Add foo",
      summary: "add foo",
      status: "draft",
      lifecycleState: "open",
      created_at: "2026-07-23T00:00:00.000Z",
      gates: {},
      tasks: [],
      subagent_reports: [],
      deltas: {},
      wisdom: [],
      reentry_history: [],
    };
    const parsed = ChangeSchema.parse(minimalChange);
    // default([]) fills in [] on parse of absent field (AC1 additive schema).
    expect(parsed.same_project_dependencies).toEqual([]);
  });

  test("ChangeSchema parses same_project_dependencies with edges", () => {
    const change = {
      id: "addFoo",
      title: "Add foo",
      summary: "add foo",
      status: "draft",
      lifecycleState: "open",
      created_at: "2026-07-23T00:00:00.000Z",
      gates: {},
      tasks: [],
      subagent_reports: [],
      deltas: {},
      wisdom: [],
      reentry_history: [],
      same_project_dependencies: [
        {
          kind: "change",
          project_id: "bdf259aa162ae192af5b18899ccdc653b085528d",
          change_id: "addBar",
        },
      ],
    };
    const parsed = ChangeSchema.parse(change);
    expect(parsed.same_project_dependencies).toHaveLength(1);
  });
});
