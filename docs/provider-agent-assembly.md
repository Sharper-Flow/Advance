# Provider-ADV Runtime Hints

How ADV keeps one canonical orchestrator agent while preserving provider-specific guidance.

## Overview

ADV exposes one runtime orchestrator agent: `adv`.

`scripts/deploy-local.sh --fix` assembles global `~/.config/opencode/agents/adv.md` from:

1. repo canonical `.opencode/agents/adv.md`
2. repository `ADV_INSTRUCTIONS.md`

Provider-specific guidance is no longer stored in generated `adv-claude`, `adv-gpt`, `adv-glm`, or `adv-kimi` agent files. The plugin injects provider hints at runtime through the existing single-system-block path in `plugin/src/utils/system-block.ts`.

```text
global adv.md = canonical ADV body + ADV_INSTRUCTIONS.md
runtime system block = optional [ADV:PROVIDER_HINT:{provider}] section
```

## Design Principles

1. **One selectable ADV agent** — users run `adv`; provider identity comes from model/provider context, not agent names.
2. **Scoped ADV protocol** — `ADV_INSTRUCTIONS.md` is embedded only into the ADV runtime agent, not global `opencode.json instructions[]`.
3. **Runtime provider hints** — known structured provider/model identities may emit one provider hint in `output.system[0]`.
4. **No generated provider agents** — `adv-{provider}.md` files are retired and not compatibility aliases.
5. **No heuristic provider guessing** — unknown or missing provider/model identity emits no provider hint.
6. **Manual migration** — user-owned `agent.adv-{provider}` config is cleaned up once by the user, not auto-migrated by sync.

## Runtime Hint Mapping

Provider hint source markdown remains in `.opencode/agent-parts/providers/{provider}.md` as repo data and documentation source. Runtime constants in `system-block.ts` mirror those small hints.

| Hint | Structured identity examples | Behavior |
| --- | --- | --- |
| `claude` | `anthropic` | Emit Claude provider guidance |
| `gpt` | `openai` | Emit GPT provider guidance |
| `glm` | `zai`, `z-ai`, `zai-coding-plan` | Emit GLM provider guidance |
| `kimi` | `moonshot`, `moonshotai`, `kimi` | Emit Kimi provider guidance when structurally identifiable |

If a model is routed through a provider that does not expose model identity to the system transform, ADV must not infer the hint from free text. It emits no hint until structured identity is available.

## Sync Behavior

`scripts/deploy-local.sh --fix` now:

1. Copies commands, agents, overlays, and skills as before.
2. Writes one complete global `adv.md` runtime agent.
3. Keeps `ADV_INSTRUCTIONS.md` absent from global `instructions[]`.
4. Removes stale generated `adv-{provider}.md` files from global agents.
5. Removes retired concatenated provider prompt files `agent-parts/advance/adv-{provider}.md` when present.
6. Does not write `agent.adv-{provider}.prompt` refs.
7. Does not set `agent.adv.disable` because of retired provider variants.

## Metrics

`scripts/provider-eval.ts` reports size planes aligned to the single-agent architecture:

| Metric | Meaning |
| --- | --- |
| `canonical_adv_prompt` | Canonical ADV agent body without frontmatter |
| `adv_protocol_instructions` | `ADV_INSTRUCTIONS.md` body embedded into `adv.md` |
| `provider_hint` | Provider hint payload when available |
| `selected_agent_runtime_prompt` | Single ADV runtime prompt plus one runtime hint |
| `avoided_provider_variant_duplication` | Retired generated provider file size if a stale file is still present |

Generated provider files are no longer canonical prompt sources.

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
