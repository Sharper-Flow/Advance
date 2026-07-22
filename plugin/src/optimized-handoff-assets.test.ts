import { describe, expect, test } from "vitest";
import { readFileSync } from "fs";
import { join, resolve } from "path";
import {
  getSubagentReportPacketAnchors,
  SUBAGENT_WARN_FIRST_PACKET_ANCHORS,
} from "./types";

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
  expect(content).toMatch(/"scanner_count":\s*\{selected_scanner_count\}/);
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
    expect(body).toContain("Architecture Judgement Contract");
    expect(body).toContain('"architecture_judgement"');
    expect(body).toContain('"validation"');
    expect(body).toContain('"status": "pass"');
    expect(body).toContain("validation.status");
    expect(body).toContain("Cite everything");
    expect(body).toContain("I don't know");
    expect(body).toContain("docs/API/examples");
    expectAnchors(
      body,
      getSubagentReportPacketAnchors("adv-researcher"),
      "adv-researcher prompt",
    );
    expectAnchors(
      body,
      [...SUBAGENT_WARN_FIRST_PACKET_ANCHORS],
      "adv-researcher prompt warn-first anchors",
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
    expectAnchors(
      body,
      [...SUBAGENT_WARN_FIRST_PACKET_ANCHORS],
      "adv-tron prompt warn-first anchors",
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
    expectAnchors(
      discover,
      [...SUBAGENT_WARN_FIRST_PACKET_ANCHORS],
      "adv-discover researcher packet warn-first anchors",
    );
    expectAnchors(
      design,
      [...SUBAGENT_WARN_FIRST_PACKET_ANCHORS],
      "adv-design researcher packet warn-first anchors",
    );
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
    expectAnchors(
      command,
      [...SUBAGENT_WARN_FIRST_PACKET_ANCHORS],
      "adv-tron command packet warn-first anchors",
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

  test("harden inspects report-created follow-ups with bounded campsite handling", () => {
    const harden = readFileSync(join(COMMAND_DIR, "adv-harden.md"), "utf8");

    expect(harden).toContain("Report-Created Follow-Up Audit");
    expect(harden).toContain("subagentReports");
    expect(harden).toMatch(
      /Safe \+ adjacent \+ campsite\/touched-scope applicable/,
    );
    expect(harden).toContain("record rationale");
    expect(harden).toContain(
      "Do not silently ignore report-created follow-ups",
    );
    expect(harden).toContain(
      "Do not require harden to fix non-adjacent or unrelated follow-ups",
    );
  });
});

describe("read-only lane packet-defect policy (lane-aware)", () => {
  // Read-only typed-worker lanes MUST complete their work and return findings
  // even when packet anchors are missing. They only skip adv_subagent_report_submit
  // (which requires identity fields). Mutating lanes (engineer/designer/reviewer)
  // keep refuse-to-begin for missing WORKING DIRECTORY — those tests live in
  // adv-engineer-assets.test.ts / adv-designer-assets.test.ts / adv-reviewer-asset.test.ts.
  const READ_ONLY_LANES = [
    "adv-researcher.md",
    "adv-tron.md",
    "adv-visual-review.md",
  ] as const;

  for (const file of READ_ONLY_LANES) {
    test(`${file}: missing anchors do not cause work-discard`, () => {
      const content = readFileSync(join(AGENT_DIR, file), "utf8");

      // Lane-aware clauses that MUST appear alongside the existing packet-defect
      // policy. Without these, a worker that hits a missing anchor will return
      // a packet-defect failure and discard completed work — the observed bug.
      expect(content).toContain("PACKET DEFECT");
      // Each lane uses its own task-type noun (research, reconnaissance, visual review, etc).
      // The invariant is "complete the <task> anyway" — work continues despite the defect.
      expect(content).toMatch(/complete the [a-z ]+ anyway/i);
      expect(content).toMatch(/never discard completed work/i);
      expect(content).toContain("adv_subagent_report_submit");

      // The worker must not pester the user for orchestrator-owned identity.
      expect(content).toMatch(/do not call `question`/i);
    });

    test(`${file}: packet-defect policy mentions skipping typed submission`, () => {
      const content = readFileSync(join(AGENT_DIR, file), "utf8");

      // The new policy explicitly directs the worker to skip the typed
      // submission call when anchors are missing (rather than submit a
      // malformed persisted report).
      expect(content).toMatch(
        /do not call `adv_subagent_report_submit`|do NOT call `adv_subagent_report_submit`/i,
      );
    });
  }
});

describe("main agent typed-worker contract scope", () => {
  // adv.md's typed-worker packet contract row MUST list every lane the
  // delegation-defaults spec covers — not just adv-engineer and adv-reviewer.
  // Under-scoping is what made the orchestrator think it could spawn
  // adv-researcher without packet anchors.
  test("adv.md typed-worker contract row lists all spec-covered lanes", () => {
    const content = readFileSync(join(AGENT_DIR, "adv.md"), "utf8");

    // The contract row must mention every typed-worker lane.
    for (const lane of [
      "adv-engineer",
      "adv-designer",
      "adv-reviewer",
      "adv-researcher",
      "adv-tron",
      "adv-visual-review",
    ]) {
      expect(
        content,
        `adv.md typed-worker contract must mention ${lane}`,
      ).toContain(lane);
    }
  });

  test("adv.md contract documents read-only lane completion requirement", () => {
    const content = readFileSync(join(AGENT_DIR, "adv.md"), "utf8");

    // The broadened contract must call out that read-only lanes still
    // complete the work and only skip typed submission.
    expect(content).toMatch(/read-only lane/i);
    expect(content).toMatch(
      /skip `adv_subagent_report_submit`|skip adv_subagent_report_submit/i,
    );
  });
});
