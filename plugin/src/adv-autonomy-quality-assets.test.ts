// NON-BEHAVIORAL (asset presence only): these tests read `.opencode/*.md` and
// `ADV_INSTRUCTIONS.md` and assert keyword presence/absence. They prove the
// prompt text exists — NOT that enforcement works. The design-quality behavioral
// guarantees are covered by gate-readiness.test.ts (checkUnresolvedDesignConcerns),
// subagent-report.test.ts (consumeDesignerDesignConcerns), and
// design-concern.test.ts (adv_design_concern_disposition). See AC11 / DONT8.
import { describe, expect, test } from "vitest";
import { readFileSync } from "fs";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");
const COMMAND_DIR = join(REPO_ROOT, ".opencode/command");
const AGENT_DIR = join(REPO_ROOT, ".opencode/agents");
const INSTRUCTIONS = join(REPO_ROOT, "ADV_INSTRUCTIONS.md");

function readAsset(path: string): string {
  return readFileSync(path, "utf8");
}

// =============================================================================
// 1. Human Checkpoint & Auto-Continue Policy
// =============================================================================

describe("Human checkpoint and auto-continue policy", () => {
  // Heuristic-drift heading assertions removed per T1.5 audit
  // (`adv-autonomy-quality-assets.test.ts` H-class). Canonical-list V
  // assertions retained below.

  test("ADV_INSTRUCTIONS.md lists required human checkpoints", () => {
    const content = readAsset(INSTRUCTIONS);
    expect(content).toMatch(/Proposal confirmation/);
    expect(content).toMatch(/Agreement sign-off/);
    expect(content).toMatch(/Design approval/);
    expect(content).toMatch(/Acceptance/);
    expect(content).toMatch(/Archive sign-off/);
    expect(content).toMatch(/Cancellation approval/);
    expect(content).toMatch(/Doom-loop recovery/);
  });

  test("ADV_INSTRUCTIONS.md preserves auto-continue anti-pattern", () => {
    const content = readAsset(INSTRUCTIONS);
    expect(content).toMatch(/No "shall I proceed\?"/);
  });

  test("adv.md orchestrator names checkpoint canonical list", () => {
    const content = readAsset(join(AGENT_DIR, "adv.md"));
    expect(content).toMatch(/Proposal confirmation/);
    expect(content).toMatch(/Agreement sign-off/);
    expect(content).toMatch(/Cancellation approval/);
    expect(content).toMatch(/Doom-loop recovery/);
    expect(content).toMatch(/Post-approval auto-continue/);
  });

  test("explicit merge authority immediately arms same-change squash auto-merge", () => {
    const agent = readAsset(join(AGENT_DIR, "adv.md"));
    const ciWaiter = readAsset(join(AGENT_DIR, "adv-ci-waiter.md"));
    const spec = JSON.parse(
      readAsset(join(REPO_ROOT, ".adv/specs/advance-workflow/spec.json")),
    ) as {
      requirements: Array<{
        id: string;
        body: string;
        scenarios: Array<{ id: string; then: string[] }>;
      }>;
    };
    const requirement = spec.requirements.find(
      (entry) => entry.id === "rq-approvedPrAutoMerge01",
    );
    const remediationScenario = requirement?.scenarios.find(
      (scenario) => scenario.id === "rq-approvedPrAutoMerge01.2",
    );
    expect(requirement).toBeDefined();

    expect(agent).toMatch(/PR Merge Authority/);
    expect(agent).toMatch(/explicit user grant to merge/i);
    expect(agent).toMatch(/current active (ADV )?orchestration session/i);
    expect(agent).toMatch(/session restart[^.\n]*new explicit merge grant/i);
    expect(agent).toMatch(/push-only[^.\n]*does not authorize merge/i);
    expect(agent).toMatch(
      /generic Tier-A approval[^.\n]*does not authorize merge/i,
    );
    expect(agent).toMatch(
      /changeId[^.\n]*repository[^.\n]*change\/<changeId>[^.\n]*default base[^.\n]*requested end-state/i,
    );
    expect(agent).toContain(
      "gh pr merge <number> --repo <owner/repo> --squash --auto",
    );
    expect(agent).toMatch(/autoMergeRequest\.enabledAt/);
    expect(agent).toMatch(/^\s*task:\s*true\s*$/m);
    expect(ciWaiter).toMatch(/^\s*mode:\s*subagent\s*$/m);
    expect(agent).toMatch(
      /fix in worktree[^\n]*push change branch[^\n]*re-read PR number\/repository\/head\/base\/state[^\n]*arm or re-arm[^\n]*verify[^\n]*spawn `adv-ci-waiter`/i,
    );
    expect(agent).toMatch(/state == `MERGED`|state == MERGED/);
    expect(agent).toMatch(/revocation[^.\n]*stop\/cancel[^.\n]*drift/i);
    expect(agent).toMatch(/Tier-B archive sign-off[^.\n]*unchanged/i);
    expect(agent).toMatch(/never[^.\n]*(--delete-branch|-d)/i);

    expect(requirement?.body).toMatch(/requested end-state/i);
    expect(requirement?.body).toMatch(/active orchestration session/i);
    expect(requirement?.body).toMatch(/session restart/i);
    expect(requirement?.body).not.toMatch(/restart-persistent authorization/i);
    expect(requirement?.body).toMatch(/autoMergeRequest\.enabledAt/);
    expect(requirement?.body).toMatch(/--delete-branch.*-d/);
    expect(requirement?.scenarios).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "rq-approvedPrAutoMerge01.1" }),
        expect.objectContaining({ id: "rq-approvedPrAutoMerge01.2" }),
        expect.objectContaining({ id: "rq-approvedPrAutoMerge01.3" }),
      ]),
    );
    expect(remediationScenario?.then).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/repository, head, base, and state/i),
        expect.stringMatching(/autoMergeRequest\.enabledAt/),
      ]),
    );
  });
});

