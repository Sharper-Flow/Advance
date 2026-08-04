import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { PHASE_DIRECTIVES } from "./utils/phase-directive-content";

const REPO_ROOT = resolve(__dirname, "../..");
const LAUNCHER_PATH = join(REPO_ROOT, ".opencode/command/adv-review.md");
const FALLBACK_BEGIN = "<!-- FALLBACK BEGIN -->";
const FALLBACK_END = "<!-- FALLBACK END -->";

function launcherContent(): string {
  return readFileSync(LAUNCHER_PATH, "utf8");
}

function fallbackContent(content: string): string {
  const begin = content.indexOf(FALLBACK_BEGIN);
  const end = content.indexOf(FALLBACK_END);

  expect(begin).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(begin);

  return content.slice(begin + FALLBACK_BEGIN.length, end);
}

function withoutFallback(content: string): string {
  const begin = content.indexOf(FALLBACK_BEGIN);
  const end = content.indexOf(FALLBACK_END);

  expect(begin).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(begin);

  return `${content.slice(0, begin)}${content.slice(end + FALLBACK_END.length)}`;
}

describe("adv-review phase-directive launcher", () => {
  test("inline fallback is a strict verbatim subset of the directive", () => {
    const fallback = fallbackContent(launcherContent());
    const directiveLines = new Set(
      PHASE_DIRECTIVES["adv-review"].content.split(/\r?\n/),
    );
    const fallbackLines = fallback
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter((line) => line.trim() !== "" && !line.trim().startsWith("<!--"));

    expect(fallbackLines.length).toBeGreaterThan(0);
    expect(fallbackLines.length).toBeLessThan(directiveLines.size);

    const drift = fallbackLines.filter((line) => !directiveLines.has(line));
    expect(drift).toEqual([]);
  });

  test("directive-only methodology markers stay out of the launcher", () => {
    const remaining = withoutFallback(launcherContent());
    const directiveOnlyMarkers = [
      "Pre-Acceptance Contract Preflight",
      "### Review Methodology",
      "| 12 | Consistency |",
      "Review Scanner Context Packet",
      "Review Reviewer Remediation Packet",
      "Review Engineer Remediation Packet",
      "contract.reviewMatrix",
      "Approval Consequence Context",
      "adv_contract_review_matrix_set",
      "No-late-homework rule",
      "## 12-Dimension Review Framework",
      "| 9 | Security |",
    ];

    for (const marker of directiveOnlyMarkers) {
      expect(remaining).not.toContain(marker);
    }
  });

  test("launcher preserves directive read and acceptance protocol anchors", () => {
    const launcher = launcherContent();

    expect(launcher).toContain("include: { phasePlan: true }");
    expect(launcher).toContain("_phasePlan.directive");
    expect(launcher).toMatch(/2 retries|3 attempts/);
    expect(launcher).toMatch(/HALT|halt/);
    expect(launcher).toContain("no gate progress");
    expect(launcher).toMatch(/version skew|directive.*ABSENT|fallback/i);
    expect(launcher).toContain("Reply `accept`");
  });
});
