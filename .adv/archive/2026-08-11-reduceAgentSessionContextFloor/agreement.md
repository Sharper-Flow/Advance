# Agreement: reduceAgentSessionContextFloor

## Acceptance Criteria

### Success Criteria

1. **SC1 — Eager floor reduction.** Eager per-session instruction floor reduced from 76,565 B to ≤ 50,000 B (target ~45,000 B), measured by the new budget check on the merged-trunk build. Evidence: review.

2. **SC2 — Worker applicability.** Eager instruction/rule count reduced; the `adv-ci-waiter` floor drops from 94% to ≤ 60% of its total prompt. Evidence: review.

3. **SC3 — Config-home mirroring.** Config-home changes mirrored to `~/toolbox/backups/dotfiles/opencode/` including the previously-missing `adv-tools.md`. Evidence: review.

4. **SC4 — Behavioral preservation.** No behavior currently enforced by an instruction stops being enforced — every demoted item has an eager pointer, verified by extended `manifest-doc-drift.test.ts`. Evidence: review.

### Acceptance Criteria

1. **AC1 — Floor budget regression gate.** Given a regression that grows the eager floor or eager-rule count, when `pnpm run check` runs, then the budget check fails. Evidence: test.

2. **AC2 — Skill deny-glob consistency.** Given an agent manifest carrying `permission.skill: {"cloudflare*": "deny", "agents-sdk": "deny", "sandbox-sdk": "deny"}`, when `deploy-local.sh --check` runs, then the deployed frontmatter is consistent and the 11 irrelevant skills are denied. Evidence: test.

3. **AC3 — Rule pointer integrity.** Given `rules.yaml` after truncation, when any P-rule is inspected, then its first-sentence enforcement statement remains eager and its `scope:`/rationale is reachable via a pointer to the lazy skill body. Evidence: test.

4. **AC4 — Manifest duplication deletion.** Given a deleted `## Local Code Exploration Priority` (or `## Editing Tool Priority`) section, when `pnpm run generate:manifests:check` runs, then it passes and the deleted content is verifiably present in `lgrep-tools.md` / `morph-tools.md`. Evidence: test.

5. **AC5 — Canonical State Access promotion.** Given the new `~/.config/opencode/instructions/adv-state-access.md` registered in `instructions[]`, when the 6 manifest `## ADV State Access Policy` copies are deleted, then no unique row is lost (`adv-reviewer`'s 3 rows + `adv-researcher`'s distinct surface list preserved in the canonical file). Evidence: test.

6. **AC6 — Sign-off template relocation.** Given `adv.md` after sign-off template relocation, when `/adv-archive` runs, then the `## Change Report` skeleton renders correctly from `.opencode/command/adv-archive.md`. Evidence: test.

## Constraints

- **C1** — Must not register `ADV_INSTRUCTIONS.md` in global `instructions[]`. The `deploy-local.sh:792-799` regression guard must stay green. Evidence: static_check.
- **C2** — Must not hand-edit generated agent `tools:` frontmatter. Change `AGENT_TOOL_POLICY` and regenerate via `pnpm run generate:manifests`. Evidence: static_check.
- **C3** — Must run all repo edits from an ADV worktree; deploy/rebuild from merged trunk only (`scripts/deploy-local.sh`). Evidence: static_check.
- **C4** — Must not create more than 3 new skills. Catalog entries are eager and re-rendered per turn — upstream `#20647` documents catalog bloat at scale. Evidence: static_check.

## Avoidances

- **DONT1** — Aggressive manifest trimming without a per-section load-bearing audit. Research validation F1: an agent's `prompt` field REPLACES the stock provider system prompt (`session/llm/request.ts:51-57`); the manifest IS the baseline. Evidence: review.
- **DONT2** — A byte-only budget gate. Research validation F4: instruction COUNT dominates bytes (perfect-response collapses to zero at N=80 rules, arXiv 2607.19257). Count is the primary lever. Evidence: review.
- **DONT3** — Waiting on upstream `#10688` (per-agent `instructions`) or OpenCode V2 landing. Research validation F9: Q1–Q3 levers are valid under both V1 and V2; do not block. Evidence: review.
- **DONT4** — Editing deployed artifacts under `~/.local/share/Advance/` directly. Edit sources, build, deploy via `scripts/deploy-local.sh`. Evidence: review.

## Objectives

- **Objective 1** — Cut the eager per-session instruction floor to ≤ 50 KB with no loss of enforced behavior. Covered by: SC1, SC4, AC1, AC3, AC4.
- **Objective 2** — Make instruction-count growth visible and gated so the floor cannot silently drift back up. Covered by: SC1, AC1.
- **Objective 3** — Remove structurally inapplicable content from worker agents (`adv-ci-waiter` is the canonical case at 94%). Covered by: SC2, AC2.
- **Objective 4** — Establish a single canonical source for shared policy currently duplicated across 6 manifests, eliminating drift. Covered by: SC4, AC5.
- **Objective 5** — Keep config-home state recoverable via its git-tracked backup mirror. Covered by: SC3.

## Decision Log

- **2026-08-11 — Two-home scope.** One ADV change covers both the advance repo and `~/.config/opencode/`. User-selected at Phase 1.
- **2026-08-11 — Conservative reduction depth.** Only pure recipes, tier matrices, shell snippets, and rationale prose may be demoted. User-selected at Phase 1.
- **2026-08-11 — ADV State Access Policy canonical home = new always-on instruction file.** User-selected at discovery.
- **2026-08-11 — adv.md workstream 6 scope = sign-off template only.** User-selected at discovery.
- **2026-08-11 — Config-home routing = direct edit + mirror sync.** User-selected at discovery.
- **2026-08-11 — Budget metric = byte AND count, count primary.** User-selected at research approval.
- **2026-08-11 — Dead `token-budgets.json` delete-or-repurpose.** Discovery F6: zero live consumers.
- **2026-08-11 — Pending-skill scan false positive.** No pending-review skill exists; no action taken.
- **2026-08-11 — Warrant annotations stripped for contract mint.** The 3 spec deltas (rq-eagerFloorBudget01, rq-loadClassAxis01, rq-skillDenyGlob01) are staged on the change; warrants bind at archive when deltas write to the global spec, not at contract mint.