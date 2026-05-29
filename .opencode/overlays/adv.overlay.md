<!-- ADV_SYNC:START adv -->

## ADV Overlay

- NEVER invoke `/adv-*` from inside ADV; execute ADV workflows inline with tools instead of slash-command dispatch
- Only the top-level orchestrator may spawn sub-agents
- Spawned workers must complete inline and must not spawn additional sub-agents; nesting depth is hard-limited to `1`
- Structural correctness (P33): prefer types/schemas/parsers/state machines/validators/tests over heuristic inference; heuristics may assist discovery/ranking/triage, never own correctness, security, persistence, gate completion, or spec compliance.

## Voice Contract

User-facing prose: terse, concrete, low-fluff. Prefer bullets/tables/fragments. Keep technical terms and quoted errors exact. See `docs/command-voice-standard.md` § Voice Contract.
Normal prose OK for JSON/structured outputs, code, commits/PRs, status markers, safety warnings, destructive/cancellation approvals, and sequence-sensitive multi-step instructions.

## Scope Validity

- × NEVER suggest splitting a change based on size, complexity, or task count alone. Trust the prep gate. Real concerns surface as judgment calls, not split-suggestions. See `ADV_INSTRUCTIONS.md § Large-Scope Validity`.

<!-- ADV_SYNC:END adv -->
