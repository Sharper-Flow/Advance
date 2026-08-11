# Design: reduceAgentSessionContextFloor

## Architecture Overview

A six-workstream reduction layered on **existing** OpenCode and ADV mechanisms. No new runtime; no host loader change. The design exploits three verified levers (research F1–F3):

1. **Skill-body laziness** (F2) — `SystemPrompt.skills()` renders name+description+location only; bodies load via the `skill` tool. Demoting dense prose to a skill body removes it from the per-turn floor.
2. **Per-agent `permission.skill` render-time filtering** (F3) — `Skill.available(agent)` filters via `Permission.evaluate` before `fmt()`. Denied skills vanish from `<available_skills>`.
3. **Instruction-loader generality** — `Instruction.system()` globs `config.instructions` every turn; truncating those files directly shrinks the floor.

The work composes with the existing `advance-meta` prose-load-reduction capability by adding an orthogonal **`load-class` (eager|lazy) axis** to its enforcement-class taxonomy — reusing the test surface (`manifest-doc-drift.test.ts`) rather than introducing a parallel one.

## Lever Citations (P38)

Every mechanism this design changes, cited at its **call site** (not declaration):

| Mechanism | Call site (where it takes effect) | Evidence |
|---|---|---|
| Skill catalog rendering | `skill/index.ts` `Skill.available(agent)` → `Permission.evaluate("skill", name, agent.permission).action !== "deny"` filters before `Skill.fmt(list, {verbose:true})` | F3 (sst/opencode@d041eee) |
| Skill body lazy load | `skill/index.ts` `Skill.require(name)` invoked only by the `skill` tool; `fmt` never reads `content` | F2 |
| Instruction floor load | `session/instruction.ts` `Instruction.system()` → `systemPaths()` globs `config.instructions` every `prompt.ts` runLoop iteration (~L1230-1245) | F2 |
| Agent prompt as baseline | `session/llm/request.ts:51-57` ternary `...(input.agent.prompt ? [input.prompt] : SystemPrompt.provider(model))` — exclusive OR | F1 |
| Agent `prompt` origin | `config/agent.ts:27` `prompt: md.content.trim()` — markdown body becomes `agent.prompt` | F1 |
| Budget check enforcement | `plugin/package.json` `scripts.check` chain → new `check-prompt-budget.ts` (lever = the check script wired into the existing chain; pattern: `check-frontmatter.ts`, `check-test-isolation.ts`) | Local |
| Manifest generation | `plugin/scripts/generate-agent-manifests.ts` reads `AGENT_TOOL_POLICY` → emits `tools:` frontmatter; verified by `generate:manifests:check` | Local |
| Skill deployment | `scripts/deploy-local.sh:29` mirrors `skills/adv-*/SKILL.md` → `~/.config/opencode/skills/adv-*/` (repo-owned skills must be `adv-`prefixed) | Local |
| ADV_INSTRUCTIONS.md guard | `scripts/deploy-local.sh:792-799` hard-asserts the file is NOT in global `instructions[]` | Local |
| Doc-drift structural assertion | `plugin/src/manifest-doc-drift.test.ts` asserts instruction-surface conformance (existing `advance-meta` precedent) | Local |

No scoring/ranking lever in this design — confirmation that no earlier stage preempts the levers: the loader and skill renderer are the sole entry points (verified upstream), and the budget check is a new gate, not a weight.

## Key Decisions

**KD1 — Single-file `rules.yaml` truncation over two-file split.**
Each P-entry keeps `name` + `hint` + `tags` + first-sentence enforcement statement eager; `scope:` + remaining `rule:` prose moves to ONE new skill body (`adv-rule-rationale`). F5 measured 81% payload recovery (11,069 B of 13,771 B). Two-file split would grow file count without benefit. Reversible, unsurprising, minor tradeoff — no ADR.

**KD2 — Hand-write per-agent `permission.skill` deny globs; generate only if drift recurs.**
Frontmatter syntax verified (F3): `permission: { skill: { "cloudflare*": "deny", "agents-sdk": "deny", ... } }`. `generate-agent-manifests.ts` already generates `tools:` from `AGENT_TOOL_POLICY`; extending it to generate `permission.skill` is deferred until drift is observed (YAGNI per P29). Reversible.

**KD3 — Canonical `ADV State Access Policy` lives in a new always-on instruction file.**
`~/.config/opencode/instructions/adv-state-access.md`, registered in `opencode.jsonc` `instructions[]`. Mirrors the proven `lgrep-tools.md` / `morph-tools.md` pattern; reaches all agents (not just ADV-overlay-managed ones); repo-backed via toolbox mirror. The 6 manifest copies carry 3 unique rows (`adv-reviewer`) + 1 distinct surface list (`adv-researcher`) — all merged into the canonical file before any deletion. User-selected at discovery.