// =============================================================================
// 2. Validated In-Scope Remediation Policy
// =============================================================================

describe("Validated in-scope remediation policy", () => {
  // Heuristic-drift heading and topic-presence assertions removed per
  // T1.5 audit. Anti-pattern × assertions and canonical-policy V
  // assertions retained.

  test("ADV_INSTRUCTIONS.md preserves remediation anti-patterns", () => {
    const content = readAsset(INSTRUCTIONS);
    expect(content).toMatch(/No report-only/);
    expect(content).toMatch(/future-work/);
  });

  test("adv-harden.md forbids Report only / accepted-debt anti-patterns", () => {
    const content = readAsset(join(COMMAND_DIR, "adv-harden.md"));
    expect(content).not.toMatch(/Report only/);
    expect(content).not.toMatch(/documented as accepted debt/i);
    expect(content).not.toMatch(/accepted debt:/i);
    expect(content).not.toMatch(/fix or document as accepted debt/i);
    expect(content).toMatch(
      /No report-only, future-work, or accepted-debt path/i,
    );
    expect(content).toMatch(/fix all validated in-scope findings/i);
  });

  test("adv-review.md forbids future-work deferral and accepted_debt", () => {
    const content = readAsset(join(COMMAND_DIR, "adv-review.md"));
    expect(content).toMatch(/no future-work deferral/i);
    expect(content).not.toMatch(/accepted_debt/);
    expect(content).not.toMatch(/accepted-debt/i);
    expect(content).not.toMatch(/accepted debt/i);
    expect(content).toMatch(/rejected_with_evidence/);
  });

  test("adv-reviewer.md avoids accepted-debt disposition vocabulary", () => {
    const content = readAsset(join(AGENT_DIR, "adv-reviewer.md"));
    expect(content).not.toMatch(/accepted-debt/i);
    expect(content).not.toMatch(/accepted debt/i);
    expect(content).toMatch(/rejected_with_evidence/);
  });
});

// =============================================================================
// 3. Touched-Scope Quality Ownership
// =============================================================================

describe("Touched-scope quality ownership", () => {
  // Heuristic-drift heading exact-match assertions removed per T1.5 audit.
  // Canonical-list V phrases (3 scope categories) and anti-pattern × phrases
  // for ralph-loop restoration retained.

  test("ADV_INSTRUCTIONS.md preserves 3 touched-scope categories", () => {
    const content = readAsset(INSTRUCTIONS);
    expect(content).toMatch(/Directly touched implementation files/);
    expect(content).toMatch(/Adjacent tests and docs/);
    expect(content).toMatch(/Same-pattern local subsystem issues/);
    expect(content).toMatch(/Do NOT expand into implicit repo-wide refactors/);
  });

  test("adv-prep.md preserves touched-scope categories", () => {
    const content = readAsset(join(COMMAND_DIR, "adv-prep.md"));
    expect(content).toMatch(/Adjacent tests and docs/);
    expect(content).toMatch(/Same-pattern local subsystem issues/);
  });

  test("adv-apply.md ralph-loop restoration anti-patterns + MUST-continue (rq-autonomy01.4)", () => {
    const content = readAsset(join(COMMAND_DIR, "adv-apply.md"));
    expect(content).not.toMatch(/Shall I continue/i);
    expect(content).not.toMatch(/Task \d+ of \d+ complete[^\n]*continue/i);
    expect(content).toMatch(/MUST continue|MUST NOT pause/);
  });
});

// =============================================================================
// 4. Design Validation Policy
// =============================================================================

