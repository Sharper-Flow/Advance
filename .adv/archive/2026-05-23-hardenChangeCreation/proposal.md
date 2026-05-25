## Why

`adv_change_create` exposes many conditional optional fields in one flat schema. LLM agents routinely send placeholder values (`""`, `0`, `"none"`, `"transcript"`) instead of omitting optional fields. The current validation rejects these correctly but does not help the agent recover — the error surface lists problems but doesn't show the minimal valid payload. This creates repeated retry loops that look like hangs/crashes to users.

The trigger: a PokeEdge Geist typography proposal session where the agent cycled through placeholder combinations for ~6 attempts despite valid proposal content and problem statement.

## What Changes

1. Harden placeholder-sensitive ADV mutation tool arguments across ADV tools.
2. Keep `adv_change_create` minimal ad hoc creation reliable and discoverable.
3. Preserve strict semantics for origin, issue, lineage, path, task, gate, command, and approval-audit fields.
4. Add shared preflight/normalization policy, canonical retry diagnostics, and regression tests.

### In Scope

- Placeholder-sensitive ADV mutation tool argument preprocessing and validation, anchored by `adv_change_create` and extended to same-shape ADV tool traps
- `plugin/src/utils/tool-arg-preflight.ts` and `plugin/src/tool-registry.ts`
- Tool guidance/error diagnostics for canonical minimal ad hoc payloads
- Regression tests in `plugin/src/tools/*` and `plugin/src/utils/tool-arg-preflight.test.ts`
- Spec-law requirements for minimal ad hoc creation, all-tools placeholder policy, and single-source preflight validation

### Out of Scope

- Changing seven-gate lifecycle semantics
- Weakening issue-claim protections for roadmap-origin changes
- Allowing invalid origin linkage data to persist silently
- Replacing Temporal-backed change creation
- Splitting `adv_change_create` into mode-specific tools in this change

### Must Not

- Must not treat `origin_issue_number: 0` as a valid issue claim
- Must not persist blank artifact files
- Must not retain invalid adhoc origin linkage
- Must not make cross-project mutation or approval evidence less auditable
- Must not hide real validation errors

## Success Criteria

- [ ] Minimal ad hoc `adv_change_create` works with `summary` plus optional `capability`, `proposal`, and `problemStatement`
- [ ] Placeholder-heavy payloads resolve deterministically by explicit field policy: reject, omit, or allow
- [ ] Origin/linkage rules remain strict
- [ ] Cross-project/lineage placeholders are handled structurally
- [ ] Representative placeholder traps across ADV tools are covered by tests
- [ ] Tool guidance includes canonical minimal create payload

## Discovery Findings

Discovery found no blocking ambiguity. User broadened scope to placeholder-sensitive handling “across all tools”. Existing specs `rq-backlogCoord08` and `rq-toolArgBlankArtifactLinkage01` constrain the solution. External docs indicate MCP/OpenAI tool calls rely on JSON Schema/descriptions, while Zod transforms are not a sufficient correctness surface. Same-shape traps exist across task, wisdom, gate, change close/reenter, run-test, worktree, conformance, agenda, and target-path users.