**KD4 — Budget check = standalone `plugin/scripts/check-prompt-budget.ts` wired into `pnpm run check`.**
Matches the established `check-frontmatter.ts` / `check-test-isolation.ts` pattern (verified Task C). Computes: (a) eager floor bytes (global AGENTS + project AGENTS + each `instructions[]` file + each agent manifest + skill catalog entries), (b) eager instruction+rule count. Fails on regression against committed baselines. Count is primary (F4), bytes secondary.

**KD5 — `adv.md` workstream 6 = sign-off template relocation ONLY.**
F1 makes the manifest load-bearing (prompt REPLACES stock provider prompt). Conservative scope: move the `## Change Report` skeleton (adv.md L225-245) and the `## Output Contract` handoff template (L323+) to `.opencode/command/adv-archive.md`. All behavioral framing stays in `adv.md`. A per-section load-bearing audit covers only the relocated region. Full manifest audit deferred to a named fast-follow. User-selected at discovery.

**KD6 — Dead `.opencode/token-budgets.json` deleted; fresh budget defined inline in the new check script.**
F6: zero live `.ts` consumers in the active tree; prior reader deleted by archived `consolidateCommandRepetitions`. Reviving dead config is a liability. The new `check-prompt-budget.ts` carries its own committed baselines.

**KD7 — `load-class` axis is orthogonal to the existing `advance-meta` enforcement-class taxonomy.**
A section becomes `(enforcement-class × load-class)`. `fully-enforced` routing triggers pin `load-class: eager`; `inherently-prose` rationale may take `load-class: lazy` *if* it leaves an eager pointer. Reuses `manifest-doc-drift.test.ts`; no parallel test surface. F8 confirms this matches the reference progressive-disclosure pattern.

**ADR rubric check:** KD1–KD7 reviewed against (1) hard-to-reverse, (2) surprising-without-context, (3) result-of-real-tradeoff. KD7 is borderline on (1) — a spec field addition — but a field addition remains reversible (migration is subtractive). None meet all three strongly. **No ADRs drafted.**

## Implementation Strategy

Sequenced by risk (lowest first); phases are parallelizable within phase, sequential across:

**Phase A — Zero-risk, parallelizable:**
- Skill deny-globs on 7 ADV agents (KD2) — additive frontmatter; verify `deploy-local.sh --check`
- Delete `## Local Code Exploration Priority` (5 files) + `## Editing Tool Priority` (4 files) — proven strict subsets (F7)

**Phase B — Canonical promotion (sequential):**
- Write `adv-state-access.md` merging all unique rows; register in `instructions[]`
- Delete `## ADV State Access Policy` from 6 manifests (only after canonical verified complete)

**Phase C — Budget gate:**
- `check-prompt-budget.ts` (KD4); wire into `pnpm run check`
- Delete dead `token-budgets.json` (KD6)

**Phase D — Floor reduction (the big wins):**
- `rules.yaml` truncation (KD1); create `adv-rule-rationale` skill body
- Runbook stub+skill split for 4 files (KD5 variant); ≤2 new skills total

**Phase E — Manifest template relocation:**
- Move sign-off template from `adv.md` → `adv-archive.md` (KD5); audit relocated region only

**Phase F — Spec + verification:**
- `advance-meta` deltas: `rq-eagerFloorBudget01`, `rq-loadClassAxis01`, `rq-skillDenyGlob01`
- Extend `manifest-doc-drift.test.ts` with pointer-integrity + load-class assertions
- Config-home mirror sync to `~/toolbox/backups/dotfiles/opencode/` (include missing `adv-tools.md`)

Prep will firm task boundaries; this is the sequencing rationale.

## LBP Analysis

This is the preferred long-term approach because:

