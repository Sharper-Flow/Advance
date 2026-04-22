# Provider-ADV Smoke Checklist

Run after `scripts/sync-global.sh --fix` and OMP apply.

## Sync Generation

- [ ] `adv-claude.md` exists in `~/.config/opencode/agents/`
- [ ] `adv-gpt.md` exists in `~/.config/opencode/agents/`
- [ ] `adv-glm.md` exists in `~/.config/opencode/agents/`
- [ ] `adv-kimi.md` exists in `~/.config/opencode/agents/`
- [ ] Each variant contains `name: adv-{provider}` in frontmatter
- [ ] Each variant contains `<!-- PROVIDER_HINT:{provider} -->` after ADV overlay block

## Legacy Migration

- [ ] When `opencode.json` has NO `agent.adv-*` keys: canonical `adv.md` is preserved
- [ ] When `opencode.json` HAS `agent.adv-*` keys: canonical `adv.md` is removed from global agents

## OMP Schema/Apply

- [ ] `omp-preferences.json` can store `adv_providers` with `enabled` + `model`
- [ ] `ApplyPreferences` writes `agent.adv-{provider}.disable` to `opencode.json`
- [ ] `ApplyPreferences` writes `agent.adv-{provider}.model` to `opencode.json` when non-empty
- [ ] Only `adv-claude`, `adv-gpt`, `adv-glm`, `adv-kimi` are valid provider names
- [ ] `adv`, `build`, `plan` remain unmapped (no model override)

## OMP TUI

- [ ] "ADV Provider Agents" section appears in assignments list
- [ ] Provider variants show "enabled" or "disabled" status
- [ ] `e` key toggles enable/disable for selected provider variant
- [ ] `enter`/`m` opens model picker for provider variants
- [ ] `a` applies all preferences (including provider disable states) to `opencode.json`

## Drift Checks

- [ ] `sync-global.sh --check` validates tool allowlist for canonical `adv.md`
- [ ] `sync-global.sh --check` validates tool allowlist for all 4 provider variants