describe("Design validation policy", () => {
  test("adv-design.md contains a validation phase referencing adv-researcher with capability framing", () => {
    const content = readAsset(join(COMMAND_DIR, "adv-design.md"));
    expect(content).toMatch(/adv-researcher/i);
    expect(content).toMatch(/[Vv]alid/);
    // Capability-based framing: references independent validator capability, not just name
    expect(content).toMatch(/independent.*valid|valid.*independent/i);
  });

  test("adv-design.md contains verdict handling for VALIDATED, CAUTION, CONFLICT, INCONCLUSIVE", () => {
    const content = readAsset(join(COMMAND_DIR, "adv-design.md"));
    expect(content).toContain("VALIDATED");
    expect(content).toContain("CAUTION");
    expect(content).toContain("CONFLICT");
    expect(content).toContain("INCONCLUSIVE");
    expect(content).toMatch(/adv_change_update/);
  });

  test("adv-design.md contains validator result display section after absorb", () => {
    const content = readAsset(join(COMMAND_DIR, "adv-design.md"));
    expect(content).toMatch(/[Vv]alidator/);
    expect(content).toMatch(
      /VALIDATED|clean pass|CAUTION|CONFLICT|INCONCLUSIVE/,
    );
    expect(content).toMatch(/No validation data.*omit section silently/);
    expect(content).toMatch(/CONFLICT.*pause/i);
    expect(content).toMatch(/contract[- ]compromise risk/i);
    expect(content).toMatch(
      /keep.*compromise|revise.*design|revisit.*agreement|defer/i,
    );
  });

  test("adv-design.md contains contract-compromise risk assessment with trigger scope", () => {
    const content = readAsset(join(COMMAND_DIR, "adv-design.md"));
    expect(content).toMatch(/Phase 4\.1|contract-compromise risk assessment/i);
    expect(content).toMatch(
      /acceptance criteria.*explicit constraints.*stated avoidances|written agreement/i,
    );
    expect(content).toMatch(/agreement\.md.*amend|amend.*agreement/i);
  });

  test("ADV_INSTRUCTIONS.md references design validation in sub-agent orchestration", () => {
    const content = readAsset(INSTRUCTIONS);
    expect(content).toMatch(/design.*validator|validator.*design/i);
  });

  test("adv-design.md does NOT contain passive inform-user manual validation guidance", () => {
    const content = readAsset(join(COMMAND_DIR, "adv-design.md"));
    expect(content).not.toMatch(/inform the user.*additional frontier model/i);
    expect(content).not.toMatch(/have an additional frontier model/i);
  });
});

// =============================================================================
// 5. Archive and spec assets
// =============================================================================

