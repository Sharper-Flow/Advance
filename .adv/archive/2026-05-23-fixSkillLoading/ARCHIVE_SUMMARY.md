# Archive: Fix skill loading

**Change ID:** fixSkillLoading
**Archived:** 2026-05-23T04:12:46.631Z
**Created:** 2026-05-23T02:54:19.576Z

## Tasks Completed

- ✅ Add command-skill taxonomy matrix asset tests
  > Created plugin/src/skill-loading-policy-assets.test.ts with structural inventory for literal .opencode/command skill(...) calls and load-site classifications. Added ADV_INSTRUCTIONS load-site taxonomy docs. Replaced command-level skill("prioritizer") and skill("global-verify") refs with embedded protocol wording to eliminate phantom command skill refs. Verified with pnpm exec vitest run src/skill-loading-policy-assets.test.ts (5 passed).
- ✅ Document load-site taxonomy and classify command-skill refs
  > Documented orchestrator-only, worker-only, split, and inlined-agent-methodology load sites. Classified shipped command skill refs including scout split-loading, adv-tron inlined-agent-methodology, shared slop detection, and orchestrator-only skills. Verification passed via pnpm exec vitest run src/skill-loading-policy-assets.test.ts src/adv-skill-backed-commands-assets.test.ts (58 tests).
- ✅ Add phantom-skill detection and resolve missing refs
  > The new skill-loading policy asset test extracts literal skill(...) calls across .opencode/command/*.md, ignores documented dynamic placeholders, and fails if any literal command skill is absent from shipped repo skills. The task resolution removed skill("prioritizer") from adv-discover.md in favor of the inline Tradeoff Prioritizer Protocol and removed skill("global-verify") from ship.md in favor of the embedded Global Verification Contract. Verification: targeted skill-loading test passed; grep found no command refs to skill("prioritizer") or skill("global-verify").
- ✅ Update scout split-loading contracts and tests
  > Updated adv-discover and adv-design scout phases so the orchestrator owns ScoutCandidate schema, routing, fallback/degradation, adoption, and mutations while prompting adv-researcher to load adv-opportunity-scout in worker context when available. Updated adv-opportunity-scout skill docs to document the split-load pattern. Updated adv-discover and advance-workflow specs to encode the split-load contract and worker skill-load degradation. Added asset-test assertions for split-load command/spec/skill wording. Verification: pnpm exec vitest run src/skill-loading-policy-assets.test.ts src/adv-autonomy-quality-assets.test.ts passed (36 tests).
- ✅ Add worker skill-load availability and fallback guards
  > Worker self-load availability is guarded by structural tests that reject explicit skill:false on worker targets instead of requiring skill:true. Scout split-load command/spec wording now defines worker skill-load unavailable as an INCONCLUSIVE degradation path. Verification: pnpm exec vitest run src/skill-loading-policy-assets.test.ts passed (6 tests); grep found no explicit skill:false in agent frontmatter and fallback/degradation text in relevant command surfaces.
- ✅ Run contract and repo verification
  > Ran final verification: targeted asset tests passed (3 files, 89 tests); strict ADV validation passed with NO_DELTAS warning only; pnpm run check passed after formatting; full pnpm test passed; pnpm run build passed. Formatting fix for the new asset test was committed in this verification checkpoint.

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** For targeted Vitest evidence in plugin/, prefer `pnpm exec vitest run <file>` over `pnpm test -- <file>` when exact file selection matters; the latter can still run broader suites and surface unrelated integration timeouts.
- **[pattern]** For command skill-ref asset tests, fallback/degradation assertions should be scoped near each skill reference, not file-wide, so additional refs in the same command cannot accidentally inherit unrelated fallback wording.
