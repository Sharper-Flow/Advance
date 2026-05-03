# Provider-ADV Smoke Checklist

Run after `scripts/sync-global.sh --fix` and OMP apply.

## Sync Generation

- [ ] `adv-claude.md` exists in `~/.config/opencode/agents/`
- [ ] `adv-gpt.md` exists in `~/.config/opencode/agents/`
- [ ] `adv-glm.md` exists in `~/.config/opencode/agents/`
- [ ] `adv-kimi.md` exists in `~/.config/opencode/agents/`
- [ ] Each variant contains `name: adv-{provider}` in frontmatter
- [ ] Each variant contains `[ADV:PROVIDER_STUB_UNEXPANDED]`
- [ ] Each variant does NOT contain canonical `## ADV Overlay`
- [ ] Each variant does NOT contain `<!-- PROVIDER_HINT:{provider} -->`

## Prompt Parts

- [ ] `~/.config/opencode/agent-parts/advance/adv.md` exists
- [ ] `~/.config/opencode/agent-parts/advance/adv.md` contains canonical ADV body
- [ ] `~/.config/opencode/agent-parts/advance/providers/{provider}.md` exists for each provider
- [ ] `~/.config/opencode/agent-parts/advance/providers/{provider}.md` contains `<!-- PROVIDER_HINT:{provider} -->`
- [ ] `opencode.json` has `agent.adv-{provider}.prompt` with `{file:./agent-parts/advance/adv.md}`
- [ ] `opencode.json` has `agent.adv-{provider}.prompt` with `{file:./agent-parts/advance/providers/{provider}.md}`

## Legacy Migration

- [ ] When `opencode.json` has NO active `agent.adv-*` keys: canonical `adv.md` is preserved globally and visible
- [ ] When `opencode.json` has only prompt-only `agent.adv-*` keys: provider mode is NOT active
- [ ] When `opencode.json` HAS active `agent.adv-*` keys: canonical global `adv.md` is removed from global agents
- [ ] When `opencode.json` HAS active `agent.adv-*` keys: repo-local `.opencode/agents/adv.md` is preserved
- [ ] When `opencode.json` HAS active `agent.adv-*` keys: `agent.adv.disable: true` is set in `opencode.json`
- [ ] When `opencode.json` has NO active `agent.adv-*` keys: `agent.adv.disable` is removed if present

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
- [ ] `a` applies all preferences, including provider disable states, to `opencode.json`

## Metrics

- [ ] Provider eval reports `generated_provider_file`
- [ ] Provider eval reports `selected_agent_runtime_prompt`
- [ ] `generated_provider_file` size reflects skinny stub bytes/lines
- [ ] `selected_agent_runtime_prompt` includes canonical body plus exactly one provider hint

## Drift Checks

- [ ] `sync-global.sh --check` validates tool allowlist for canonical `adv.md`
- [ ] `sync-global.sh --check` validates tool allowlist for all 4 provider variants
- [ ] `sync-global.sh --check` fails when required `agent-parts/advance/` files are missing