describe("Archive and spec assets", () => {
  const ADVANCE_WORKFLOW_SPEC = join(
    REPO_ROOT,
    ".adv/specs/advance-workflow/spec.json",
  );

  test("adv-archive.md refreshes basis before choosing local or PR archive path", () => {
    const content = readAsset(join(COMMAND_DIR, "adv-archive.md"));
    expect(content).toMatch(/Refresh Merge Basis/i);
    expect(content).toMatch(/git -C "\$MAIN" fetch origin \{default-branch\}/);
    // Remote-backed release now proves origin/default or merged-PR state;
    // conflicts still route through the classification + resolution flow.
    expect(content).toMatch(/origin\/\{default-branch\}|origin\/<default>/i);
    expect(content).toMatch(/classification \+ resolution loop/i);
    expect(content).toMatch(/PR auto-merge|pr_auto_merge/i);
  });

  test("adv-archive.md explicitly owns ship finalization merge and push", () => {
    const content = readAsset(join(COMMAND_DIR, "adv-archive.md"));
    expect(content).toMatch(/canonical ship\/finalize path/i);
    expect(content).toMatch(/merge\+push/i);
    expect(content).toMatch(/Completion bar/i);
    expect(content).toMatch(/Do not say "archived", "shipped", or "done"/i);
    expect(content).toMatch(/git push origin \{default-branch\}/);
    expect(content).toMatch(/push failure[\s\S]*Pending auto-merge\./i);
    expect(content).toMatch(/push failure[\s\S]*Blocked\./i);
    expect(content).toMatch(
      /Remote-backed push failure never becomes a local-only success/i,
    );
    expect(content).toMatch(/NO_REMOTE_RELEASE_AUTHORITY/);
    expect(content).not.toMatch(
      /If no remote is configured OR push is skipped OR push fails[\s\S]*Merged locally\./i,
    );
  });

  test("adv-archive.md records release gate through archive and points back to main", () => {
    const content = readAsset(join(COMMAND_DIR, "adv-archive.md"));
    expect(content).toMatch(
      /adv_change_archive[\s\S]*records the release gate/i,
    );
    expect(content).toMatch(
      /Continue from: \{mainCheckout\} \(\{default-branch\}\)/,
    );
    expect(content).toMatch(/terminal-neutral/i);
    expect(content).not.toMatch(/call `adv_gate_complete gateId: 'release'`/);
  });

  test("adv-archive.md surfaces local deploy as visible release evidence", () => {
    const content = readAsset(join(COMMAND_DIR, "adv-archive.md"));
    expect(content).toMatch(/Step 5\.0: Local Deploy Gate/);
    expect(content).toMatch(/scripts\/deploy-local\.sh/);
    expect(content).toMatch(/deploy-local\.sh" --fix/);
    expect(content).toMatch(/Deploy visibility/i);
    expect(content).toMatch(/If deploy fails[\s\S]*nonblocking advisory/i);
    expect(content).not.toMatch(/If deploy fails → STOP\. Do not push/i);
    expect(content).toMatch(
      /Local deploy: \{ran \| ran; OpenCode activation pending restart \| not available \| not needed \| failed: <reason>; nonblocking\}/,
    );
    expect(content).toMatch(
      /GIT FINALIZATION COMPLETE[\s\S]*local deploy status/i,
    );
  });

  test("adv-archive.md Local Deploy Gate callout encodes deploy-rebuild, worker-refresh classification, and host-restart activation behavior", () => {
    // Behavior-level: the callout must communicate the actual activation
    // behavior of the Local Deploy Gate so that removing any required behavior
    // fails this test (AC5). The canonical mechanics live in
    // scripts/deploy-local.sh and docs/temporal-recovery.md (C3); this test
    // proves the archive callout points at them accurately.
    //
    // AC1: names ./scripts/deploy-local.sh --fix from the repo root as the
    // primary deploy and states it rebuilds a stale distribution before sync
    // (deploy-local.sh: ensure_plugin_dist_fresh rebuilds stale dist).
    // AC2: states the command classifies deployed workers by the
    // ADV_TEMPORAL_WORKER_SELF_ROLL=1 marker (retireDeployWorkerBounce:
    // self-roll-capable workers are advisory/not signaled; legacy workers
    // receive SIGTERM), fails closed on refresh failure, and routes recovery
    // to adv_doctor rather than manual termination retries
    // (deploy-local.sh: refresh_deployed_temporal_workers classifier).
    // AC3: requires OpenCode session / plugin-host restart plus tool
    // re-invocation, and explicitly denies any automatic host restart /
    // live-reload claim (temporal-recovery.md external restart boundary).
    // AC4: the existing Phase 8 `Local deploy` row is extended (no new row)
    // with `ran; OpenCode activation pending restart`.
    const content = readAsset(join(COMMAND_DIR, "adv-archive.md"));
    // AC1 — primary deploy command + rebuild-before-sync behavior
    expect(content).toMatch(/\.\/scripts\/deploy-local\.sh --fix/);
    expect(content).toMatch(/from the repo root/);
    expect(content).toMatch(/rebuilds[^.\n]*stale[^.\n]*distribut/i);
    expect(content).toMatch(/before sync/i);
    // AC2 — marker-gated worker classification; self-roll advisory / legacy
    // SIGTERM; fail-closed refresh routes to adv_doctor
    // rather than manual termination retries
    expect(content).toMatch(
      /classif[^.\n]*deployed[^.\n]*worker[^.\n]*ADV_TEMPORAL_WORKER_SELF_ROLL=1/i,
    );
    expect(content).toMatch(/[Ss]elf-roll-capable workers[^.\n]*not signaled/);
    expect(content).toMatch(/legacy workers receive `?SIGTERM`?/i);
    expect(content).toMatch(/fails closed[^.\n]*\[ADV:ACTION_REQUIRED\]/i);
    expect(content).toMatch(/rather than retrying manual termination/i);
    expect(content).toMatch(/adv_doctor/);
    expect(content).not.toMatch(
      /restart[^.\n]*standalone Temporal worker process/i,
    );
    // AC3 — host restart + tool re-invocation required; no auto-restart /
    // live-reload claim
    expect(content).toMatch(
      /[Rr]estart the relevant OpenCode session \/ plugin host/,
    );
    expect(content).toMatch(/re-invoke the affected tool/i);
    expect(content).toMatch(/does not auto-?restart/i);
    // AC4 — Phase 8 row extended (single existing row) with the new state
    expect(content).toMatch(/ran; OpenCode activation pending restart/);
    expect(content).toMatch(
      /- Local deploy: \{[^}]*ran; OpenCode activation pending restart[^}]*\}/,
    );
    // Preserved behavior — deploy completion is still not reload proof.
    expect(content).toMatch(/[Dd]eploy completion is not reload proof/);
    // AC4 — activation reporting is routed through the existing Phase 8
    // `Local deploy` row; no appended/unstructured activation advisory line.
    expect(content).toMatch(
      /activation[^.\n]*through the existing Phase 8 `Local deploy` row/i,
    );
    expect(content).not.toMatch(/append an activation advisory line/i);
  });

  test("archive terminal templates retain the local deploy activation-pending state", () => {
    const content = readAsset(
      join(REPO_ROOT, "docs/command-voice-standard.md"),
    );
    const shippedTemplate =
      content.match(
        /\*\*Shipped\*\*[\s\S]*?\*\*Blocked — no origin remote\*\*/,
      )?.[0] ?? "";
    const blockedTemplate =
      content.match(
        /\*\*Blocked — no origin remote\*\*[\s\S]*?\*\*Pending auto-merge\*\*/,
      )?.[0] ?? "";

    expect(shippedTemplate).toContain(
      "- Local deploy: {ran | ran; OpenCode activation pending restart | not available | not needed | failed: <reason>; nonblocking}",
    );
    expect(blockedTemplate).toContain(
      "- Local deploy: {ran | ran; OpenCode activation pending restart | not available | not needed | failed: <reason>; nonblocking}",
    );
  });

  test("advance-workflow spec encodes archive push-after-merge semantics", () => {
    const content = readAsset(ADVANCE_WORKFLOW_SPEC);
    expect(content).toMatch(/push origin \{default-branch\}/);
    expect(content).toMatch(/NO_REMOTE_RELEASE_AUTHORITY/);
    expect(content).toMatch(/origin\/\{default-branch\}/);
    expect(content).toMatch(/Pending auto-merge\./);
    expect(content).toMatch(/Blocked\./);
    expect(content).not.toMatch(/push fails[\s\S]{0,120}Merged locally\./i);
  });

  test("advance-workflow spec encodes release projection durability", () => {
    const content = readAsset(ADVANCE_WORKFLOW_SPEC);
    expect(content).toMatch(/rq-releaseProjectionDurability01/);

    const spec = JSON.parse(content) as {
      requirements: Array<{
        id: string;
        title: string;
        tags: string[];
        scenarios: Array<{
          id: string;
          title: string;
          given?: string[];
          when?: string;
          then?: string[];
          warrant?: string;
        }>;
      }>;
    };
    const requirement = spec.requirements.find(
      (r) => r.id === "rq-releaseProjectionDurability01",
    );
    expect(
      requirement,
      "rq-releaseProjectionDurability01 must exist",
    ).toBeDefined();
    expect(requirement!.title).toBe(
      "Archive Success Requires Durable Release Projection",
    );
    expect(requirement!.tags).toEqual(
      expect.arrayContaining([
        "archive",
        "release",
        "projection",
        "durability",
      ]),
    );
    expect(requirement!.scenarios.map((s) => s.id)).toEqual([
      "rq-releaseProjectionDurability01.1",
      "rq-releaseProjectionDurability01.2",
      "rq-releaseProjectionDurability01.3",
      "rq-releaseProjectionDurability01.4",
      "rq-releaseProjectionDurability01.5",
    ]);

    const shipped = requirement!.scenarios.find(
      (s) => s.id === "rq-releaseProjectionDurability01.4",
    );
    expect(shipped?.title).toMatch(/shipped/i);
    expect(shipped?.given?.join("\n")).toMatch(
      /both.*store-backed.*disk.*lag.*pending/i,
    );
    expect(shipped?.when).toMatch(/adv_change_archive/i);
    expect(shipped?.then?.join("\n")).toMatch(/ACCEPTS via `shipped`/i);
    expect(shipped?.then?.join("\n")).toMatch(/archive succeeds/i);
    expect(shipped?.then?.join("\n")).toMatch(
      /release gate is reconciled to `done`/i,
    );
    expect(shipped?.warrant).toBe("AC1");

    const nonShipped = requirement!.scenarios.find(
      (s) => s.id === "rq-releaseProjectionDurability01.5",
    );
    expect(nonShipped?.title).toMatch(/Non-shipped/i);
    expect(nonShipped?.given?.join("\n")).toMatch(/NOT `shipped`/i);
    expect(nonShipped?.when).toMatch(/adv_change_archive/i);
    expect(nonShipped?.then?.join("\n")).toMatch(/REJECTS.*strict guard/i);
    expect(nonShipped?.then?.join("\n")).toMatch(
      /Evidence-match \+ recovery-audit requirements remain unchanged/i,
    );
    expect(nonShipped?.warrant).toBe("AC2");

    // Legacy surface assertions preserved from the original regex check.
    expect(content).toMatch(/adv_gate_status/);
    expect(content).toMatch(/store-backed gate read/i);
  });

  test("advance-workflow spec encodes worker bundle release provenance", () => {
    const content = readAsset(ADVANCE_WORKFLOW_SPEC);
    expect(content).toMatch(/rq-workerBundleReleaseProvenance01/);

    const spec = JSON.parse(content) as {
      requirements: Array<{
        id: string;
        title: string;
        tags: string[];
        scenarios: Array<{
          id: string;
          title: string;
          given?: string[];
          when?: string;
          then?: string[];
          warrant?: string;
        }>;
      }>;
    };
    const requirement = spec.requirements.find(
      (r) => r.id === "rq-workerBundleReleaseProvenance01",
    );
    expect(
      requirement,
      "rq-workerBundleReleaseProvenance01 must exist",
    ).toBeDefined();
    expect(requirement!.title).toBe(
      "Worker Bundle Release Requires Freshness and Replay-Determinism Provenance",
    );
    expect(requirement!.tags).toEqual(
      expect.arrayContaining([
        "archive",
        "release",
        "worker-bundle",
        "provenance",
        "replay-determinism",
      ]),
    );
    expect(requirement!.scenarios.map((s) => s.id)).toEqual([
      "rq-workerBundleReleaseProvenance01.1",
      "rq-workerBundleReleaseProvenance01.2",
      "rq-workerBundleReleaseProvenance01.3",
      "rq-workerBundleReleaseProvenance01.4",
      "rq-workerBundleReleaseProvenance01.5",
      "rq-workerBundleReleaseProvenance01.6",
    ]);

    const blocked = requirement!.scenarios.find(
      (s) => s.id === "rq-workerBundleReleaseProvenance01.1",
    );
    expect(blocked?.title).toMatch(/missing|failing/i);
    expect(blocked?.given?.join("\n")).toMatch(
      /worker_bundle_impact: required/i,
    );
    expect(blocked?.when).toMatch(/release gate/i);
    expect(blocked?.then?.join("\n")).toMatch(/BLOCKED/i);
    expect(blocked?.then?.join("\n")).toMatch(
      /rq-workerBundleReleaseProvenance01/,
    );
    expect(blocked?.warrant).toBe("AC1");

    const passed = requirement!.scenarios.find(
      (s) => s.id === "rq-workerBundleReleaseProvenance01.2",
    );
    expect(passed?.title).toMatch(/valid provenance/i);
    expect(passed?.given?.join("\n")).toMatch(/source_sha/);
    expect(passed?.given?.join("\n")).toMatch(/build_run_id/);
    expect(passed?.given?.join("\n")).toMatch(/replay_run_id/);
    expect(passed?.then?.join("\n")).toMatch(/PASSES/i);
    expect(passed?.warrant).toBe("AC2");

    const skipped = requirement!.scenarios.find(
      (s) => s.id === "rq-workerBundleReleaseProvenance01.3",
    );
    expect(skipped?.title).toMatch(/not applicable/i);
    expect(skipped?.then?.join("\n")).toMatch(/SKIPPED/i);
    expect(skipped?.then?.join("\n")).toMatch(/not BLOCKED/i);
    expect(skipped?.warrant).toBe("AC3");

    const authority = requirement!.scenarios.find(
      (s) => s.id === "rq-workerBundleReleaseProvenance01.4",
    );
    expect(authority?.title).toMatch(/typed declaration/i);
    expect(authority?.then?.join("\n")).toMatch(/heuristic/i);
    expect(authority?.then?.join("\n")).toMatch(
      /rq-workerBundleReleaseProvenance01/,
    );
    expect(authority?.warrant).toBe("AC4");

    const runtime = requirement!.scenarios.find(
      (s) => s.id === "rq-workerBundleReleaseProvenance01.5",
    );
    expect(runtime?.title).toMatch(/out of scope/i);
    expect(runtime?.given?.join("\n")).toMatch(
      /deployed.*loaded|loaded.*deployed/i,
    );
    expect(runtime?.then?.join("\n")).toMatch(/out of scope/i);
    expect(runtime?.warrant).toBeUndefined();

    const blocking = requirement!.scenarios.find(
      (s) => s.id === "rq-workerBundleReleaseProvenance01.6",
    );
    expect(blocking?.title).toMatch(/blocking/i);
    expect(blocking?.title).toMatch(/not advisory/i);
    expect(blocking?.when).toMatch(/release readiness/i);
    expect(blocking?.then?.join("\n")).toMatch(/BLOCKING/i);
    expect(blocking?.then?.join("\n")).toMatch(/GateReadinessBlocker/i);
    expect(blocking?.then?.join("\n")).toMatch(/CRITERION_EVALUATORS/i);
    expect(blocking?.warrant).toBe("AC5");
  });

  test("advance-workflow spec encodes product-linked multi-repo state", () => {
    // rq-productLinking01 rq-productScopedChanges01 rq-productLearning01 rq-multiRepoArchive01
    const content = readAsset(ADVANCE_WORKFLOW_SPEC);
    expect(content).toMatch(/rq-productLinking01/);
    expect(content).toMatch(/scope_repos/);
    expect(content).toMatch(/origin_repo_id/);
    expect(content).toMatch(/multi-repo-archive\.json/);
  });

  test("workflow command docs mention product-linked repo scope handoffs", () => {
    const docs = [
      "adv-proposal.md",
      "adv-discover.md",
      "adv-prep.md",
      "adv-apply.md",
      "adv-archive.md",
    ]
      .map((file) => readAsset(join(COMMAND_DIR, file)))
      .join("\n");

    expect(docs).toMatch(/product-linked/i);
    expect(docs).toMatch(/scope_repos/);
    expect(docs).toMatch(/multi-repo-archive\.json/);
    expect(docs).toMatch(/legacy state/i);
  });

  test("adv-archive.md Phase 9 keeps main checkout on default branch (no git checkout/switch)", () => {
    const content = readAsset(join(COMMAND_DIR, "adv-archive.md"));
    // Resolve $MAIN once at start of Phase 9
    expect(content).toMatch(
      /MAIN="\$\(dirname "\$\(git rev-parse --path-format=absolute --git-common-dir\)"\)"/,
    );
    // Readiness check before any merge
    expect(content).toMatch(/Step 4\.4: Main Checkout Readiness Check/);
    expect(content).toMatch(/git -C "\$MAIN" branch --show-current/);
    expect(content).toMatch(/git -C "\$MAIN" var GIT_COMMITTER_IDENT/);
    // Invariant statement at top of Phase 9
    expect(content).toMatch(
      /Invariant: main checkout stays on the default branch/i,
    );
    // No git checkout / git switch directives anywhere in Phase 9 except the
    // forbidding statement in the invariant block.
    const phase9Match = content.match(
      /## Phase 9: Git Finalization[\s\S]*?(?=\n## |$)/,
    );
    expect(phase9Match).toBeTruthy();
    const phase9 = phase9Match?.[0] ?? "";
    // Allow `git checkout` / `git switch` only inside the invariant statement
    // and the user-remediation hint, both of which describe what NOT to do or
    // what the user must do manually. Strip those known-safe lines and assert
    // no other occurrences remain.
    const stripped = phase9
      .split("\n")
      .filter(
        (line) =>
          !/Invariant: main checkout/i.test(line) &&
          !/git -C "\$MAIN" switch \{default-branch\}/.test(line),
      )
      .join("\n");
    expect(stripped).not.toMatch(/git checkout/);
    expect(stripped).not.toMatch(/git switch/);
  });

  test("adv-archive.md preserves cleanup safety on reconcile conflicts", () => {
    const content = readAsset(join(COMMAND_DIR, "adv-archive.md"));
    expect(content).toMatch(/git rebase --abort/);
    expect(content).toMatch(/do NOT delete worktree/i);
    expect(content).toMatch(/conflicting files/i);
  });

  test("adv-archive.md closes linked issues by default (issue_number gate, any origin kind)", () => {
    const archive = readAsset(join(COMMAND_DIR, "adv-archive.md"));
    const instructions = readAsset(INSTRUCTIONS);

    expect(archive).toMatch(/--no-close-issue/);
    expect(archive).toMatch(/--close-issue[\s\S]*backward-compatible/i);
    expect(archive).toMatch(/default(?:s)? to closing/i);
    // Roadmap origin kind is retired; closure now keys off origin.issue_number
    // for any origin kind that carries an issue link (discovery, triage, adhoc).
    expect(archive).toMatch(/origin\.issue_number|origin\.kind/i);
    expect(archive).toMatch(/issue_number/);
    expect(archive).toMatch(/final release proof|release proof/i);
    expect(archive).not.toMatch(/Default-off; require explicit opt-in/i);

    expect(instructions).toMatch(/--no-close-issue/);
    expect(instructions).toMatch(/default(?:s)? to closing/i);
    expect(instructions).not.toMatch(/MUST be opt-in\. Default-off/i);
  });

  test("Negative AC #11: no dynamic INVESTMENT_CHECKIN marker injection in plugin/src/index.ts", () => {
    // AC #11: dynamic injection via experimental.chat.system.transform must be
    // append-only — specifically, no new INVESTMENT_CHECKIN markers
    // marker tokens added (cache preserved by construction in v1).
    const content = readAsset(join(REPO_ROOT, "plugin/src/index.ts"));
    expect(content).not.toMatch(/INVESTMENT_CHECKIN/);
    expect(content).not.toMatch(/\[ADV:INVESTMENT/);
    // Sanity: existing append-only markers still present
    expect(content).toMatch(
      /RECORD_WISDOM|ACCUMULATED_WISDOM|TODO_CONTINUATION/,
    );
  });
});

