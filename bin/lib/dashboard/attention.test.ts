import { describe, expect, test } from "bun:test";

import { buildAttentionLanes } from "./attention";

describe("dashboard latest-status lanes", () => {
  test("centers lanes on ADV changes and suppresses stale same-identity CI failures", () => {
    const lanes = buildAttentionLanes({
      github: { owner: "Sharper-Flow", repo: "PokeEdge" },
      changes: [
        change("staleFailure", "Fix stale CI", "active", "change/fixStaleCi"),
        change("currentFailure", "Fix current CI", "active", "change/fixCurrentCi"),
        change("runningCi", "Run current CI", "active", "change/runningCi"),
        change("draftNoSource", "Draft no source", "draft", "change/draftNoSource"),
      ],
      linked: [
        linkedRun("staleFailure", "CI", "change/fixStaleCi", "failure", "2026-06-25T10:00:00Z"),
        linkedRun("staleFailure", "CI", "change/fixStaleCi", "success", "2026-06-25T11:00:00Z"),
        linkedRun("currentFailure", "CI", "change/fixCurrentCi", "success", "2026-06-25T10:00:00Z"),
        linkedRun("currentFailure", "CI", "change/fixCurrentCi", "failure", "2026-06-25T11:00:00Z"),
        linkedRun("runningCi", "CI", "change/runningCi", "in_progress", "2026-06-25T12:00:00Z"),
      ],
      unlinked: [unlinkedRun("CI", "change/untracked", "failure", "2026-06-25T12:00:00Z")],
      degradedSources: [],
    });

    expect(Object.keys(lanes)).toEqual([
      "needs_attention",
      "running",
      "ready_landed",
      "backlog",
      "unmatched_source",
    ]);
    expect(lanes.needs_attention.map((item) => item.kind)).toEqual([
      "adv_change_status",
    ]);
    expect(lanes.needs_attention.map((item) => item.changeId)).toEqual([
      "currentFailure",
    ]);
    expect(lanes.running.map((item) => item.changeId)).toEqual(["runningCi"]);
    expect(lanes.ready_landed.map((item) => item.changeId)).toEqual([
      "staleFailure",
    ]);
    expect(lanes.backlog.map((item) => item.changeId)).toEqual([
      "draftNoSource",
    ]);
    expect(lanes.unmatched_source).toHaveLength(1);
    expect(lanes.ready_landed[0]).toMatchObject({
      kind: "adv_change_status",
      latest: {
        overall: "ready_landed",
        ci: { status: "success", title: "CI" },
      },
      sources: { workflow_runs: expect.arrayContaining([expect.objectContaining({ status: "failure" })]) },
    });
    expect(lanes.needs_attention[0]).toMatchObject({
      latest: {
        overall: "attention",
        ci: { status: "failure", title: "CI" },
      },
    });
  });

  test("does not suppress distinct workflow or branch failures", () => {
    const lanes = buildAttentionLanes({
      github: { owner: "Sharper-Flow", repo: "PokeEdge" },
      changes: [change("multi", "Multi workflow", "active", "change/multi")],
      linked: [
        linkedRun("multi", "CI", "change/multi", "success", "2026-06-25T11:00:00Z"),
        linkedRun("multi", "Deploy", "change/multi", "failure", "2026-06-25T10:00:00Z"),
      ],
      unlinked: [],
      degradedSources: [],
    });

    expect(lanes.needs_attention.map((item) => item.changeId)).toEqual(["multi"]);
    expect(lanes.needs_attention[0]).toMatchObject({
      latest: { overall: "attention", ci: { status: "failure", title: "Deploy" } },
    });
  });

  test("missing timestamp cannot suppress a valid failed run", () => {
    const lanes = buildAttentionLanes({
      github: { owner: "Sharper-Flow", repo: "PokeEdge" },
      changes: [change("missingTime", "Missing time", "active", "change/missingTime")],
      linked: [
        linkedRun("missingTime", "CI", "change/missingTime", "failure", "2026-06-25T10:00:00Z"),
        linkedRun("missingTime", "CI", "change/missingTime", "success", undefined),
      ],
      unlinked: [],
      degradedSources: [],
    });

    expect(lanes.needs_attention.map((item) => item.changeId)).toEqual(["missingTime"]);
  });

  test("latest deployment state can land a linked change", () => {
    const lanes = buildAttentionLanes({
      github: { owner: "Sharper-Flow", repo: "PokeEdge" },
      changes: [change("deploy", "Deploy change", "active", "change/deploy")],
      linked: [
        linkedDeployment("deploy", "production", "change/deploy", "failure", "2026-06-25T10:00:00Z"),
        linkedDeployment("deploy", "production", "change/deploy", "inactive", "2026-06-25T11:00:00Z"),
      ],
      unlinked: [],
      degradedSources: [],
    });

    expect(lanes.ready_landed.map((item) => item.changeId)).toEqual(["deploy"]);
    expect(lanes.ready_landed[0]).toMatchObject({
      latest: { deployment: { status: "inactive", title: "Deployment: production" } },
    });
  });

  test("unlinked source stays secondary with projected metadata", () => {
    const lanes = buildAttentionLanes({
      github: { owner: "Sharper-Flow", repo: "PokeEdge" },
      changes: [],
      linked: [],
      unlinked: [
        {
          kind: "pull",
          reason: "no structural match",
          status: "open",
          item: {
            number: 567,
            title: "Fan out image migration keys",
            html_url: "https://github.com/Sharper-Flow/PokeEdge/pull/567",
            head: { ref: "change/fanOutImageMigrationDuplicate" },
            updated_at: "2026-06-19T15:45:19Z",
          },
        },
      ],
      degradedSources: [],
    });

    expect(lanes.needs_attention).toEqual([]);
    expect(lanes.unmatched_source[0]).toMatchObject({
      kind: "pull",
      title: "#567 Fan out image migration keys",
      url: "https://github.com/Sharper-Flow/PokeEdge/pull/567",
      metadata: expect.arrayContaining([
        { label: "Repo", value: "Sharper-Flow/PokeEdge" },
        { label: "Branch", value: "change/fanOutImageMigrationDuplicate" },
      ]),
    });
  });

  test("degraded sources stay visible without making changes false green", () => {
    const lanes = buildAttentionLanes({
      github: { owner: "Sharper-Flow", repo: "PokeEdge" },
      changes: [change("draftNoSource", "Draft no source", "draft", "change/draftNoSource")],
      linked: [],
      unlinked: [],
      degradedSources: [
        {
          source: "github",
          code: "GITHUB_READ_FAILED",
          message: "GitHub read failed.",
        },
      ],
    });

    expect(lanes.needs_attention.map((item) => item.kind)).toEqual(["degraded_source"]);
    expect(lanes.ready_landed).toEqual([]);
    expect(lanes.backlog.map((item) => item.changeId)).toEqual(["draftNoSource"]);
  });

  test("sorts ADV cards inside a lane from most completed gate progress to least", () => {
    const lanes = buildAttentionLanes({
      github: { owner: "Sharper-Flow", repo: "PokeEdge" },
      changes: [
        change("early", "Early change", "draft", "change/early", {
          firstIncompleteGate: "design",
        }),
        change("complete", "Complete change", "draft", "change/complete", {
          firstIncompleteGate: null,
        }),
        change("late", "Late change", "draft", "change/late", {
          firstIncompleteGate: "acceptance",
        }),
      ],
      linked: [],
      unlinked: [],
      degradedSources: [],
    });

    expect(lanes.backlog.map((item) => item.changeId)).toEqual([
      "complete",
      "late",
      "early",
    ]);
  });

  test("uses deterministic recency/title/id tie-breaks for equal gate progress", () => {
    const lanes = buildAttentionLanes({
      github: { owner: "Sharper-Flow", repo: "PokeEdge" },
      changes: [
        change("oldTitleB", "Beta", "draft", "change/oldTitleB", {
          lastActivityAt: "2026-06-25T10:00:00.000Z",
        }),
        change("newTitleB", "Beta", "draft", "change/newTitleB", {
          lastActivityAt: "2026-06-25T11:00:00.000Z",
        }),
        change("newTitleA", "Alpha", "draft", "change/newTitleA", {
          lastActivityAt: "2026-06-25T11:00:00.000Z",
        }),
      ],
      linked: [],
      unlinked: [],
      degradedSources: [],
    });

    expect(lanes.backlog.map((item) => item.changeId)).toEqual([
      "newTitleA",
      "newTitleB",
      "oldTitleB",
    ]);
  });
});

