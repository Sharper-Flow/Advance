# Provider-ADV Smoke Checklist

Run after `scripts/sync-global.sh --fix` and after any manual provider-agent config cleanup.

## Single ADV Runtime Agent

- [ ] `~/.config/opencode/agents/adv.md` exists
- [ ] global `adv.md` contains canonical `## ADV Overlay`
- [ ] global `adv.md` contains ADV protocol markers such as `### TDD Protocol (RSTC)`
- [ ] global `adv.md` does **not** contain `<!-- PROVIDER_HINT:` markers
- [ ] `ADV_INSTRUCTIONS.md` is absent from global `opencode.json instructions[]`

## Retired Provider Agents

- [ ] `~/.config/opencode/agents/adv-claude.md` is absent
- [ ] `~/.config/opencode/agents/adv-gpt.md` is absent
- [ ] `~/.config/opencode/agents/adv-glm.md` is absent
- [ ] `~/.config/opencode/agents/adv-kimi.md` is absent
- [ ] `opencode.json` does not contain `agent.adv-{provider}.prompt` keys written by ADV sync
- [ ] `sync-global.sh --fix` removes stale generated provider files instead of recreating them

## Runtime Provider Hints

- [ ] `plugin/src/utils/system-block.test.ts` covers known provider hint emission
- [ ] known structured provider identity emits exactly one matching `<!-- PROVIDER_HINT:{provider} -->`
- [ ] unknown or missing provider/model identity emits no provider hint
- [ ] provider hints are appended through `output.system[0]`; no extra system entry is pushed
- [ ] Kimi/model-specific hints are emitted only when structurally identifiable

## Manual Migration

- [ ] Remove `agent.adv-claude`, `agent.adv-gpt`, `agent.adv-glm`, and `agent.adv-kimi` from global config if present
- [ ] Remove `agent.adv.disable` if it only existed for retired provider-variant mode
- [ ] Restart OpenCode after config or agent-file changes
- [ ] Confirm only `adv` is used for ADV orchestration

## OMP Follow-Up Boundary

- [ ] OMP per-phase routing is treated as future work
- [ ] No current smoke step requires provider-specific ADV agent names
- [ ] Model/provider preference UX does not rely on `adv-{provider}` aliases

## Metrics

- [ ] Provider eval reports `canonical_adv_prompt`
- [ ] Provider eval reports `adv_protocol_instructions`
- [ ] Provider eval reports `provider_hint`
- [ ] Provider eval reports `selected_agent_runtime_prompt`
- [ ] Provider eval reports `avoided_provider_variant_duplication` when stale retired files are measurable
- [ ] Provider eval does not require generated `adv-{provider}.md` files as canonical prompt sources

## Drift Checks

- [ ] `sync-global.sh --check` validates tool allowlist for canonical `adv.md`
- [ ] `sync-global.sh --check` does not validate retired provider variant allowlists
- [ ] `bash -n scripts/sync-global.sh` passes
