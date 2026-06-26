# Acceptance

Reviewed at: 2026-06-26T18:40:25.182Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | `/adv-optimizer` includes a required early `Tech Stack Baseline` or equivalent step before scanner fan-out. | pass | `.opencode/command/adv-optimizer.md` Phase 1 now includes `Tech Stack Baseline` before `## Phase 2: First-Level Scanner Fan-out`; optimizer asset test verifies ordering. |
| SC2 | success_criterion | The step identifies language(s), framework(s), runtime(s), package manager(s), test/build tooling, and major architectural surfaces from project context and manifests. | pass | Command lists language(s), framework(s), runtime(s), package manager(s), test/build tooling, and major architectural surfaces; asset test checks all anchors. |
| SC3 | success_criterion | The command requires user confirmation/correction when tech-stack uncertainty would materially affect optimizer recommendations. | pass | Command requires inferred-stack confirmation/correction when stack uncertainty would materially affect recommendations; if clear/low-risk, state inferred stack and proceed. |
| SC4 | success_criterion | Scanner packets include the confirmed or assumed tech stack. | pass | Scanner packet includes `TECH STACK: {confirmed-or-assumed-stack}`; asset/static checks passed. |
| SC5 | success_criterion | Optimizer output includes the confirmed/assumed tech stack in coverage/current-state context. | pass | Report output includes `Tech Stack: {confirmed-or-assumed-stack}` near target/depth/coverage; asset/static checks passed. |
| SC6 | success_criterion | Asset tests fail if the tech-stack baseline/confirmation/output anchors are removed. | pass | RED asset test failed before command update; GREEN `pnpm exec vitest run src/adv-optimizer-assets.test.ts src/manifest-doc-drift.test.ts` passed 25 tests. |
| C1 | constraint | Keep change limited to `/adv-optimizer` command contract and local asset tests unless a drift test requires a small update. | respected | Touched files limited to `.opencode/command/adv-optimizer.md` and `plugin/src/adv-optimizer-assets.test.ts`. |
| C2 | constraint | Do not add a CLI runner, new agent, or runtime tool. | respected | Static optimizer stack check passed: no `.opencode/agents/adv-optimizer.md`, no `bin/adv optimizer`, no runtime tool addition. |
| C3 | constraint | Keep the command read-only and no-mutation. | respected | Existing read-only/no-mutation boundary retained; mutation tool names absent from command contract in static check. |
| DONT1 | avoidance | Do not rely on generic industry advice before stack is established. | respected | Command states `Do not rely on generic industry advice before the target stack is established.` |
| DONT2 | avoidance | Do not force a prompt when stack is clear and low-risk; state the inferred stack and proceed. | respected | Command says if stack is clear and low-risk, state inferred stack and proceed without prompting. |
| DONT3 | avoidance | Do not expand into unrelated optimizer redesign. | respected | Only targeted Phase 1, scanner packet, output, and asset-test anchors changed; reviewer found no scope drift. |

