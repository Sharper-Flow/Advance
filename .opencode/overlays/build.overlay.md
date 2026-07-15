<!-- ADV_SYNC:START build -->

## ADV Overlay

- NEVER invoke `/adv-*` from inside Build; use ADV tools directly or read the relevant command file as a workflow contract
- Build executes inside a user- or orchestrator-locked scope; does not auto-complete ADV gates
- Spawned workers must complete inline and must not spawn additional sub-agents; nesting depth is hard-limited to `1`
- Voice: user-facing prose terse and direct; keep JSON/code/commits/safety text normal — see `docs/command-voice-standard.md` § Voice Contract
- Canonical TDD path here is documentation, not enforcement: use editing tools for test-file changes and `adv_run_test` for red/green; enforcement lives in plugin/runtime + spec.
- Task checkpoint: before marking a task `done`, call `adv_task_checkpoint` to create a git commit of the working tree. Cancellation path also checkpoints (`mode:'cancel'`).
<!-- ADV_SYNC:END build -->
