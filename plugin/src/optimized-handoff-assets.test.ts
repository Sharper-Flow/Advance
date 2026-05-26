import { describe, expect, test } from "vitest";
import { readFileSync } from "fs";
import { join, resolve } from "path";
import { getSubagentReportPacketAnchors } from "./types";

const REPO_ROOT = resolve(__dirname, "../..");
const AGENT_DIR = join(REPO_ROOT, ".opencode/agents");
const COMMAND_DIR = join(REPO_ROOT, ".opencode/command");

function readRepoFile(path: string): string {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}

function splitFrontmatter(content: string): {
  frontmatter: string;
  body: string;
} {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error("File does not have a YAML frontmatter block");
  return { frontmatter: match[1], body: match[2] };
}

function expectToolGrant(
  frontmatter: string,
  toolName: string,
  value: boolean,
) {
  const escaped = toolName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  expect(frontmatter).toMatch(
    new RegExp(`^\\s+${escaped}:\\s*${String(value)}\\s*$`, "m"),
  );
}

function expectAnchors(content: string, anchors: string[], label: string) {
  for (const anchor of anchors) {
    expect(content, `${label} missing ${anchor}`).toContain(`${anchor}:`);
  }
}

function expectScannerBundlePayloadSkeleton(
  content: string,
  phase: "review" | "harden",
  scannerCount: number,
) {
  expect(content).toContain('"schema_version": "1.0"');
  expect(content).toContain('"change_id": "{change-id}"');
  expect(content).toContain('"attempt": 1');
  expect(content).toContain('"workdir_used": "{workdir}"');
  expect(content).toContain(
    `"scope": { "kind": "change", "scope_key": "scanner-bundle:${phase}" }`,
  );
  expect(content).toContain('"agent": "adv-scanner-bundle"');
  expect(content).toContain(`"phase": "${phase}"`);
  expect(content).toContain(`"scanner_count": ${scannerCount}`);
  expect(content).toContain('"dimensions": [');
  expect(content).toContain('"findings": []');
  expect(content).toContain('"follow_ups": []');
}

describe("optimized handoff agent contracts", () => {
  test("adv-researcher can submit strict change-scoped RESEARCHER_REPORTs", () => {
    const { frontmatter, body } = splitFrontmatter(
      readFileSync(join(AGENT_DIR, "adv-researcher.md"), "utf8"),
    );

    expectToolGrant(frontmatter, "adv_subagent_report_submit", true);
    expect(body).toContain("RESEARCHER_REPORT");
    expect(body).toContain("adv_subagent_report_submit");
    expect(body).toContain('"agent": "adv-researcher"');
    expect(body).toContain('"scope_key"');
    expectAnchors(
      body,
      getSubagentReportPacketAnchors("adv-researcher"),
      "adv-researcher prompt",
    );
  });

  test("adv-tron can submit strict change-scoped TRON_REPORTs without broader ADV mutations", () => {
    const { frontmatter, body } = splitFrontmatter(
      readFileSync(join(AGENT_DIR, "adv-tron.md"), "utf8"),
    );

    expectToolGrant(frontmatter, "adv_subagent_report_submit", true);
    for (const forbidden of [
      "adv_change_create",
      "adv_task_add",
      "adv_gate_complete",
    ]) {
      expectToolGrant(frontmatter, forbidden, false);
    }
    expect(body).toContain("TRON_REPORT");
    expect(body).toContain("adv_subagent_report_submit");
    expect(body).toContain('"agent": "adv-tron"');
    expect(body).toContain('"scope_key"');
    expectAnchors(
      body,
      getSubagentReportPacketAnchors("adv-tron"),
      "adv-tron prompt",
    );
  });
});

describe("optimized handoff command packets", () => {
  test("researcher scout and validator packets include change-scoped report anchors", () => {
    const discover = readRepoFile(".opencode/command/adv-discover.md");
    const design = readRepoFile(".opencode/command/adv-design.md");
    const anchors = getSubagentReportPacketAnchors("adv-researcher");

    expectAnchors(discover, anchors, "adv-discover researcher packet");
    expectAnchors(design, anchors, "adv-design researcher packet");
    expect(discover).toContain("RESEARCHER_REPORT");
    expect(design).toContain("RESEARCHER_REPORT");
  });

  test("tron command packet includes change-scoped report anchors", () => {
    const command = readRepoFile(".opencode/command/adv-tron.md");

    expectAnchors(
      command,
      getSubagentReportPacketAnchors("adv-tron"),
      "adv-tron command packet",
    );
    expect(command).toContain("TRON_REPORT");
  });

  test("review and harden persist orchestrator-submitted scanner bundles only", () => {
    for (const path of ["adv-review.md", "adv-harden.md"]) {
      const command = readFileSync(join(COMMAND_DIR, path), "utf8");
      expect(command).toContain("SCANNER_BUNDLE_REPORT");
      expect(command).toContain('"agent": "adv-scanner-bundle"');
      expectScannerBundlePayloadSkeleton(
        command,
        path === "adv-review.md" ? "review" : "harden",
        path === "adv-review.md" ? 5 : 6,
      );
      expectAnchors(
        command,
        getSubagentReportPacketAnchors("adv-scanner-bundle"),
        path,
      );
      expect(command).toMatch(
        /do NOT ask scanners to call `adv_subagent_report_submit`/i,
      );
    }
  });

  test("harden inspects report-created agenda items with bounded campsite handling", () => {
    const harden = readFileSync(join(COMMAND_DIR, "adv-harden.md"), "utf8");

    expect(harden).toContain("Report-Created Agenda Audit");
    expect(harden).toContain("adv_agenda_list");
    expect(harden).toContain("subagent-followup");
    expect(harden).toContain("Source: {change-id}/");
    expect(harden).toMatch(
      /Safe \+ adjacent \+ campsite\/touched-scope applicable/,
    );
    expect(harden).toContain("record rationale");
    expect(harden).toContain(
      "Do not silently ignore report-created agenda items",
    );
    expect(harden).toContain(
      "Do not require harden to fix non-adjacent or unrelated agenda items",
    );
  });
});