1. **Uses OpenCode's native lazy mechanism** (skills) rather than fighting the loader or introducing a parallel retrieval system. The loader is upstream; we cannot change it; skills are the supported escape hatch.
2. **Composes with the existing taxonomy** (KD7) — adds an axis rather than a parallel system. The `manifest-doc-drift.test.ts` surface already exists and already asserts instruction-surface conformance.
3. **Regression-proof via structural gate** (KD4) — the budget check makes re-growth visible in CI, not at runtime. P33 (structural correctness) satisfied.
4. **Leaves the root cause as a named follow-up, not a hack.** The root cause is the host loader taking no agent parameter (upstream #10688). This change mitigates; a named backlog item resolves.
5. **Matches convergent cross-system evidence** (F8): Claude Code, Cursor, Copilot, Aider all use the same fact/trigger-eager vs procedure/recipe-lazy axis. Not novel, not speculative.

## Affected Components

**advance repo:**
- `.opencode/agents/*.md` (7 files) — dedup + skill deny-globs
- `.opencode/agents/adv.md` — sign-off template relocation (KD5)
- `.opencode/command/adv-archive.md` — template destination
- `plugin/scripts/check-prompt-budget.ts` (new) — budget gate
- `plugin/package.json` — wire check into `pnpm run check`
- `plugin/src/manifest-doc-drift.test.ts` — extend assertions
- `plugin/src/tool-role-policy.ts` — only if skill deny-globs later become generated (KD2 defer)
- `skills/adv-rule-rationale/SKILL.md` (new) — demoted rule rationale
- `skills/adv-runbook-recipes/SKILL.md` (new, possibly) — demoted runbook recipes (or per-domain split)
- `.adv/specs/advance-meta/spec.json` — 3 new requirements

**config home (`~/.config/opencode/`, not git-tracked):**
- `instructions/rules.yaml` — truncate to first-sentence core
- `instructions/trunk-worktree-isolation.md`, `git-freshness.md`, `oc-ci-wait.md`, `oc-test-gate.md` — reduce to routing stubs
- `instructions/adv-state-access.md` (new) — canonical State Access Policy
- `opencode.jsonc` — add `adv-state-access.md` to `instructions[]`
- Delete `.opencode/token-budgets.json` (dead)

**backup mirror (`~/toolbox/backups/dotfiles/opencode/`):**
- Sync all instruction changes; add `adv-tools.md`

## Design-Derived Criteria

Technical budgets created by this architecture (no new user-facing AC):

- **DDC1 — Eager floor budget:** ≤ 50,000 B (from SC1). Measured on merged-trunk build by `check-prompt-budget.ts`.
- **DDC2 — Eager instruction+rule count budget:** ≤ 60 entries. Informed by F4 (perfect-response collapse at N=80); current ≈ 33 (8 files + 25 rules), post-reduction target ≤ 30. Count is the primary regression signal.
- **DDC3 — New skill count cap:** ≤ 3 (from C4). `adv-rule-rationale` + ≤2 runbook skills.
- **DDC4 — Per-skill catalog entry cost model:** name + description + location + ~90 B XML wrapper, paid every model turn (F2). Triggers the ≤3 cap.
- **DDC5 — Pointer-integrity invariant:** every `load-class: lazy` section has a verifiable eager pointer; asserted by extended `manifest-doc-drift.test.ts`.

## Risks / Mitigations

- **R1 — Demoted content undertrigger.** An agent needs a demoted rule/recipe but never invokes the skill. *Mitigation:* every demoted item leaves an eager pointer+trigger (F8 mitigation invariant); DDC5 asserts this structurally. *Residual:* nonzero; conservative depth limits exposure.
- **R2 — Skill deny-glob over-broad.** `"cloudflare*"` would deny a hypothetical future `cloudflare-advance-integration` skill. *Mitigation:* explicit allowlist semantics; `last-matching-rule wins` (F3); review deny set at acceptance. *Residual:* low — no such skill exists or is planned.
- **R3 — V2 no-merge arrays breaks global+project accumulation.** F9: V2 picks the closest config's entire `instructions[]` array. *Mitigation:* `deploy-local.sh:792-799` already structurally avoids global registration of `ADV_INSTRUCTIONS.md`; named follow-up tracks V2. *Residual:* medium, deferred.
- **R4 — Manifest trimming regression.** F1: the body IS the baseline. *Mitigation:* KD5 conservative scope (sign-off template only); per-section audit of the relocated region. *Residual:* low given conservative scope.
- **R5 — Unrecorded structural end-state.** The per-agent prompt-scoping host loader change (#10688) is the structural fix but is out of scope. *Mitigation:* **route to `adv_backlog_add`** (per Phase 2 point 7) — never leave as "no change owns it."

### Design Leverage Scout
Inconclusive — skipped. This is a mechanical reduction on existing mechanisms (skills, instructions, permission frontmatter, check scripts), not a novel architecture seeking leverage opportunities. The scout skill (`adv-opportunity-scout`) targets designs with scoring/ranking/architecture surfaces to optimize; none apply here. No candidates adopted or surfaced.