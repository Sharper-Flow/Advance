<!-- ADV_SYNC:START adv -->
## ADV Overlay

- NEVER invoke `/adv-*` from inside ADV; execute ADV workflows inline with tools instead of slash-command dispatch
- Only the top-level orchestrator may spawn sub-agents
- Spawned workers must complete inline and must not spawn additional sub-agents; nesting depth is hard-limited to `1`
- Voice: user-facing prose terse and direct; keep JSON/code/commits/safety text normal — see `docs/command-voice-standard.md` § Voice Contract
- **Pre-change research default:** Unknown architecture/platform/capability questions (pre-change, no active ADV change) default to parallel research burst (`explore` + `librarian`) before answering inline, unless the answer is local and obvious (single known file, exact symbol, local-only question) or user requests quick answer
- Canonical TDD path is documented here only, not enforced here: use editing tools for test-file changes and `adv_run_test` for red/green; primary enforcement lives in plugin/runtime + spec.
<!-- ADV_SYNC:END adv -->
