# Executive Summary

## Outcome
Advance now gives agents a mode-neutral contract for using external MCP tools: discover the callable surface actually exposed in the current session, then use that surface without assuming CodeMode or direct schemas. Approval accepts this verified source change for release hardening.

## Why It Matters
The change prevents false tool-invocation guidance when sessions differ, while keeping OpenCode as the only owner of generated CodeMode catalog syntax. It also preserves a separately tracked toolbox fix for explicit CodeMode-disable precedence.

## Verdict
APPROVED

## What Was Built
1. Replaced one-mode external-MCP instructions across canonical agent, overlay, command, skill, and reference assets with one bounded, mode-neutral contract.
2. Added structural corpus and runtime-matrix coverage for actual exposed callable surfaces, exact name forms, absent external MCP, prompt byte budget, frontmatter separation, and deployed-asset parity.
3. Re-froze the contract baseline from trunk after `consolidateAdvToolSurface2` so peer role-policy frontmatter is not charged to this change's 400-byte guidance budget.
4. Hardened runtime-evidence loading: an absent optional fixture is allowed, but malformed committed evidence fails loudly; regression coverage added.
5. Linked the separately tracked toolbox change `fixCodemodeDisableOverride`, which proves explicit disable precedence and both runtime modes.

## What Was Verified
- Verdict: READY; one provenance finding was fixed before acceptance, with no unresolved findings.
- Tests: targeted matrix/corpus checks passed 24/24; merged contract checks passed 23/23; peer guards passed 428/428; full suite passed 357 files and 5283 tests.
- Prompt budget: merged maximum effective-prompt delta is 334 bytes, below the 400-byte limit.
- Preview URL: not_applicable — no frontend, browser-visible, or visual-output work; source guidance and test fixtures only.
- Contract matrix: 32/32 rows passed, respected, or explicitly out of scope; zero failures.

## Remaining Concerns
- Non-blocking: live external-runtime probes measure deployed assets and were not rerun from this undeployed worktree. Existing committed matrix evidence covers all five mandatory rows; regenerate probes after deployment.

## Supporting Evidence
- Task checkpoints: `55e00ddd`, `7f1d70a7`, `d3cb0f4e`, `e35bb003`.
- Acceptance reviewer report: `updateCodemodeMcpContracts|change:review:acceptance|adv-reviewer|2`.
- Linked toolbox terminal projection: `fixCodemodeDisableOverride` (archived).
- Cross-change merge proof: clean merge-tree with trunk containing `consolidateAdvToolSurface2`.

## Consequence Context
- **Delivered value — pass:** Agents follow the actual external-MCP surface instead of a single assumed invocation mode (contract matrix AC1–AC7).
- **Enabling-only/follow-up dependency — pass:** Toolbox disable-precedence evidence is separately tracked in archived `fixCodemodeDisableOverride` (AC8, AC10).
- **Ops readiness — pending:** Harden owns release/deploy/production/docs/cleanup readiness; no operational rollout occurs in this change.
- **Migration/data impact — n/a:** Source prompts, fixtures, and tests only; no data or migration surface changed.
- **Frontend/preview impact — not_applicable:** No user-facing visual output changed; no preview URL required.
- **Collision/release risk — low:** Peer conflict was resolved by a reviewed baseline migration; clean merge-tree and merged checks passed.
- **Open follow-ups — non-blocking:** Regenerate live runtime probe evidence after deployment.
- **Next action — pending approval:** User acceptance proceeds to release hardening and archive sign-off.