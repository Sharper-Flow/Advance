# Archive: Adopt BMAD-inspired workflow engine, adversarial review, validation checklists, project wisdom, workflow manifest, and structured proposal templates

**Change ID:** adoptBmadInspiredWorkflowEngin
**Archived:** 2026-02-13T18:31:33.596Z
**Created:** 2026-02-12T21:44:30.171Z

## Tasks Completed

- ✅ Delete .opencode/command/adv-quick.md and remove all /adv-quick references from adv-task.md, adv-clarify.md, and ADV_INSTRUCTIONS.md
- ✅ Create docs/checklists/review-checklist.md with structured criteria for /adv-review minimum findings enforcement (12-dimension coverage, conventional comment labels, min 3 non-nit findings or explicit genuinely-clean justification)
- ✅ Create docs/checklists/harden-checklist.md with structured criteria for /adv-harden minimum findings enforcement (5-scanner coverage, severity scoring, min 3 non-nit findings or explicit genuinely-clean justification)
- ✅ Update .opencode/command/adv-review.md to reference review-checklist.md and enforce minimum findings (3+ non-nit or genuinely-clean with file-level evidence)
- ✅ Update .opencode/command/adv-harden.md to reference harden-checklist.md and enforce minimum findings (3+ non-nit or genuinely-clean with file-level evidence)
- ✅ Create docs/checklists/prep-checklist.md with semantic validation criteria for /adv-prep gate (requirement specificity, scenario completeness, testability, scope clarity, dependency mapping)
- ✅ Add project-level wisdom JSONL store (wisdom.jsonl) with add, list, compact operations in plugin/src/storage/store.ts and plugin/src/storage/json.ts (TDD: write tests first)
- ✅ Add adv_wisdom_promote tool to plugin/src/tools/wisdom.ts that promotes a change-level entry to project wisdom with pruning criteria (durable, convention-level, not one-off) (TDD: write tests first)
- ✅ Update context injection in plugin/src/index.ts to draw from both current-change wisdom (max 10) and project-level wisdom (max 10), with project wisdom prioritized by recency
- ✅ Add project wisdom compaction (prune entries beyond 50 cap, removing oldest non-convention entries first)
- ⏭️ Create docs/adv-manifest.yaml with entries for all 19 commands (post-quick removal) including phase, prerequisites, gates affected, and successor commands
- ✅ Update .opencode/command/adv-status.md and plugin/src/tools/status.ts to use manifest for context-aware next-step recommendations
- ✅ Expand proposal.md scaffold in plugin/src/storage/json.ts to include sections: Why, What Changes, Success Criteria, Affected Code, Constraints, Impact, Risks, Validation Plan (TDD: write tests first)
- ⏭️ Write tests for project-level wisdom (JSONL read/write, promotion, compaction, 50-entry cap enforcement)
- ⏭️ Write tests for expanded proposal template (verify all 8 sections present in scaffold output)
- ✅ Run full test suite (bun test) and fix any regressions
- ✅ Change manifest format from YAML (docs/adv-manifest.yaml) to TypeScript constant (plugin/src/manifest.ts) with type-safe CommandDef interface — compile-time checked, zero parse overhead, consistent with codebase
- ✅ Implement file-locking or atomic-rename retry logic for wisdom.jsonl to prevent concurrency issues during multi-agent promotion
- ✅ Add schema validation for project wisdom entries during promotion and loading to prevent store corruption

## Specs Modified

- **advance**: 3 delta(s)
