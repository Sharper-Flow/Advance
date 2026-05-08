## Objectives

1. ADV_INSTRUCTIONS.md content is paid for only by ADV-agent sessions (`adv-claude`, `adv-glm`, `adv-gpt`, `adv-kimi`, future variants).
2. Non-ADV sessions (`build`, `plan`, `general`, `librarian`, `explore`, `mechanic`, `prioritizer`) do not load ADV_INSTRUCTIONS.md content into their system prompt.
3. Existing consumers migrate cleanly via `scripts/sync-global.sh --fix` — no manual config edits required.
4. ADV agent functional parity is verifiable via existing asset tests plus new contract tests.

## Acceptance Criteria

| AC | Verification |
|---|---|
| AC-1 | `~/.config/opencode/agent-parts/advance/adv-{provider}.md` files contain ADV_INSTRUCTIONS.md content embedded between canonical body and provider hint |
| AC-2 | `opencode.json` `instructions[]` does not contain ADV_INSTRUCTIONS.md path after `--fix` |
| AC-3 | `sync-global.sh --check` reports clean state when instructions[] is absent and concat prompts contain embedded body |
| AC-4 | `sync-global.sh --fix` removes ADV_INSTRUCTIONS.md from instructions[] and regenerates concat prompts in one pass |
| AC-5 | Existing ADV_INSTRUCTIONS source-file content tests still pass |
| AC-6 | New contract test asserts ADV_INSTRUCTIONS content in ADV concat prompt and absent from non-ADV global agent prompt surfaces |
| AC-7 | SETUP.md updated: no global instructions[] addition step; migration note present |
| AC-8 | Cross-agent references resolved per design: ADV-only references allowed; non-ADV prompt refs self-contained |
| AC-9 | `pnpm test` + `pnpm run check` clean |
| AC-10 | Token reduction measurable: synthetic non-ADV config no longer includes ~66KB ADV_INSTRUCTIONS.md global instruction payload |

## Out of Scope

- Restructuring ADV_INSTRUCTIONS.md content
- Changing 7-gate model, ADV tool surface, or agent architecture
- Reorganizing skills, commands, or rules.yaml
- Force-migration: old configs are corrected by `--fix`, not by breaking runtime