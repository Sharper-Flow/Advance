## Design

### Chosen mechanism

Embed `ADV_INSTRUCTIONS.md` into generated ADV provider prompt files, not into global `opencode.json instructions[]`:

```text
agent-parts/advance/adv-{provider}.md =
  canonical adv.md body
  + ADV_INSTRUCTIONS.md body
  + provider hint
```

This preserves ADV-agent protocol parity while removing the global prompt tax from non-ADV agents.

### Sync changes

#### `scripts/sync-global.sh`

1. Keep `ADV_INSTRUCTION_PATH="$REPO_ROOT/ADV_INSTRUCTIONS.md"` as the canonical source path.
2. `sync_adv_prompt_parts()` remains responsible for canonical `adv.md` and provider hint prompt parts only. It does **not** copy `ADV_INSTRUCTIONS.md` into `agent-parts/` — the generator reads `$ADV_INSTRUCTION_PATH` directly. This avoids a redundant second protocol file in `agent-parts/advance/`.
3. `generate_concatenated_provider_prompts()` changes concatenation order to:
   - canonical `adv.md` body
   - `ADV_INSTRUCTIONS.md` content read directly from `$ADV_INSTRUCTION_PATH`
   - provider hint
4. `check_provider_prompt_parts()` expected-content regeneration uses the same 3-part order. It checks the source `ADV_INSTRUCTIONS.md` exists, not a copied prompt part.
5. `check_config()` reverses the global-instruction contract:
   - plugin path still required in `.plugin[]`
   - presence of canonical `$ADV_INSTRUCTION_PATH` in `.instructions[]` is drift: print `✗ instructions: ADV_INSTRUCTIONS.md should not be globally registered`
   - existing stale-global-copy check remains separate for `~/.config/opencode/instructions/ADV_INSTRUCTIONS.md`
6. `fix_config()` changes:
   - new config created with only `plugin: [$plugin]` (no `instructions: [$instr]`)
   - removes canonical `$ADV_INSTRUCTION_PATH` from `.instructions[]`
   - continues removing stale global-copy paths from `.instructions[]`
   - preserves unrelated instructions (identity, rules, shell strategy, etc.)
7. Keep JSONC refusal behavior unchanged.

### Provider eval changes (required)

`scripts/provider-eval.ts` intentionally replicates `sync-global.sh` concatenation (`composeSystemPrompt()`). Update it from canonical+hint to canonical+ADV_INSTRUCTIONS+hint:

- Add `loadAdvInstructions()` reading `$REPO_ROOT/ADV_INSTRUCTIONS.md` or generated equivalent if needed.
- Change `composeSystemPrompt(canonicalContent, instructionContent, hintContent)`.
- Update metric labels/docs if needed so generated-provider-file and selected-agent-runtime-prompt comparisons stay truthful.

### Tests

1. `plugin/src/sync-global.test.ts`
   - replace "checks for ADV instruction in .instructions array" with "rejects canonical ADV_INSTRUCTIONS.md global registration"
   - update minimal config expectation: plugin only, no instructions entry
   - update removal test to include canonical path as well as stale global-copy path
   - update provider-eval model assertion from 2-part to 3-part composition
2. `plugin/src/overlay-sync-assets.test.ts`
   - update stale-concat fixture expectations so `--fix` emits 3-part provider prompts
   - add assertion that generated `agent-parts/advance/adv-gpt.md` contains both canonical marker and an ADV_INSTRUCTIONS-only marker (e.g. `## TDD Protocol (RSTC)`)
3. `plugin/src/adv-instructions-assets.test.ts`
   - keep existing source-file content tests
   - add contract test for source content marker used by sync checks
4. Optional lightweight test: generated non-ADV global agents (`build`, `plan`, `general`) do not contain `## TDD Protocol (RSTC)` or `## Critical Protocols` after sync.

### SETUP docs

Update:

- `--fix` bullet list: remove "Add ADV_INSTRUCTIONS.md to opencode.json instructions[]"; add "Remove legacy ADV_INSTRUCTIONS.md global instruction entries; embed ADV protocol into ADV provider prompts".
- Manual setup example: remove ADV_INSTRUCTIONS.md from `instructions[]`; preserve other user-global instructions.
- Migration note: run `scripts/sync-global.sh --fix`; it removes legacy global entries and regenerates provider prompts.
- Manual setup without provider variants: users who do not configure provider ADV variants are not using ADV provider agents and therefore do not receive ADV_INSTRUCTIONS.md by design. The supported path is sync-global provider prompt setup.

### Cross-agent references (M1)

Policy:

- ADV command files are safe: they are read by ADV agents during workflow execution, and ADV agents receive the full ADV_INSTRUCTIONS body via provider prompt. Section references remain resolvable.
- ADV provider prompts are safe for the same reason.
- `adv-engineer` is an ADV-specialist and may keep references; it also includes the referenced large-scope rule inline.
- Non-ADV global agent prompts must be self-contained. Current `build.md` line 201 already includes the full large-scope rule before the reference; remove the trailing `See ADV_INSTRUCTIONS.md § Large-Scope Validity` from `build.md` (and any generated/overlay equivalent if found) so Build does not depend on hidden ADV context.
- Plan overlay has no ADV_INSTRUCTIONS reference; no change.

### Multi-provider token accounting

Generated files for multiple provider variants each contain ADV_INSTRUCTIONS.md, but OpenCode loads the selected agent's prompt for the active session. The N-provider on-disk duplication is acceptable; runtime prompt cost is paid only by the selected ADV provider agent, not by every non-ADV agent.

### Why not `{file:}` imports?

OpenCode prompt refs in current sync flow use a single generated file (`{file:./agent-parts/advance/adv-{provider}.md}`) because prior multi-ref prompt patterns were explicitly retired and check-mode flags them as drift. Embedding the instruction body into the generated file preserves that working runtime contract and avoids relying on unverified multi-file prompt concatenation.

### Rollback

Revert sync-global.sh + provider-eval + SETUP/test edits. Consumer configs with the old global entry continue working; no persistent ADV state or Temporal data touched.