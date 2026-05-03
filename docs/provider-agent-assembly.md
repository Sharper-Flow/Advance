# Provider-ADV Agent Assembly

How ADV generates provider-specific orchestrator variants and how they integrate with `opencode-model-preferences` (OMP).

## Overview

ADV ships one canonical orchestrator source: `.opencode/agents/adv.md`. During `sync-global.sh --fix`, ADV syncs that canonical body to global prompt part `~/.config/opencode/agent-parts/advance/adv.md`, syncs provider hints to `~/.config/opencode/agent-parts/advance/providers/{provider}.md`, generates concatenated prompt parts, and writes generated global provider agents whose markdown bodies contain the canonical ADV prompt plus exactly one provider hint.

| Variant      | Provider         | Hint source                                 | Runtime prompt ref                                              |
| ------------ | ---------------- | ------------------------------------------- | --------------------------------------------------------------- |
| `adv-claude` | Anthropic Claude | `.opencode/agent-parts/providers/claude.md` | `agent-parts/advance/adv-claude.md` (concatenated) |
| `adv-gpt`    | OpenAI GPT       | `.opencode/agent-parts/providers/gpt.md`    | `agent-parts/advance/adv-gpt.md` (concatenated)    |
| `adv-glm`    | Zhipu GLM        | `.opencode/agent-parts/providers/glm.md`    | `agent-parts/advance/adv-glm.md` (concatenated)    |
| `adv-kimi`   | Moonshot Kimi    | `.opencode/agent-parts/providers/kimi.md`   | `agent-parts/advance/adv-kimi.md` (concatenated)   |

## Design Principles

1. **Single source of truth** — `adv.md` remains canonical. Provider stubs do not fork ADV behavior.
2. **Generated runtime bodies** — `adv-{provider}.md` preserves canonical frontmatter/tool allowlists, then embeds the concatenated runtime body directly. OpenCode currently gives markdown agent bodies precedence over JSON `agent.<name>.prompt` when both exist.
3. **Prompt-part composition** — sync still generates a single concatenated file per provider (`adv-{provider}.md` = canonical body + provider hint) under `agent-parts/advance/`. OpenCode `agent.adv-{provider}.prompt` contains one `{file:./agent-parts/advance/adv-{provider}.md}` ref for JSON-only/future runtimes and source-of-truth inspection. Multi-file refs (`{file:A}\n\n{file:B}`) do not resolve at runtime.
4. **Prompt-only key safety** — `prompt` without activation fields (`model`, `disable`, `variant`, `color`) does not activate provider mode or hide generic `adv`.
5. **No duplicate runtime hints** — the plugin runtime does not inject `[ADV:PROVIDER_HINT]`; provider behavior comes only from prompt parts.
6. **Global-only provider state** — Provider-ADV files and prompt refs live in global `opencode.json`. Repo-local `adv.md` stays canonical and git-tracked.

## Sync Behavior

### Generation

`scripts/sync-global.sh` runs provider assembly after copying canonical assets:

1. Copy canonical `adv.md` body to `~/.config/opencode/agent-parts/advance/adv.md`.
2. Copy `.opencode/agent-parts/providers/{provider}.md` to `~/.config/opencode/agent-parts/advance/providers/{provider}.md`.
3. Generate concatenated prompt file `~/.config/opencode/agent-parts/advance/adv-{provider}.md` (canonical body + provider hint).
4. Generate `~/.config/opencode/agents/adv-{provider}.md` from canonical frontmatter/tool allowlist plus the concatenated runtime body.
5. Patch frontmatter `name:` to `adv-{provider}` and optional configured `color:`.
6. Patch `opencode.json` prompt refs:

```json
{
  "agent": {
    "adv-gpt": {
      "prompt": "{file:./agent-parts/advance/adv-gpt.md}"
    }
  }
}
```

### Drift Detection + Runtime Canary

`check_tool_drift` runs for:

- Canonical `adv.md`
- Each generated variant (`adv-claude.md`, `adv-gpt.md`, `adv-glm.md`, `adv-kimi.md`)
- Required prompt parts under `agent-parts/advance/`

Mismatches between `ADV_TOOL_NAMES` and each agent's `tools:` allowlist are reported per file. Missing or stale prompt parts fail `--check`.

`sync-global.sh --check` also runs a runtime canary when `opencode` is on `PATH`: `opencode debug agent adv-{provider}` must resolve a prompt with canonical ADV markers, the matching `<!-- PROVIDER_HINT:{provider} -->`, and no `[ADV:PROVIDER_STUB_UNEXPANDED]` marker. If `opencode` is unavailable, the check reports the skip reason.

### Metrics

`scripts/provider-eval.ts` reports two size planes:

| Metric | Meaning |
| ------ | ------- |
| `generated_provider_file` | Size of generated global `adv-{provider}.md` file, including frontmatter plus embedded runtime body. |
| `selected_agent_runtime_prompt` | Expanded prompt size for selected provider agent: canonical ADV body + exactly one provider hint. Used to estimate model-facing prompt cost. |

## Migration

### Activation

Provider mode is active only when global `opencode.json` contains `agent.adv-*` keys with activation fields: `model`, `disable`, `variant`, or `color`. `prompt` alone is prompt-only sync state and does not count.

When active:

1. Global `adv.md` is removed from `~/.config/opencode/agents/`.
2. Repo-local `.opencode/agents/adv.md` is preserved.
3. `agent.adv.disable: true` is written to `opencode.json` to hide generic `adv` through native OpenCode visibility.

When no provider variants are active, `agent.adv.disable` is removed and canonical `adv` remains visible.

### OMP Role

OMP does not trigger ADV sync. It writes activation fields such as `agent.adv-{provider}.disable` and `agent.adv-{provider}.model`; generated files and prompt parts must already exist from `sync-global.sh --fix`.

## Troubleshooting

| Symptom | Cause | Fix |
| ------- | ----- | --- |
| Provider variants missing after sync | Hint files or prompt-part sync missing | Run `scripts/sync-global.sh --fix`; restore files from git if needed |
| Provider session shows `[ADV:PROVIDER_STUB_UNEXPANDED]` | Stale generated provider agent from the old skinny-stub layout | Run `scripts/sync-global.sh --fix`, restart OpenCode, then run `scripts/sync-global.sh --check` runtime canary |
| Generic `adv` still visible while provider mode active | `agent.adv.disable` not set | Run `sync-global.sh --fix`; confirm activation field exists |
| Generic `adv` hidden with only prompt refs | Prompt-only key counted as activation | Update sync script; prompt-only keys must not activate provider mode |
| Runtime prompt looks duplicated | Plugin runtime injecting provider hints in addition to generated provider body | Ensure runtime `[ADV:PROVIDER_HINT]` injection is removed; generated variants are the only provider-hint source |
