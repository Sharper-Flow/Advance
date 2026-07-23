# Executive Summary — fixAdvRunTestPipefailFalse

## Outcome
`adv_run_test` no longer records false-green TDD evidence for piped commands. A failing runner masked by a succeeding pipeline stage (e.g. `failing | tail`) is now correctly classified `failed` instead of `passed`.

## Why it matters
False-green evidence silently broke the `rq-TDD009seq` red→green contract — a red run could be persisted as green, undermining trust in all task-completion evidence. The root cause was the shell invocation (`/bin/sh` via `shell:true`), which lacks `pipefail` and reports a pipeline's last-stage exit code; ADV's own exitCode→passed classification was correct.

## What was built
- `plugin/src/tools/test.ts:274` — non-Windows commands now spawn via `bash -c "set -o pipefail; <command>"` (shell:false); Windows stays on `shell:true`. cwd/detached/windowsHide/env/output-capture/maxBuffer/shaping all preserved.
- `plugin/src/tools/test.test.ts:656` — 3 tests: failing-pipe → failed; explicit `|| true` masking → passed (documented intent); quoted/semicolon command preserved.

## What was verified
- Independent design validation (adv-researcher APPROVE_WITH_FINDINGS, refinements folded in).
- Typed TDD: RED `tr_mrxpjy7u` → GREEN `tr_mrxpkdux` → VERIFY `tr_mrxplsrm` (full file, 28 passed via `bin/oc-test targeted`).
- Typecheck + ESLint on touched files clean. Checkpoint `432ae2d`.

## Risks / follow-ups
- Low. Localized spawn-shell change. Intentional tradeoff: switching `/bin/sh`→`bash` adopts bash shell semantics (documented); pipefail makes SIGPIPE patterns fail (correct for evidence integrity).
- Edge: host without bash → existing `spawn_error` handling covers it.
- Related: #304 (raw `pnpm test` hangs on heavy replay files — engineer used targeted `vitest -t` filters, which is the right pattern).