function change(
  id: string,
  title: string,
  status: string,
  branch: string,
  overrides: Partial<{
    gateProgressStr: string;
    firstIncompleteGate: string | null;
    lastActivityAt: string;
  }> = {},
) {
  return {
    id,
    title,
    status,
    gateProgressStr:
      overrides.gateProgressStr ??
      "proposal ✓ discovery ✓ design ✓ planning ✓ execution ○ acceptance ○ release ○",
    firstIncompleteGate: Object.hasOwn(overrides, "firstIncompleteGate")
      ? overrides.firstIncompleteGate!
      : "execution",
    lastActivityAt: overrides.lastActivityAt ?? "2026-06-25T12:00:00.000Z",
    correlation_keys: { branches: [branch], head_shas: [] },
  };
}

function linkedRun(
  changeId: string,
  name: string,
  branch: string,
  status: string,
  updated_at: string | undefined,
) {
  return {
    kind: "workflow_run",
    changeId,
    status,
    evidence: `run.head_branch: ${branch}`,
    item: {
      workflow_id: name === "CI" ? 42 : 77,
      name,
      head_branch: branch,
      status,
      conclusion: status === "in_progress" ? undefined : status,
      html_url: `https://github.com/Sharper-Flow/PokeEdge/actions/runs/${changeId}-${name}`,
      updated_at,
    },
  };
}

function unlinkedRun(
  name: string,
  branch: string,
  status: string,
  updated_at: string,
) {
  return {
    kind: "workflow_run",
    reason: "no structural match",
    status,
    item: {
      workflow_id: 42,
      name,
      head_branch: branch,
      status,
      conclusion: status,
      updated_at,
    },
  };
}

function linkedDeployment(
  changeId: string,
  environment: string,
  ref: string,
  status: string,
  updated_at: string,
) {
  return {
    kind: "deployment",
    changeId,
    status,
    evidence: `deployment.ref: ${ref}`,
    item: {
      environment,
      ref,
      updated_at,
      source_states: { github_deployment: status },
    },
    source_states: { github_deployment: status },
  };
}
