# Executive Summary: Fix packet-defect work-discard policy

## Outcome

When an ADV orchestrator spawns a research/reconnaissance/visual-review worker without the required identity packet header (working directory, change ID, scope key, attempt number), the worker now completes the work and returns findings as a message instead of discarding them.

## Why it matters

Before this change, a missing packet header caused typed-worker sub-agents (adv-researcher, adv-tron, adv-visual-review) to abort with `PACKET-DEFECT FAILURE` and return zero findings — wasting every tool call they had already made. Observed incident: an adv-researcher run executed 14 valid PostHog research tool calls, then terminated with no deliverable. Research was lost; orchestrator had to re-run from scratch.

After this change, the same scenario produces:
- The research findings, delivered as the worker's final message.
- A `## PACKET DEFECT` section flagging which anchors were missing.
- No `adv_subagent_report_submit` call (avoids persisting a malformed typed report).

The orchestrator gets the work AND the corrective signal. Strict improvement.

## What was delivered

- **Lane-aware policy** in adv-researcher.md, adv-tron.md, adv-visual-review.md: complete the work, skip typed submission, return PACKET DEFECT message.
- **Broadened contract** in adv.md: typed-worker packet contract now lists all 6 spec-covered lanes (was under-scoped to adv-engineer + adv-reviewer). Reduces future orchestrator-side omission.
- **Self-documenting briefing packet**: identity_anchors section now carries `required_from: "orchestrator_packet_header"` so any reader knows values must come from the Task prompt, not the briefing packet itself.

## Verification

- 277/277 tests pass across 8 affected suites (optimized-handoff, briefing-packet-renderer, adv-engineer-assets, adv-reviewer-asset, adv-designer-assets, briefing-packets-command-assets, types/briefing-packets, types/subagent-reports).
- TDD RED→GREEN evidence recorded per task.
- Touched files pass prettier + eslint + typecheck + schemas:check + agent-manifest:check.

## Risks / follow-ups

- **Pre-existing trunk format breakage** in `active-change-pointer.test.ts` + `archive-gate.test.ts` (introduced by commit 578d8aff, unrelated to this change). Blocks `pnpm run check` from fully passing on trunk. Recommend separate campsite cleanup.
- **No spawn-time structural validation**: this change reduces failure rate via clearer main-agent contract + reduces blast radius via lane-aware worker policy. A structural Task-tool validator that rejects packets missing required anchors is a separate future change.
- **Mutating lanes (adv-engineer, adv-designer, adv-reviewer)** retain refuse-to-begin policy for missing WORKING DIRECTORY — correct as-is, because they need workdir authorization for every tool call.

## Release readiness

- No migration, no data impact, no frontend impact, no ops readiness requirements.
- No open follow-up blockers.
- Safe to merge and deploy.