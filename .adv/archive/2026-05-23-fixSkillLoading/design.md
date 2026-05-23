# Design

## Architecture Overview

Implement this as a documentation/spec/test contract correction, not a runtime feature. The design makes command/skill responsibility structural by adding a command/skill loading matrix and drift tests that enforce the matrix.

Core shape:

1. Extend the existing `ADV_INSTRUCTIONS.md § Command vs Skill Boundaries` classification instead of creating a parallel taxonomy.
2. Add `Load site` responsibility values for each command/skill pair: `orchestrator-only`, `worker-only`, `split`, or `inlined-agent-methodology`.
3. Add asset tests around a literal skill-reference inventory. Tests classify each command `skill(...)` reference, require nearby fallback/degradation where applicable, and catch phantom skill refs.
4. Adjust scout contracts so the orchestrator retains schema/routing/degradation/adoption authority while worker-specific scout methodology can be delivered to `adv-researcher` without loading the whole skill into main context.
5. Keep implementation source-local and deterministic: specs + markdown command files + asset tests. No runtime token metering.

## Key Decisions

### Decision 1 — Extend existing classification table, do not create a second taxonomy

`ADV_INSTRUCTIONS.md` already has a `Command vs Skill Boundaries` classification table. Add load-site/responsibility classification there rather than creating a parallel taxonomy.

### Decision 2 — Use split as the default for fan-out methodology

Fan-out commands can need two different slices of the same skill: main/orchestrator schema, routing, fallback, and adoption authority; worker scanning/research prompt details. The design keeps these slices explicit and does not transfer ADV state, gate, checkpoint, or adoption authority to workers.

### Decision 3 — Prefer permissive worker self-load checks

OpenCode skill loading can vary by agent and tool exposure. Tests should verify the safe invariant: no explicit `skill: false`/deny applies to worker agents expected to self-load, and fallback behavior exists. Do not require broad manifest churn to add positive `skill: true` flags everywhere.

### Decision 4 — Add phantom skill detection with trusted locations

Mirror the existing phantom sub-agent guard. Literal `skill("...")` references in active command guidance must resolve to a shipped/trusted skill or be explicitly allowlisted as dynamic/external with rationale. Dynamic placeholders like `skill("{name}")` and `skill("agent-{domain}")` are allowlisted by pattern.

Current evidence: repo/global scan did not find `prioritizer` or `global-verify`; both should be removed if unused or fixed/allowlisted if needed.

### Decision 5 — Treat missing refs by use, not dogma

If `prioritizer`/`global-verify`-style references are not needed, remove them. If needed, fix by shipping the skill, inlining the methodology, or explicit allowlist with fallback. This satisfies the user's direction without forcing unrelated workflow rewrites.

### Decision 6 — Scout migration is the concrete context-efficiency target

`adv-opportunity-scout` is the clearest worker-only bloat source: commands previously loaded the skill, then spawned `adv-researcher` with its prompt template. Update discovery/design scout wording/specs/tests so main keeps compact schema/routing/degradation/adoption and worker methodology is delivered by prompt packet or worker-context skill load.

## ADR Drafts

None. The decision is reversible and localized to ADV command contracts/tests; no ADR is needed.

## Implementation Strategy

1. Add RED asset/spec tests:
   - command/skill matrix includes every `.opencode/command/*.md` literal `skill(...)` reference in declared scope;
   - phantom skill refs fail unless shipped/trusted or allowlisted;
   - worker self-load classifications fail if target agent has explicit skill deny or missing fallback;
   - scout specs/commands no longer require whole-skill main-context load for worker-only prompt content.
2. Update `ADV_INSTRUCTIONS.md`:
   - document `orchestrator-only`, `worker-only`, `split`, and `inlined-agent-methodology` as load-site values;
   - classify command/skill pairs;
   - preserve commands-own-workflow/state rule.
3. Update command contracts:
   - `adv-discover.md` and `adv-design.md` scout phases keep orchestrator-owned schema/routing/degradation/adoption and deliver worker methodology to `adv-researcher` via explicit prompt packet or worker-context skill load;
   - classify or remove/fix `prioritizer` and `global-verify` references according to actual need and declared command-scan scope;
   - clarify fallback locality where classification/fallback tests require it.
4. Update specs/docs:
   - `adv-discover` and `advance-workflow` scout requirements encode split-load behavior;
   - `skills/adv-opportunity-scout/SKILL.md` documents split-load ownership;
   - tests guard taxonomy, phantom refs, fallback/degradation, and worker no-explicit-deny assumptions.
5. Run targeted tests, then `pnpm run check`, full `pnpm test`, and `pnpm run build` from `plugin/`.

## LBP Analysis

The long-term best-practice path is structural policy plus drift tests. Prompt-size efficiency is valuable, but correctness depends on keeping workflow decisions in the orchestrator. A tested matrix shrinks main context where methodology is worker-only, keeps worker skill loading safe through fallback and no-deny checks, aligns command/spec docs through tests, and prevents stale skill refs from accumulating silently.

## Affected Components

- `ADV_INSTRUCTIONS.md` — command/skill boundary taxonomy.
- `.opencode/command/adv-discover.md` — discovery scout loading/delivery wording and `prioritizer` reference decision.
- `.opencode/command/adv-design.md` — design scout loading/delivery wording.
- `.opencode/command/ship.md` — `global-verify` reference decision.
- `skills/adv-opportunity-scout/SKILL.md` — split-load guidance.
- `.adv/specs/adv-discover/spec.json` — discovery scout split-load requirement.
- `.adv/specs/advance-workflow/spec.json` — design scout split-load requirement.
- `plugin/src/skill-loading-policy-assets.test.ts` — structural asset tests.

## Risks and Mitigations

- **Risk:** Worker self-load availability differs across agent profiles. **Mitigation:** tests check no explicit deny and command fallback handles unavailable skill-load.
- **Risk:** Phantom skill refs reappear. **Mitigation:** asset tests scan literal command `skill(...)` references and require shipped skills or dynamic allowlist.
- **Risk:** Scout semantics weaken during split-load. **Mitigation:** command/spec/skill tests preserve ≤5 candidates, evidence requirement, strict schema, narrow auto-adopt, and INCONCLUSIVE degradation.
- **Risk:** Orchestrator authority leaks to workers. **Mitigation:** command/spec wording explicitly keeps schema, routing, fallback/degradation, adoption, and mutations with the orchestrator.

## Verification Plan

- Targeted asset tests for skill-loading policy and scout anchors.
- `pnpm run check` for typecheck, lint, format.
- Full `pnpm test` and `pnpm run build` before acceptance.
- ADV strict validation; expected `NO_DELTAS` warning only if the change modifies tracked spec assets directly.
