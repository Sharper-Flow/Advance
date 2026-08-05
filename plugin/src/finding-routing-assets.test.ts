/**
 * finding-routing asset tests — D1/D2/D5 durable middle-tier routing claims.
 *
 * Each command file that surfaces or handles mid-lifecycle findings must name
 * `adv_backlog_add` as the durable middle-tier sink (not reflexive change
 * creation, not prose-only notes) and `adv_backlog_promote` as the bridge back
 * to a tracked change. These are drift guards (AC5): they fail if the claim
 * text is removed or contradicted. Refactors that rephrase a claim must update
 * the claim and this test in one commit (test-or-cut, DDC5).
 */

import { describe, expect, test } from "vitest";
import { readFileSync } from "fs";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");

const ROUTING_CLAIM =
  "Out-of-scope findings surfaced mid-lifecycle MUST be routed to the durable backlog with `adv_backlog_add`";
const BRIDGE_CLAIM = "`adv_backlog_promote` is the bridge back to a tracked change";

function readCommand(name: string): string {
  return readFileSync(join(REPO_ROOT, `.opencode/command/${name}`), "utf8");
}

describe("finding routing — apply/review/harden command claims (D1, AC5)", () => {
  const apply = readCommand("adv-apply.md");
  const review = readCommand("adv-review.md");
  const harden = readCommand("adv-harden.md");

  test("adv-apply routes out-of-scope findings to adv_backlog_add", () => {
    expect(apply).toContain(ROUTING_CLAIM);
    expect(apply).toContain(BRIDGE_CLAIM);
  });

  test("adv-review routes out-of-scope findings to adv_backlog_add", () => {
    expect(review).toContain(ROUTING_CLAIM);
    expect(review).toContain(BRIDGE_CLAIM);
  });

  test("adv-harden routes out-of-scope findings to adv_backlog_add", () => {
    expect(harden).toContain(ROUTING_CLAIM);
    expect(harden).toContain(BRIDGE_CLAIM);
  });

  test("routing claims forbid the two named anti-routes", () => {
    for (const command of [apply, review, harden]) {
      expect(command).toMatch(
        /not reflexive change creation, not prose-only notes/,
      );
    }
  });
});

describe("finding routing — prep Won't path and design risk framing (D2/D5, AC1/AC2/AC5)", () => {
  const prep = readCommand("adv-prep.md");
  const design = readCommand("adv-design.md");

  test("adv-prep MoSCoW Won't path routes findings to adv_backlog_add (AC1)", () => {
    expect(prep).toContain("Won't items are findings too");
    expect(prep).toContain("durable middle-tier option");
    expect(prep).toContain("`adv_backlog_add`");
    expect(prep).toContain("`adv_backlog_promote`");
  });

  test("adv-design risk table requires durable-record framing (AC2)", () => {
    expect(design).toContain("an unrecorded risk is a dropped finding");
    expect(design).toContain("never as `no change owns it`");
    expect(design).toContain("`adv_backlog_add`");
  });
});
