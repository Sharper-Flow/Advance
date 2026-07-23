# Contract Traceability

**Change ID:** fixAdvRunTestPipefailFalse
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-23T16:20:01.295Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Engineer report: false | true now classified failed. GREEN tr_mrxpkdux_8fa8abc8. |
| SC2 | success_criterion | pass | review | Non-piped unchanged: true->passed, false->failed. VERIFY tr_mrxplsrm_c295e2fe (28 passed). |
| SC3 | success_criterion | pass | review | cwd/detached/windowsHide/env/output-shaping preserved; Windows branch unchanged. Design validated. |
| AC1 | acceptance_criterion | pass | test | RED tr_mrxpjy7u_f7813cbf -> GREEN tr_mrxpkdux_8fa8abc8. |
| AC2 | acceptance_criterion | pass | test | true|true -> passed; non-piped false -> failed; non-piped true -> passed. VERIFY tr_mrxplsrm_c295e2fe. |
| AC3 | acceptance_criterion | pass | test | Windows guarded by isWindows; masking + quoted/semicolon cases covered. tr_mrxplsrm_c295e2fe. |
| C1 | constraint | respected | static_check | Only 'set -o pipefail; ' prepended; command semantics unaltered. |
| C2 | constraint | respected | static_check | Change localized to test.ts spawn + test.test.ts. |
| C3 | constraint | respected | static_check | timeout/detached/maxBuffer/shaping options unchanged. |
| OOS1 | out_of_scope | missing | not_applicable |  |
| OOS2 | out_of_scope | missing | not_applicable |  |
| DONT1 | avoidance | pass | review | No silent command rewriting: only 'set -o pipefail; ' prefix; no tee/subshell insertion. Verified in diff (test.ts:274). |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-56464d214fe2 | AC1, AC2, AC3, SC1, SC2, SC3, C1, C2, C3 | AC1, AC2, AC3 |  |  |
