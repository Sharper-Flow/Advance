## Implementation Strategy

### Files
- `.opencode/agent-parts/providers/claude.md`
- `.opencode/agent-parts/providers/glm.md`
- `plugin/src/adv-command-routing-assets.test.ts` or `plugin/src/sync-global.test.ts` for content-aware provider-hint coverage.

### Required Design Decisions
1. **Replace Claude anti-delegation wording, do not append to it.** The current Claude hint conflicts with ADV delegation routing; adding a pro-delegation sentence while leaving the old anti-delegation sentence would preserve prompt conflict.
2. **Use canonical sub-agent spelling: `adv-engineer`.** Never use `adv_engineer`.
3. **Reference delegation routing, not raw enthusiasm.** Provider hints should encourage delegation only when routing evaluates a task as `delegate_allowed` / `delegate_preferred` or when ADV policy says delegation criteria are met.
4. **Preserve machine safety.** Runtime guard remains source of truth for top-level-only spawning, no nested sub-agents, and parallelism cap. Hints must not introduce divergent caps such as Claude's current `2`; if cap is mentioned, it must match runtime cap `3`.

### Implementation Steps
1. Add a targeted asset test that fails while:
   - `claude.md` still says “Prefer doing work inline over spawning sub-agents”.
   - `claude.md` or `glm.md` lacks `adv-engineer` delegation-routing guidance.
   - either file uses `adv_engineer`.
2. Update `claude.md`:
   - Remove anti-delegation sentence.
   - Add delegation-routing-aware `adv-engineer` guidance.
3. Update `glm.md`:
   - Add delegation-routing-aware `adv-engineer` guidance.
   - Preserve existing schema/tool/lgrep caution.
4. Verify provider hint line-count and targeted tests.
5. Run sync validation where practical.

### Validation Plan
- Red: targeted asset test fails against current provider hints.
- Green: targeted asset test passes after hint edits.
- Run targeted test file containing provider-hint assertions.
- Run `scripts/sync-global.sh --check` if available; report exact blocker if runtime canary or environment prevents full check.

### Validator Result
Independent validator verdict: CAUTION. Design is architecturally sound; caution requires replacing Claude's conflicting sentence and using hyphenated `adv-engineer` exactly.