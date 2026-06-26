# Contract Traceability

**Change ID:** updateOptimizerStackCheck
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-26T18:40:25.182Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | `.opencode/command/adv-optimizer.md` Phase 1 now includes `Tech Stack Baseline` before `## Phase 2: First-Level Scanner Fan-out`; optimizer asset test verifies ordering. |
| SC2 | success_criterion | pass | review | Command lists language(s), framework(s), runtime(s), package manager(s), test/build tooling, and major architectural surfaces; asset test checks all anchors. |
| SC3 | success_criterion | pass | review | Command requires inferred-stack confirmation/correction when stack uncertainty would materially affect recommendations; if clear/low-risk, state inferred stack and proceed. |
| SC4 | success_criterion | pass | review | Scanner packet includes `TECH STACK: {confirmed-or-assumed-stack}`; asset/static checks passed. |
| SC5 | success_criterion | pass | review | Report output includes `Tech Stack: {confirmed-or-assumed-stack}` near target/depth/coverage; asset/static checks passed. |
| SC6 | success_criterion | pass | review | RED asset test failed before command update; GREEN `pnpm exec vitest run src/adv-optimizer-assets.test.ts src/manifest-doc-drift.test.ts` passed 25 tests. |
| C1 | constraint | respected | static_check | Touched files limited to `.opencode/command/adv-optimizer.md` and `plugin/src/adv-optimizer-assets.test.ts`. |
| C2 | constraint | respected | static_check | Static optimizer stack check passed: no `.opencode/agents/adv-optimizer.md`, no `bin/adv optimizer`, no runtime tool addition. |
| C3 | constraint | respected | static_check | Existing read-only/no-mutation boundary retained; mutation tool names absent from command contract in static check. |
| DONT1 | avoidance | respected | review | Command states `Do not rely on generic industry advice before the target stack is established.` |
| DONT2 | avoidance | respected | review | Command says if stack is clear and low-risk, state inferred stack and proceed without prompting. |
| DONT3 | avoidance | respected | review | Only targeted Phase 1, scanner packet, output, and asset-test anchors changed; reviewer found no scope drift. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-76568165c118 | SC1, SC2, SC3, SC4, SC5, SC6 | SC1, SC2, SC3, SC4, SC5, SC6 | C1, C2, C3, DONT1, DONT2, DONT3 |  |
