# Provider-ADV Runtime Hints

How ADV keeps one canonical orchestrator agent while provider-specific guidance is handled by a standalone plugin.

## Overview

ADV exposes one runtime orchestrator agent: `adv`.

`scripts/deploy-local.sh --fix` writes global `~/.config/opencode/agents/adv.md` from the repo lean canonical runtime prompt at `.opencode/agents/adv.md`.

`ADV_INSTRUCTIONS.md` remains the full developer/reference protocol. It is not appended wholesale into the runtime agent; removed or compressed runtime protocol is tracked through `docs/adv-runtime-protocol-coverage.md`, specs, tests, and command contracts.

Provider-specific guidance is injected by the standalone **opencode-provider-hints** plugin (`~/toolbox/plugins/opencode-provider-hints/`), which registers its own `experimental.chat.system.transform` hook independently from ADV. ADV's system block does not emit provider hints or provider switch markers.

```text
global adv.md = lean canonical runtime prompt
runtime system block = ADV domain sections only (degraded, health, worktree, activeChange, wisdom)
provider hints = emitted by opencode-provider-hints plugin, prepended to output.system[0]
```

## Design Principles

1. **One selectable ADV agent** — users run `adv`; provider identity comes from model/provider context, not agent names.
2. **Scoped ADV protocol** — ADV runtime protocol is preserved in lean `adv.md` or covered by specs/tests/command contracts; `ADV_INSTRUCTIONS.md` is not global `opencode.json instructions[]` and is not appended wholesale into runtime `adv.md`.
3. **Standalone provider hints plugin** — provider hints are injected by `opencode-provider-hints`, registered before ADV in `opencode.jsonc` for correct injection order.
4. **No provider code in ADV** — ADV's system block contains no provider hint or provider switch sections; `currentProviderID` and `lastProviderID` are not tracked by ADV.
5. **No generated provider agents** — `adv-{provider}.md` files are retired and not compatibility aliases.
6. **No heuristic provider guessing** — unknown or missing provider/model identity emits no provider hint.
7. **Manual migration** — user-owned `agent.adv-{provider}` config is cleaned up once by the user, not auto-migrated by sync.

## Runtime Hint Mapping

Provider hint source markdown lives in `~/toolbox/plugins/opencode-provider-hints/providers/{provider}.md`. The standalone plugin reads these at runtime and injects matching hints.

| Hint | Structured identity examples | Behavior |
| --- | --- | --- |
| `claude` | `anthropic` | Emit Claude provider guidance |
| `gpt` | `openai` | Emit GPT provider guidance |
| `glm` | `zai`, `z-ai`, `zai-coding-plan` | Emit GLM provider guidance |
| `kimi` | `moonshot`, `moonshotai`, `kimi` | Emit Kimi provider guidance when structurally identifiable |
| `minimax` | `minimax`, `minimax-coding-plan` | Emit MiniMax provider guidance |
| `qwen` | `openrouter`, `dashscope` | Emit Qwen provider guidance |

If a model is routed through a provider that does not expose model identity to the system transform, the plugin emits no hint until structured identity is available.

## Sync Behavior

`scripts/deploy-local.sh --fix` now:

1. Copies commands, agents, overlays, and skills as before.
2. Writes one complete global `adv.md` runtime agent.
3. Keeps `ADV_INSTRUCTIONS.md` absent from global `instructions[]`.
4. Removes stale generated `adv-{provider}.md` files from global agents.
5. Removes retired concatenated provider prompt files `agent-parts/advance/adv-{provider}.md` when present.
6. Does not write `agent.adv-{provider}.prompt` refs.
7. Does not set `agent.adv.disable` because of retired provider variants.

Provider hint deployment is handled by `~/toolbox/scripts/deploy-provider-hints.sh`, not by ADV's deploy-local.sh.

## Metrics

`scripts/provider-eval.ts` reports size planes aligned to the single-agent architecture:

| Metric | Meaning |
| --- | --- |
| `lean_adv_runtime_prompt` | Lean canonical ADV runtime prompt without frontmatter |
| `adv_reference_protocol` | Full `ADV_INSTRUCTIONS.md` reference protocol size, not embedded into runtime `adv.md` |
| `provider_hint` | Provider hint payload from standalone plugin when available |
| `adv_dynamic_system_block_estimate` | Estimated ADV runtime banner/status additions appended to `output.system[0]` |
| `caveman_voice_contract_allowance` | Reporting allowance for caveman voice contract when that plugin is active |
| `selected_agent_runtime_prompt` | Single ADV runtime prompt plus one runtime hint |
| `avoided_provider_variant_duplication` | Retired generated provider file size if a stale file is still present |

Provider hint content is now sourced from `~/toolbox/plugins/opencode-provider-hints/providers/`, not from ADV's `.opencode/agent-parts/providers/`.

## Manual One-Time Migration

After updating and running `scripts/deploy-local.sh --fix`, manually clean old provider-agent config if present:

1. Edit global `~/.config/opencode/opencode.json` or `opencode.jsonc`.
2. Remove `agent.adv-claude`, `agent.adv-gpt`, `agent.adv-glm`, and `agent.adv-kimi` entries.
3. Remove `agent.adv.disable` if it only existed to hide generic `adv` during provider-variant mode.
4. Confirm stale files are gone from `~/.config/opencode/agents/adv-{provider}.md`.
5. Restart OpenCode. Config and agent files are loaded at process start.

`deploy-local.sh` intentionally does not auto-migrate user-owned provider-agent config, because those keys may encode model-routing preferences that require human review.

## OMP Follow-Up

OMP per-phase routing is future work, not part of this architecture change.

The single-agent architecture makes a later routing model cleaner because ADV identity is no longer encoded in agent names. A future OMP design can map ADV phases to models, for example:

```yaml
adv:
  proposal: anthropic/claude-...
  discovery: openai/gpt-...
  execution: moonshotai/kimi-...
  review: z-ai/glm-...
```

That follow-up needs separate schema, UX, fallback, and auditability decisions.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `adv-claude` / `adv-gpt` still appears selectable | Stale global agent file or config key remains | Remove `agent.adv-{provider}` config, run `scripts/deploy-local.sh --fix`, restart OpenCode |
| Generic `adv` hidden | Stale `agent.adv.disable` from provider-variant mode | Remove `agent.adv.disable`, restart OpenCode |
| No provider hint appears | Provider/model identity is unknown or unsupported | Expected safe fallback; add structured identity support in a follow-up if needed |
| Runtime prompt has multiple system messages | Plugin bug | Ensure provider hints are appended through `output.system[0]` only |
