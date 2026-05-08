# Caveman-compress ADV instruction surfaces

## Intent

Reduce ADV agent-facing instruction prose load by applying existing prose-load reduction templates plus terse/caveman-lite voice to the largest/high-friction instruction surface, without changing behavior, gates, tool contracts, or safety boundaries.

## Scope

- Document how terse/caveman-lite voice composes with existing `docs/command-voice-standard.md § Prose-Load Reduction Rules`.
- Compress `ADV_INSTRUCTIONS.md` only.
- Update `.opencode/token-budgets.json` baseline to post-compression line count if compression succeeds.
- Add or adjust targeted asset tests that preserve critical ADV contract phrases.
- Run focused verification and global asset sync check.

## Success Criteria

- [ ] `docs/command-voice-standard.md` defines how caveman/terse voice composes with prose-load reduction rules for agent-facing prose.
- [ ] `ADV_INSTRUCTIONS.md` is shorter and remains under the hard line guard.
- [ ] Tests verify critical ADV contract phrases still exist.
- [ ] `scripts/sync-global.sh --check` passes after sync.
- [ ] No runtime code, schema, or state behavior changes are introduced.

## Out of Scope

- Public docs full rewrite.
- Runtime behavior changes.
- JSON/code/example compression.
- Changes to tool calls, enum values, command syntax, gates, or approval policy.
- New competing compression methodology separate from existing prose-load infrastructure.