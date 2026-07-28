import { describe, it, expect } from "vitest";
import { injectTier4InvokeRoutingNote } from "./generate-agent-manifests";

describe("injectTier4InvokeRoutingNote", () => {
  const TIER4_SUFFIX_FRAGMENT = "Tier-4 reads";

  it("relocates a note that is inside frontmatter to after the closing ---", () => {
    const input = [
      "---",
      "name: adv-tron",
      "tools:",
      "  adv_*: false",
      '  adv_change_show: true',
      "> **Invoke routing:** ADV tools referenced below but not in the manifest frontmatter above are Tier 3 (invoke-only). Dispatch them via `adv_tool_invoke({name, args})` — e.g., `adv_tool_invoke({name: \"adv_subagent_report_submit\", args: {report: ...}})`. Use `adv_tool_catalog` to discover all available tools and `adv_tool_describe` for schemas.",
      "---",
      "body text",
    ].join("\n");

    const result = injectTier4InvokeRoutingNote(input);
    const lines = result.split("\n");

    // Find frontmatter end
    let fmEnd = -1;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === "---") { fmEnd = i; break; }
    }
    expect(fmEnd).toBeGreaterThan(0);

    // The note must be after fmEnd
    let noteLineIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith("> **Invoke routing:**")) { noteLineIdx = i; break; }
    }
    expect(noteLineIdx).toBeGreaterThan(fmEnd);

    // No `>` line inside frontmatter anymore
    for (let i = 1; i < fmEnd; i++) {
      expect(lines[i].startsWith(">")).toBe(false);
    }
  });

  it("does not duplicate the note when run twice (idempotent)", () => {
    const input = [
      "---",
      "name: adv",
      "tools:",
      "  adv_spec: true",
      "---",
      "> **Invoke routing:** base text for schemas.",
      "body",
    ].join("\n");

    const once = injectTier4InvokeRoutingNote(input);
    const twice = injectTier4InvokeRoutingNote(once);

    const noteCount = (twice.match(/^> \*\*Invoke routing:\*\*/gm) || []).length;
    expect(noteCount).toBe(1);
  });

  it("appends the Tier-4 suffix to the base note", () => {
    const input = [
      "---",
      "name: adv",
      "---",
      "> **Invoke routing:** base text for schemas.",
      "body",
    ].join("\n");

    const result = injectTier4InvokeRoutingNote(input);
    expect(result).toContain(TIER4_SUFFIX_FRAGMENT);
  });

  it("updates the Tier-4 suffix when the constant changes (idempotent re-run)", () => {
    const input = [
      "---",
      "name: adv",
      "---",
      "> **Invoke routing:** base text for schemas. Tier-4 reads OLD SUFFIX that should be replaced;",
      "body",
    ].join("\n");

    const result = injectTier4InvokeRoutingNote(input);
    // Old suffix stripped, new suffix appended
    expect(result).not.toContain("OLD SUFFIX");
    expect(result).toContain(TIER4_SUFFIX_FRAGMENT);
  });

  it("does not alter frontmatter content when relocating the note", () => {
    const input = [
      "---",
      "name: adv-tron",
      "tools:",
      "  adv_*: false",
      "  adv_change_show: true",
      '  adv_tool_catalog: true',
      "> **Invoke routing:** base for schemas.",
      "---",
      "body",
    ].join("\n");

    const result = injectTier4InvokeRoutingNote(input);
    const lines = result.split("\n");

    // Frontmatter content (lines 1..fmEnd-1) should only have name/tools entries
    let fmEnd = -1;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === "---") { fmEnd = i; break; }
    }
    for (let i = 1; i < fmEnd; i++) {
      // Every frontmatter line should be a YAML key:value or comment, not a blockquote
      expect(lines[i].startsWith(">")).toBe(false);
    }

    // The grant entries should be unchanged
    expect(result).toContain("adv_change_show: true");
    expect(result).toContain("adv_tool_catalog: true");
  });

  it("is a no-op when there is no invoke-routing note", () => {
    const input = [
      "---",
      "name: plain",
      "tools:",
      "  bash: true",
      "---",
      "no note here",
    ].join("\n");

    const result = injectTier4InvokeRoutingNote(input);
    expect(result).toBe(input);
  });
});
