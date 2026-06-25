import { describe, expect, test } from "vitest";
import {
  parseWarrantTag,
  resolveWarrants,
  WarrantMalformedError,
  type WarrantLookup,
} from "./warrant";

const lookup: WarrantLookup = {
  toolSurface: new Map([
    ["adv_change_status_repair", new Set(["changeId", "target_path"])],
    ["adv_change_archive", new Set(["changeId", "phase9", "worktreePath"])],
  ]),
  specIds: new Set(["rq-acWarrant01"]),
};

describe("parseWarrantTag", () => {
  test("returns empty refs and trimmed text when no tag present", () => {
    expect(parseWarrantTag("  Plain behavioral criterion.  ")).toEqual({
      text: "Plain behavioral criterion.",
      refs: [],
    });
  });

  test("extracts and strips a single tool#arg ref", () => {
    const parsed = parseWarrantTag(
      "Cross-project repair routes through target. [warrant: tool:adv_change_status_repair#target_path]",
    );
    expect(parsed.refs).toEqual(["tool:adv_change_status_repair#target_path"]);
    expect(parsed.text).toBe("Cross-project repair routes through target.");
    expect(parsed.text).not.toContain("[warrant:");
  });

  test("parses multiple comma-separated refs", () => {
    const parsed = parseWarrantTag(
      "Does X. [warrant: tool:adv_change_archive, spec:rq-acWarrant01]",
    );
    expect(parsed.refs).toEqual([
      "tool:adv_change_archive",
      "spec:rq-acWarrant01",
    ]);
  });

  test("throws on empty tag body", () => {
    expect(() => parseWarrantTag("Bad. [warrant: ]")).toThrow(
      WarrantMalformedError,
    );
  });

  test("throws on malformed ref shape", () => {
    expect(() => parseWarrantTag("Bad. [warrant: nonsense]")).toThrow(
      /WARRANT_MALFORMED/,
    );
  });
});

describe("resolveWarrants", () => {
  test("ok when tool#arg exists", () => {
    expect(
      resolveWarrants(["tool:adv_change_status_repair#target_path"], lookup),
    ).toEqual({ ok: true, unresolved: [] });
  });

  test("unresolved when tool arg is absent (the AC6 case)", () => {
    const result = resolveWarrants(
      ["tool:adv_change_archive#target_path"],
      lookup,
    );
    expect(result.ok).toBe(false);
    expect(result.unresolved).toEqual(["tool:adv_change_archive#target_path"]);
  });

  test("ok when tool exists (name only)", () => {
    expect(resolveWarrants(["tool:adv_change_archive"], lookup)).toEqual({
      ok: true,
      unresolved: [],
    });
  });

  test("unresolved when tool name absent", () => {
    expect(resolveWarrants(["tool:no_such_tool"], lookup).ok).toBe(false);
  });

  test("ok when spec id exists, unresolved when absent", () => {
    expect(resolveWarrants(["spec:rq-acWarrant01"], lookup).ok).toBe(true);
    expect(resolveWarrants(["spec:rq-missing"], lookup).ok).toBe(false);
  });
});
