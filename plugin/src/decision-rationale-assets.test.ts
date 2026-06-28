import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const COMMANDS_DIR = join(REPO_ROOT, ".opencode", "command");
const ADV_AGENT = join(REPO_ROOT, ".opencode", "agents", "adv.md");
const VOICE_STANDARD = join(REPO_ROOT, "docs", "command-voice-standard.md");
const WORKFLOW_SPEC = join(
  REPO_ROOT,
  ".adv",
  "specs",
  "advance-workflow",
  "spec.json",
);

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function readWorkflowSpec(): any {
  return JSON.parse(read(WORKFLOW_SPEC));
}

function listAdvCommandDocs(): string[] {
  return readdirSync(COMMANDS_DIR)
    .filter((file) => file.startsWith("adv-") && file.endsWith(".md"))
    .map((file) => join(COMMANDS_DIR, file))
    .sort();
}

describe("decision rationale output contract assets", () => {
  test("advance-workflow declares decision-rationale requirements", () => {
    const spec = readWorkflowSpec();
    const requirementIds = spec.requirements.map(
      (requirement: any) => requirement.id,
    );

    expect(requirementIds).toEqual(
      expect.arrayContaining([
        "rq-decisionRationale01",
        "rq-decisionRationale02",
        "rq-decisionRationale03",
        "rq-decisionRationale04",
      ]),
    );
  });

  test("decision-rationale requirements preserve handoff spine and default routine", () => {
    const spec = readWorkflowSpec();
    const requirements = new Map(
      spec.requirements.map((requirement: any) => [
        requirement.id,
        requirement.body,
      ]),
    );

    expect(requirements.get("rq-decisionRationale01")).toMatch(
      /inside `## Chosen direction`/,
    );
    expect(requirements.get("rq-decisionRationale01")).toMatch(
      /not a fourth spine heading/,
    );
    expect(requirements.get("rq-decisionRationale02")).toMatch(
      /Routine decisions MUST NOT emit/i,
    );
    expect(requirements.get("rq-decisionRationale03")).toMatch(
      /default(?:s)? to `routine`/,
    );
    expect(requirements.get("rq-decisionRationale04")).toMatch(
      /date.*metric.*event.*state/s,
    );
  });

  test("voice standard defines nested rationale syntax without adding a heading", () => {
    const voice = read(VOICE_STANDARD);

    expect(voice).toMatch(/### Decision rationale \(major decisions only\)/);
    expect(voice).toMatch(/inside `## Chosen direction`/);
    expect(voice).toMatch(/\[source: spec:rq-handoffVoice01\]/);
    expect(voice).toMatch(/trigger_kind: date\|metric\|event\|state/);
    expect(voice).toMatch(/not a fourth spine heading/);
  });

  test("ADV output contract points major decisions to the voice standard", () => {
    const adv = read(ADV_AGENT);

    expect(adv).toMatch(/Decision rationale \(major decisions only\)/);
    expect(adv).toMatch(/docs\/command-voice-standard\.md/);
    expect(adv).toMatch(/inside `## Chosen direction`/);
  });

  test("command handoff templates do not introduce top-level Decision rationale headings", () => {
    const offenders = listAdvCommandDocs().flatMap((path) => {
      const content = read(path);
      return content.match(/^## Decision rationale$/m)
        ? [path.replace(`${REPO_ROOT}/`, "")]
        : [];
    });

    expect(offenders).toEqual([]);
  });
});