// =============================================================================
// 6. Opportunity Scout Phase & Schema Anchors
// =============================================================================

describe("Opportunity scout phase and schema anchors", () => {
  const SCOUT_SKILL = join(REPO_ROOT, "skills/adv-opportunity-scout/SKILL.md");

  test("adv-opportunity-scout skill exists with required sections", () => {
    const content = readAsset(SCOUT_SKILL);
    // Output schema
    expect(content).toMatch(/candidate/);
    expect(content).toMatch(/evidence/);
    expect(content).toMatch(/payoff/);
    expect(content).toMatch(/risk/);
    expect(content).toMatch(/contract_tie/);
    expect(content).toMatch(/prior_consideration/);
    expect(content).toMatch(/recommended_fate/);
    expect(content).toMatch(/fate_rationale/);
    // Hard cap
    expect(content).toMatch(/≤ ?5|at most 5/);
    // Degradation path
    expect(content).toMatch(/inconclusive/i);
    // Two modes
    expect(content).toMatch(/discovery/);
    expect(content).toMatch(/design/);
  });

  test("adv-discover spec contains scout requirements", () => {
    const specPath = join(REPO_ROOT, ".adv/specs/adv-discover/spec.json");
    const content = readAsset(specPath);
    const spec = JSON.parse(content);
    const ids = spec.requirements.map((r: { id: string }) => r.id);
    expect(ids).toContain("rq-discOpportunityScout01");
    expect(ids).toContain("rq-discOpportunityScout02");
  });

  test("advance-workflow spec contains design scout requirement", () => {
    const specPath = join(REPO_ROOT, ".adv/specs/advance-workflow/spec.json");
    const content = readAsset(specPath);
    const spec = JSON.parse(content);
    const ids = spec.requirements.map((r: { id: string }) => r.id);
    expect(ids).toContain("rq-designOpportunityScout01");
  });
});

