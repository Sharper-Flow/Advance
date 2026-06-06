# Executive Summary

## Outcome

Delivered orchestrator-session operational delegation guidance for ADV. Primary `adv` now has durable instruction/spec/test coverage to shed authority-free operational work before repeated expensive primary cycles while preserving gate, task, checkpoint, archive, drift, contract, release, and user-facing decision authority.

## Verdict

APPROVED

## What Was Built

1. Added a red/green asset test for orchestrator operational delegation placement, routing, and out-of-scope guards.
2. Added `rq-orchestratorOpsDelegation01` to `advance-meta`, mirrored it in human-readable spec docs, and bumped spec metadata.
3. Added prose-only operational delegation guidance to `.opencode/agents/adv.md`.
4. Added the single `Orchestrator-Session Operational Routing` table to `ADV_INSTRUCTIONS.md`.
5. Verified `.opencode/agents/adv-atc.md`, `.opencode/command/adv-apply.md`, runtime code, and OMR/model-routing config stayed out of scope.

## What Was Verified

- Verdict: READY / APPROVED with 0 blocker findings and 0 issue findings.
- Tests: `bin/oc-test targeted -- src/orchestrator-ops-delegation-assets.test.ts` passed with 5 tests; `bin/oc-test smoke` passed after schemas:check, typecheck, lint, format:check, and 39 smoke tests.
- Preview URL: not_applicable — `visual_surface: false`; change affects instructions, specs, and tests only.
- Contract matrix: 22 required rows passed/respected; 0 failed, violated, or unknown.

## Remaining Concerns

None for this change. Future optional follow-up: decide whether `adv-atc` should receive comparable operational-delegation guidance in a separate ATC-scoped change.