/**
 * Tests for guards/adv-state.ts — ADV-state path guard (AC4).
 *
 * Mirrors guards/conformance.test.ts shape so reviewers can confirm
 * the guard pattern is consistent across boundary controls.
 */

import { describe, expect, it } from "vitest";

import {
  enforceAdvStatePathPolicy,
  getAdvStateLockedPaths,
  type AdvStatePathContext,
} from "./adv-state";

const EXTERNAL_ROOT = "/home/jrede/.local/share/opencode/plugins/advance/abc123";

const lockedContext = (): AdvStatePathContext => ({
  lockedPaths: getAdvStateLockedPaths(EXTERNAL_ROOT),
});

describe("getAdvStateLockedPaths", () => {
  it("returns [externalRoot/changes, externalRoot/archive] for a normal root", () => {
    const paths = getAdvStateLockedPaths(EXTERNAL_ROOT);
    expect(paths).toEqual([
      `${EXTERNAL_ROOT}/changes`,
      `${EXTERNAL_ROOT}/archive`,
    ]);
  });

  it("returns [] when externalRoot is empty", () => {
    expect(getAdvStateLockedPaths("")).toEqual([]);
  });
});

describe("enforceAdvStatePathPolicy", () => {
  describe("non-gated tools", () => {
    it("does not throw for bash (gated separately by enforceBashPolicy)", () => {
      expect(() =>
        enforceAdvStatePathPolicy(
          "bash",
          { command: `cat ${EXTERNAL_ROOT}/changes/foo/change.json` },
          lockedContext(),
        ),
      ).not.toThrow();
    });

    it("does not throw for edit", () => {
      expect(() =>
        enforceAdvStatePathPolicy(
          "edit",
          { filePath: `${EXTERNAL_ROOT}/changes/foo/change.json` },
          lockedContext(),
        ),
      ).not.toThrow();
    });

    it("does not throw for write", () => {
      expect(() =>
        enforceAdvStatePathPolicy(
          "write",
          { filePath: `${EXTERNAL_ROOT}/changes/foo/change.json` },
          lockedContext(),
        ),
      ).not.toThrow();
    });

    it("does not throw for adv_change_show", () => {
      expect(() =>
        enforceAdvStatePathPolicy(
          "adv_change_show",
          { changeId: "foo" },
          lockedContext(),
        ),
      ).not.toThrow();
    });
  });

  describe("gated tools — blocked paths", () => {
    it("blocks read against /changes/<id>/change.json", () => {
      expect(() =>
        enforceAdvStatePathPolicy(
          "read",
          { filePath: `${EXTERNAL_ROOT}/changes/foo/change.json` },
          lockedContext(),
        ),
      ).toThrow(/inside the ADV state directory/);
    });

    it("blocks read against /archive/<id>/proposal.md", () => {
      expect(() =>
        enforceAdvStatePathPolicy(
          "read",
          { filePath: `${EXTERNAL_ROOT}/archive/old/proposal.md` },
          lockedContext(),
        ),
      ).toThrow(/inside the ADV state directory/);
    });

    it("blocks read against the locked /changes directory itself", () => {
      expect(() =>
        enforceAdvStatePathPolicy(
          "read",
          { filePath: `${EXTERNAL_ROOT}/changes` },
          lockedContext(),
        ),
      ).toThrow(/inside the ADV state directory/);
    });

    it("blocks glob against /changes path arg", () => {
      expect(() =>
        enforceAdvStatePathPolicy(
          "glob",
          { path: `${EXTERNAL_ROOT}/changes/foo` },
          lockedContext(),
        ),
      ).toThrow(/inside the ADV state directory/);
    });

    it("blocks grep against /changes path arg", () => {
      expect(() =>
        enforceAdvStatePathPolicy(
          "grep",
          { path: `${EXTERNAL_ROOT}/changes/foo` },
          lockedContext(),
        ),
      ).toThrow(/inside the ADV state directory/);
    });

    it.each([
      "lgrep_search_semantic",
      "lgrep_search_symbols",
      "lgrep_search_text",
      "lgrep_get_file_outline",
      "lgrep_get_file_tree",
      "lgrep_get_repo_outline",
      "lgrep_get_symbol",
      "lgrep_get_symbols",
      "lgrep_index_semantic",
      "lgrep_index_symbols_folder",
    ])("blocks %s tool against /changes path", (tool) => {
      expect(() =>
        enforceAdvStatePathPolicy(
          tool,
          { path: `${EXTERNAL_ROOT}/changes/foo` },
          lockedContext(),
        ),
      ).toThrow(/inside the ADV state directory/);
    });

    it("blocks lgrep tool when args use repo_root instead of path", () => {
      expect(() =>
        enforceAdvStatePathPolicy(
          "lgrep_search_symbols",
          { query: "foo", repo_root: `${EXTERNAL_ROOT}/changes/x` },
          lockedContext(),
        ),
      ).toThrow(/inside the ADV state directory/);
    });

    it("error message points at ADV MCP tools as the alternative", () => {
      try {
        enforceAdvStatePathPolicy(
          "read",
          { filePath: `${EXTERNAL_ROOT}/changes/foo/change.json` },
          lockedContext(),
        );
        throw new Error("expected throw");
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
        expect((e as Error).message).toMatch(/adv_change_show/);
        expect((e as Error).message).toMatch(/adv_task_list/);
      }
    });
  });

  describe("gated tools — allowed paths", () => {
    it("allows read against in-repo .adv/specs (specs are git-tracked)", () => {
      expect(() =>
        enforceAdvStatePathPolicy(
          "read",
          { filePath: "/home/user/repo/.adv/specs/advance-workflow/spec.json" },
          lockedContext(),
        ),
      ).not.toThrow();
    });

    it("allows read against unrelated paths", () => {
      expect(() =>
        enforceAdvStatePathPolicy(
          "read",
          { filePath: "/home/user/repo/plugin/src/index.ts" },
          lockedContext(),
        ),
      ).not.toThrow();
    });

    it("allows read against external root sibling files (not under /changes or /archive)", () => {
      expect(() =>
        enforceAdvStatePathPolicy(
          "read",
          { filePath: `${EXTERNAL_ROOT}/wisdom.jsonl` },
          lockedContext(),
        ),
      ).not.toThrow();
    });
  });

  describe("empty lockedPaths", () => {
    it("does not throw when lockedPaths is empty (e.g. before externalRoot is resolved)", () => {
      expect(() =>
        enforceAdvStatePathPolicy(
          "read",
          { filePath: `${EXTERNAL_ROOT}/changes/foo/change.json` },
          { lockedPaths: [] },
        ),
      ).not.toThrow();
    });
  });

  describe("edge cases", () => {
    it("does not throw when args contain no path keys", () => {
      expect(() =>
        enforceAdvStatePathPolicy(
          "read",
          { changeId: "foo" } as Record<string, unknown>,
          lockedContext(),
        ),
      ).not.toThrow();
    });

    it("does not throw when path arg is empty string", () => {
      expect(() =>
        enforceAdvStatePathPolicy(
          "read",
          { filePath: "" },
          lockedContext(),
        ),
      ).not.toThrow();
    });

    it("does not throw when path arg is non-string", () => {
      expect(() =>
        enforceAdvStatePathPolicy(
          "read",
          { filePath: 42 } as unknown as Record<string, unknown>,
          lockedContext(),
        ),
      ).not.toThrow();
    });
  });
});