// =============================================================================
// 7. Reviewer Evidence Authority (rq-reviewerEvidenceAuthority01)
// =============================================================================

describe("Reviewer evidence authority requirement (rq-reviewerEvidenceAuthority01)", () => {
  const specPath = join(REPO_ROOT, ".adv/specs/advance-workflow/spec.json");
  const spec: {
    requirements: Array<{
      id: string;
      title: string;
      body: string;
      priority: string;
      tags: string[];
      scenarios: Array<{
        id: string;
        title: string;
        given: string[];
        when: string;
        then: string[];
        warrant?: string;
      }>;
    }>;
  } = JSON.parse(readAsset(specPath));
  const req = spec.requirements.find(
    (r) => r.id === "rq-reviewerEvidenceAuthority01",
  );

  test("requirement exists as a MUST", () => {
    expect(req).toBeDefined();
    expect(req?.priority).toBe("must");
  });

  test("tags include relevant neighboring tags", () => {
    expect(req?.tags).toContain("workflow");
    expect(req?.tags).toContain("verification");
    expect(req?.tags).toContain("evidence");
    expect(req?.tags).toContain("structural");
    expect(req?.tags).toContain("review");
  });

  test("requirement has exactly four scenarios .1 through .4", () => {
    const scenarioIds = req?.scenarios.map((s) => s.id);
    expect(scenarioIds).toEqual([
      "rq-reviewerEvidenceAuthority01.1",
      "rq-reviewerEvidenceAuthority01.2",
      "rq-reviewerEvidenceAuthority01.3",
      "rq-reviewerEvidenceAuthority01.4",
    ]);
  });

  test("scenario .1 warrants AC1 and describes review-policy no-block", () => {
    const s = req?.scenarios.find(
      (x) => x.id === "rq-reviewerEvidenceAuthority01.1",
    );
    expect(s).toBeDefined();
    expect(s?.warrant).toBe("AC1");
    expect(s?.title).toMatch(/review/i);
    expect(s?.title).toMatch(/linked reviewer report|review_evidence_ref/i);
    expect(s?.then.join(" ")).toMatch(/no VERIFICATION_EVIDENCE_MISSING/i);
  });

  test("scenario .2 warrants AC2 and preserves block for test/static_check policies", () => {
    const s = req?.scenarios.find(
      (x) => x.id === "rq-reviewerEvidenceAuthority01.2",
    );
    expect(s).toBeDefined();
    expect(s?.warrant).toBe("AC2");
    expect(s?.title).toMatch(/test|static_check/i);
    expect(s?.title).toMatch(
      /reviewer evidence|only reviewer|aggregate tests_run/i,
    );
    expect(s?.then.join(" ")).toMatch(
      /VERIFICATION_EVIDENCE_MISSING blocker is emitted/i,
    );
  });

  test("scenario .3 warrants AC5 and gates verification_missing warnings", () => {
    const s = req?.scenarios.find(
      (x) => x.id === "rq-reviewerEvidenceAuthority01.3",
    );
    expect(s).toBeDefined();
    expect(s?.warrant).toBe("AC5");
    expect(s?.title).toMatch(/emitter/i);
    expect(s?.title).toMatch(/verification_missing/i);
    expect(s?.then.join(" ")).toMatch(/no verification_missing warnings/i);
  });

  test("scenario .4 preserves same-task ownership", () => {
    const s = req?.scenarios.find(
      (x) => x.id === "rq-reviewerEvidenceAuthority01.4",
    );
    expect(s).toBeDefined();
    expect(s?.title).toMatch(/same-task/i);
    expect(s?.title).toMatch(/ownership|review_evidence_ref/i);
    expect(s?.then.join(" ")).toMatch(/cannot satisfy|not satisfy/i);
  });
});
