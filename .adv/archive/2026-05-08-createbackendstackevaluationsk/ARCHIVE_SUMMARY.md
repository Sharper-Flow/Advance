# Archive: createBackendStackEvaluationSkill

**Change ID:** createbackendstackevaluationsk
**Archived:** 2026-05-08T21:40:41.029Z
**Created:** 2026-05-08T21:06:44.791Z

## Tasks Completed

- ✅ Create `skills/adv-backend-stack-eval/SKILL.md` — the full backend stack evaluation skill file.
  > Task checkpoint completed

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** ADV worktree policy must be enforced before first mutation. If checkpoint reports branch mismatch (main/trunk instead of change/<id>), treat as blocking: create/resume the change worktree, move only scoped files into it, remove accidental main-checkout copies, then checkpoint from the worktree.
- **[gotcha]** scripts/sync-global.sh currently resolves REPO_SKILLS from canonical REPO_ROOT, not ASSET_ROOT, so worktree-local new skills may not be copied by sync-global until merged into the main checkout. Treat as adjacent tooling issue if validating new skills from a worktree.
