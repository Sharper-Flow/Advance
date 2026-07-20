# Reshape `/adv-triage` to portfolio balance, retire ROADMAP surface

## Outcome

The `/adv-triage` command was reshaped from a backlog-reconciliation + ROADMAP.md-regeneration tool into a portfolio-balance command, and the entire ROADMAP surface was retired. Two strands shipped together:

**Strand A (constructive)** — `/adv-triage` now runs a seven-source reconciliation followed by:
- **Phase 5 Coalesce** — detects unlinked ADV-change ↔ open-GitHub-issue overlap pairs using a three-tier evidence classifier (existing-link exclusion / structural / heuristic). Surfaces pairs for Tier B batched approval; never auto-links.
- **Phase 6 Portfolio-Balance report** — three inline sections: *Important-to-complete*, *Cleanup-needed* (delegates closure to `/adv-cleanup`), *Open-issues-worth-solving*. Caps at 10 rows per section with overflow indicators.
- **Phase 7 Final report** — assembles Epic context, advisory ordering, and next-action pointers.

**Strand B (destructive retirement)** — `adv_roadmap` MCP tool deleted; `ROADMAP.md` and `.adv/roadmap-snapshot.json` writers removed; `ROADMAP.md`/`.adv/roadmap-snapshot.json` dropped from the trunk-write-firewall allowlist; `bin/adv roadmap` CLI subcommand removed; `/adv-roadmap` command file deleted; spec laws `rq-backlogCoord05`, `rq-backlogCoord07`, `rq-roadmapCliBridge01` reframed as retirement laws; new `rq-AwB1gN3w01` supersedes legacy `rq-aw-backlog01`. Origin policy: `origin_kind: 'roadmap'` is now rejected on create/repair paths (`ORIGIN_KIND_ROADMAP_RETIRED`) but retained as a readable enum value so archived changes still parse.

## Value / why it matters

`ROADMAP.md` duplicated state already canonical in GitHub Projects v2 + Temporal Visibility. Maintaining it cost a write/commit/push step, a trunk-write-firewall allowlist entry, a sidecar JSON, and a chat echo — all to mirror state available on demand. More importantly, the old `/adv-triage` reconciled sources into issues but never answered the question users actually ask: *"What should I work on?"* The new portfolio-balance report balances in-flight ADV changes, open GitHub issues, and cleanup candidates — surfacing overlaps that should be linked, momentum leaders, abandoned work, and unrepresented issues worth promoting. The coalesce phase catches change↔issue duplication early; the three-section report gives a holistic portfolio view in one chat turn.

## Verification

- **Static retirement audit**: post-remediation commit `e2d63fa0` — `rg 'adv_roadmap'` across `plugin/src/`, `bin/`, `.opencode/`, `skills/` returns zero matches. Reviewer's AC4 blocker resolved by user-approved scope clarification (full literal removal; count-based invariant `UNNAMED_CONTRACTED_REMOVALS` in `tool-registry.inventory.test.ts` is the sole reintroduction guard).
- **Targeted test sweep**: `bin/oc-test targeted` — 15 files / 408 tests pass (`tr_mrtrx936_ab56b5f4`).
- **Bun CLI suite**: `bun test bin/adv.test.ts` — 16 tests pass / 0 fail (`tr_mrtrh1vg_81a57211`).
- **Spec schemas**: `schemas:check` green (`tr_mrtpmbgt_7b374c54`); 8 typed spec deltas recorded.
- **Origin policy**: focused suite 3 files / 119 tests pass (`tr_mrtpftgy_a8808554`).
- **Independent review**: adv-reviewer verdict `CONFLICT` → both blockers resolved (AC4 via user-approved remediation; AC5 blocker was a misreading — AC5 wording explicitly accepts "modified or removed").
- **Validate passes**: `adv_change_validate` at acceptance returns `passed:true`, 0 errors, 4 advisory cross-change capability overlap warnings (non-blocking).
- **Project check**: `pnpm run check` green — schemas, typecheck, manifests, isolation, lockfile, lint, format (`tr_mrtq7tyb_d005317d`).

## Risks / follow-ups

- **Tombstone enforcement weakened**: removing all literal `adv_roadmap` references from `plugin/src/` eliminated the named tombstone guards in `latent-tool-removal.test.ts`. Reintroduction is now caught only by the count invariant in `tool-registry.inventory.test.ts` (registry count must equal 83). A future change that re-adds a portfolio tool under a different name would not be flagged by name.
- **Spec-law deltas modify rather than remove**: ADV delta tools lack cross-capability `remove`; the three retired laws are carried as modify-to-retirement-form deltas. Archive applies the bundle-level removal.
- **Cross-change overlap warnings**: 4 advisory warnings from `adv_change_validate` flag overlapping `advance-workflow`/`advance-meta` capability modifications with `fixArchiveDeltaReconciliation`, `fixHealthViewTimeouts`, `fixShippedWorkflowTermination`, and `fixWorkflowReliabilityDefects`. All are draft/archived and non-blocking; merge order should be coordinated if those changes accumulate deltas before this one archives.
- **Documentation gap on the retirement decision**: the AC4 literal-removal choice is recorded in the review matrix and commit `e2d63fa0` message but not yet in a project-level wisdom entry.

## Supporting evidence

- Final commit on change branch: `e2d63fa0` (post-remediation).
- All 12 tasks done; execution gate complete.
- Review matrix: 31 rows, 0 failing.
- Worktree: `change/reshapeTriagePortfolioBalance` at `/home/jon/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/change/reshapeTriagePortfolioBalance`.
- Independent reviewer report persisted (verdict: CONFLICT → resolved).