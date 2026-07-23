# Acceptance

Reviewed at: 2026-07-23T16:20:01.295Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | **SC1** A piped command whose first stage fails (e.g. `false | true`) is classified and recorded as `failed` (exitCode != 0), not `passed`. | pass | Engineer report: false | true now classified failed. GREEN tr_mrxpkdux_8fa8abc8. |
| SC2 | success_criterion | **SC2** Non-piped command classification is unchanged: succeeding → `passed`, failing → `failed`. | pass | Non-piped unchanged: true->passed, false->failed. VERIFY tr_mrxplsrm_c295e2fe (28 passed). |
| SC3 | success_criterion | **SC3** The fix does not alter the user-supplied command string semantics, the timeout/spawn-detach/maxBuffer plumbing, or output shaping. | pass | cwd/detached/windowsHide/env/output-shaping preserved; Windows branch unchanged. Design validated. |
| AC1 | acceptance_criterion | **AC1** Regression test (red→green): `false | true` currently yields `passed` (exit 0); after the fix it yields `failed` (exitCode != 0). Pinned by test. | pass | RED tr_mrxpjy7u_f7813cbf -> GREEN tr_mrxpkdux_8fa8abc8. |
| AC2 | acceptance_criterion | **AC2** `true | true` remains `passed`; non-piped `false` remains `failed`; non-piped `true` remains `passed`. | pass | true|true -> passed; non-piped false -> failed; non-piped true -> passed. VERIFY tr_mrxplsrm_c295e2fe. |
| AC3 | acceptance_criterion | **AC3** Windows behavior remains correct (pipefail gated to POSIX shells; no regression on the Windows spawn path). | pass | Windows guarded by isWindows; masking + quoted/semicolon cases covered. tr_mrxplsrm_c295e2fe. |
| C1 | constraint | **C1** No rewriting of the user-supplied command string that changes its semantics — only the shell's failure-propagation mode may change. | respected | Only 'set -o pipefail; ' prepended; command semantics unaltered. |
| C2 | constraint | **C2** Change localized to `plugin/src/tools/test.ts` spawn invocation + tests. | respected | Change localized to test.ts spawn + test.test.ts. |
| C3 | constraint | **C3** Preserve existing timeout, detached-process, maxBuffer, and output-shaping behavior. | respected | timeout/detached/maxBuffer/shaping options unchanged. |
| OOS1 | out_of_scope | Changing how `exitCode` maps to `passed`/`failed` (that logic is correct). | missing |  |
| OOS2 | out_of_scope | Adding pipefail awareness to `bin/oc-test` or other runners. | missing |  |
| DONT1 | avoidance | Do not silently prepend/append commands that alter pipeline semantics (e.g. adding `tee` that masks failure). | pass | No silent command rewriting: only 'set -o pipefail; ' prefix; no tee/subshell insertion. Verified in diff (test.ts:274). |

