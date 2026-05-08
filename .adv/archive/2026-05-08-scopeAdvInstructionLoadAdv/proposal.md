## Cross-Project Origin

This change was created as a follow-up from **scratch**.

| Field | Value |
|-------|-------|
| Source project | scratch |
| Source path | `/home/jrede/scratch` |

> **Note:** The originating project should be consulted for context on why this change is needed.

## Proposal

Redesign the ADV instruction-loading contract so that the cost of `ADV_INSTRUCTIONS.md` is paid only by sessions that actually use ADV agents or tools.

This is a problem-statement-and-direction proposal. Concrete mechanism is deferred to `/adv-design` — multiple viable implementations exist (per-agent prompt `{file:}` imports, agent-scoped instruction routing, conditional load via project context, etc.) and the right choice depends on OpenCode's instruction-loading model and the current state of the agent-parts overlay system.

## Success Criteria

1. **Non-ADV sessions:** `build`, `plan`, `general`, `librarian`, `explore`, `mechanic`, `prioritizer`, and other non-ADV agents do not load `ADV_INSTRUCTIONS.md` content into their system prompt.
2. **ADV sessions:** ADV agents (`adv-claude`, `adv-glm`, `adv-gpt`, `adv-kimi`, and future variants) continue to receive the full ADV operating protocol with zero functional regression — gate workflows, status markers, MCP tool contracts, sub-agent dispatch rules, and skill creation/discovery all keep working.
3. **Setup coherence:** `SETUP.md` provides clear, current installation instructions that match the new model. No instruction sets users to do something that conflicts with the new contract.
4. **Test coherence:** All existing tests reach a coherent steady state — either updated to reflect the new contract or removed if obsolete. No silent skips.
5. **Backward compatibility:** Existing consumer setups with `ADV_INSTRUCTIONS.md` in global `instructions[]` either continue to work or get a clear migration path. Consumers should not silently break.
6. **Token reduction is measurable:** A pre/post comparison shows the expected token-cost reduction in non-ADV agent prompts. Target: ≥15k tokens per non-ADV session.
7. **Overlay integrity:** `agent-parts/advance/adv-*.md` overlays continue to reference `ADV_INSTRUCTIONS.md` sections correctly under the new model.

## Scope

| Surface | Expected change |
|---|---|
| `SETUP.md` | Update install instructions for new contract |
| `plugin/src/adv-instructions-assets.test.ts` | Replace always-on assertion with new contract test |
| `scripts/sync-global.sh` | Update to thread `ADV_INSTRUCTIONS.md` only into ADV agent prompts; remove from global `instructions[]` patching |
| `agent-parts/advance/adv-*.md` | Either inline the protocol body or `{file:}`-import explicitly |
| `~/.config/opencode/agents/adv-*.md` (managed by sync) | Receive ADV protocol via per-agent route |
| `~/.config/opencode/opencode.json` (consumer side) | Migration: optional auto-remove vs manual deprecation note |
| `cost-governance.md` (parallel question) | Decide whether to scope alongside ADV_INSTRUCTIONS.md or keep separate |

Concrete file count and edit shape are determined in `/adv-design`. The mechanism choice (per-agent imports / agent-scoped routing / conditional load) drives this surface set.

## Out of Scope

- Restructuring `ADV_INSTRUCTIONS.md` content
- Changing the 7-gate model, ADV tool surface, or agent architecture
- Reorganizing skills, commands, or rules.yaml
- Multi-project or multi-session coordination changes
- Forcing existing consumers to migrate (back-compat is a success criterion)

## Error Handling and Rollback

| Failure mode | Detection | Mitigation |
|---|---|---|
| Non-ADV agent suddenly needs ADV context (rare follow-on bug) | Manual report; agent emits `[ADV:BLOCKED]` | Re-add `ADV_INSTRUCTIONS.md` to that agent's prompt path manually; document in SETUP.md |
| ADV agent loses protocol fidelity (parity regression) | Asset/contract test fails in CI; functional regression in 7-gate flow | Revert sync-global.sh patch; rebuild dist; restart sessions |
| Consumer setup breaks on update | Setup-test script fails; user opens issue | Migration path documented in SETUP.md; sync-global.sh detects old config and warns rather than overwriting |
| Sync drift (ADV agents have stale protocol after update) | `sync-global.sh --check` reports drift | Run `sync-global.sh --fix`; same recovery path as today |

Rollback is mechanical: revert the sync-global.sh patch + asset test changes, and existing consumer configs continue working unchanged. No data migration required (all changes are config + prompt files; no persistent state involved).

## Open Questions (deferred to design)

- Mechanism: per-agent `{file:}` import vs OpenCode-native agent-scoped instruction routing vs conditional load?
- Should `cost-governance.md` follow the same scoping or stay always-on?
- Migration: do existing consumer `instructions[]` entries get auto-removed by `sync-global.sh`, or is migration manual with a deprecation warning?
- Does `agents/adv-engineer.md` (used by both ADV and general delegation) need ADV context, or only when invoked from ADV?

## Linked GitHub issue

Sharper-Flow/Advance#72