# Archive: Add orchestrator ops delegation

**Change ID:** addOrchestratorOpsDelegation
**Archived:** 2026-06-06T22:45:41.370Z
**Created:** 2026-06-06T21:57:08.687Z

## Tasks Completed

- ✅ Add red asset/drift test for orchestrator operational delegation
  > Added `plugin/src/orchestrator-ops-delegation-assets.test.ts` with deterministic section extraction and assertions covering adv.md prose-only operational delegation, ADV_INSTRUCTIONS ops table, adv-apply Step 4.5 preservation/no ops duplicate, advance-meta requirement presence, and adv-atc out-of-scope. RED evidence: targeted test exits 1 with semantic missing-surface failures.
- ✅ Implement orchestrator operational delegation spec and instruction surfaces
  > Added `rq-orchestratorOpsDelegation01` to `advance-meta` spec and mirrored docs. Added prose-only operational delegation guidance to `.opencode/agents/adv.md`. Added single `ADV_INSTRUCTIONS.md` Orchestrator-Session Operational Routing table. Preserved `adv-apply.md` Step 4.5 semantics and left `adv-atc.md` unchanged. Targeted asset test passes.
- ✅ Run final verification for orchestrator operational delegation
  > Formatted the new asset test and ran final verification. Targeted orchestrator ops asset test passed. `bin/oc-test smoke` passed, including schemas:check, typecheck, lint, format:check, and smoke tests. Static diff review confirmed no adv-atc.md, adv-apply.md, runtime, or OMR/model-routing changes.

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** When testing prose-only agent sections, scope the no-pipe/no-table assertion to the exact Markdown heading slice. Adjacent sections like `Sub-Agent Policy` legitimately contain tables, so file-wide checks false-fail.
