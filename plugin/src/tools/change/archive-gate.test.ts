/**
 * Tests for archive-gate helpers that sit between the archive tool and the
 * git-finalize reachability engine. These tests exercise the helpers with
 * injected runGit/runGh so they fail against the current implementation for
 * issue #202 (Phase-9 PR metadata loss / branch auto-delete).
 */

import { describe, expect, it } from "vitest";
import {
  buildPendingMergePhase9Status,
  verifyReleaseEvidenceFromMain,
} from "./archive-gate";
import type { Change, Store } from "../../types";
import type { GitFinalizeDeps } from "../archive-helpers/git-finalize";

function createStore(mainCheckout: string): Store {
  return {
    paths: {
      root: mainCheckout,
      changes: "/tmp/.adv/changes",
      archive: "/tmp/.adv/archive",
    },
    config: { name: "test", features: {} },
  } as unknown as Store;
}

function createChange(options: {
  phase9_status?: Change["phase9_status"];
}): Change {
  return {
    id: "fixPhase9PrDetection",
    title: "Fix Phase 9 PR detection",
    status: "active",
    created_at: "2026-01-01T00:00:00Z",
    created_by: "test",
    tasks: [],
    deltas: {},
    wisdom: [],
    phase9_status: options.phase9_status,
  } as Change;
}

describe("verifyReleaseEvidenceFromMain", () => {
  // rq-fixPhase9PrDetection AC2: PR archive mode + deleted branch + no
  // prNumber must discover the merged PR and return shipped.
  it("returns shipped when PR mode has no prNumber but a merged PR is discoverable", () => {
    const mainCheckout = "/repo";
    const change = createChange({
      phase9_status: {
        status: "pending",
        startedAt: "2026-01-01T00:00:00Z",
      },
    });
    const runGit: GitFinalizeDeps["runGit"] = (_cwd, args) => {
      if (args[0] === "fetch") return { status: 0, stdout: "", stderr: "" };
      if (args[0] === "symbolic-ref" && args[1] === "--short")
        return { status: 0, stdout: "origin/trunk\n", stderr: "" };
      if (args[0] === "config")
        return { status: 1, stdout: "", stderr: "not set" };
      if (args[0] === "rev-parse" && args[1] === "refs/heads/main")
        return { status: 1, stdout: "", stderr: "unknown" };
      if (args[0] === "rev-parse" && args[1] === "refs/heads/trunk")
        return { status: 0, stdout: "local-trunk-sha\n", stderr: "" };
      if (args[0] === "rev-parse" && args[1] === "origin/trunk")
        return { status: 0, stdout: "origin-trunk-sha\n", stderr: "" };
      if (args[0] === "rev-parse" && args[1] === "HEAD")
        return { status: 0, stdout: "origin-trunk-sha\n", stderr: "" };
      if (args[0] === "ls-remote")
        return {
          status: 0,
          stdout: "origin-trunk-sha\trefs/heads/trunk\n",
          stderr: "",
        };
      if (
        args[0] === "log" &&
        args[2] === "origin/trunk..change/fixPhase9PrDetection"
      )
        return { status: 128, stdout: "", stderr: "unknown revision" };
      if (args[0] === "rev-parse" && args[1] === "change/fixPhase9PrDetection")
        return { status: 128, stdout: "", stderr: "unknown revision" };
      return {
        status: 1,
        stdout: "",
        stderr: `unexpected git ${args.join(" ")}`,
      };
    };
    const runGh: GitFinalizeDeps["runGh"] = (_cwd, args) => {
      if (args[0] === "pr" && args[1] === "list") {
        return {
          status: 0,
          stdout: JSON.stringify([
            { number: 202, state: "MERGED", mergeCommit: { oid: "merge-202" } },
          ]),
          stderr: "",
        };
      }
      if (args[0] === "pr" && args[1] === "view") {
        return {
          status: 0,
          stdout: JSON.stringify({
            state: "MERGED",
            mergedAt: "2026-06-07T00:00:00Z",
            mergeCommit: { oid: "merge-202" },
            autoMergeRequest: null,
          }),
          stderr: "",
        };
      }
      return {
        status: 1,
        stdout: "",
        stderr: `unexpected gh ${args.join(" ")}`,
      };
    };

    const result = verifyReleaseEvidenceFromMain({
      store: createStore(mainCheckout),
      changeId: "fixPhase9PrDetection",
      archiveMode: "pr",
      change,
      deps: { runGit, runGh },
    });

    expect(result.status).toBe("shipped");
    expect(result.route).toBe("pr_auto_merge");
    expect(result.mergeCommitSha).toBe("merge-202");
    expect(result.prNumber).toBe(202);
  });
});

describe("buildPendingMergePhase9Status", () => {
  // rq-fixPhase9PrDetection AC4: durable fields must survive the transition
  // from pending to pending_merge. Currently changeTipSha is dropped.
  it("preserves previous changeTipSha", () => {
    const result = buildPendingMergePhase9Status({
      finalization: {
        status: "pending_merge",
        mainCheckout: "/repo",
        defaultBranch: "trunk",
        pushStatus: "pushed",
        route: "pr_auto_merge",
        prNumber: 202,
        prUrl: "https://github.com/Sharper-Flow/Advance/pull/202",
        autoMergeArmed: true,
      },
      startedAt: "2026-01-01T00:00:00Z",
      previousChangeTipSha: "tip-202-abc",
    });

    expect(result.changeTipSha).toBe("tip-202-abc");
  });
});
