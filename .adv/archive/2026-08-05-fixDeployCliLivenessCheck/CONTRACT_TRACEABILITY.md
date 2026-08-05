# Contract Traceability

**Change ID:** fixDeployCliLivenessCheck
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-08-05T01:25:52.250Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | bun test deploy-local-cli-check.test.ts: healthy live payload with nested resume_projection_state.schema_version 1 passes (exit 0). Confirmed end-to-end against the REAL installed CLI: old function FAIL, new function PASS, same binary same moment. |
| SC2 | success_criterion | pass | review | bun test: disk-only payload with top-level schema_version 1 fails (non-zero exit). Detection preserved. |
| SC3 | success_criterion | pass | review | bun test: failure diagnostics section asserts observed source, observed schema_version, unparseable-output distinction, bounded length under 200 chars, and no diagnostic on success. |
| AC1 | acceptance_criterion | pass | test | Real-CLI proof: extracted old and new function, ran each against $HOME/.local/bin/adv. Old FAIL (exit 1), new PASS (exit 0). The false positive that has fired on every deploy since 2026-07-28 is gone. |
| AC2 | acceptance_criterion | pass | test | bun test case 'rejects a stale disk-only payload with a top-level schema_version' asserts non-zero exit. The jq assertion .schema_version != 1 is root-scoped, so only a top-level version triggers it. |
| AC3 | acceptance_criterion | pass | test | bun test case 'accepts fail-closed live error metadata' asserts exit 0 for a live:false payload with error and remediation. The jq assertion deliberately does NOT require .live == true. |
| AC4 | acceptance_criterion | pass | test | bun test: five diagnostic cases verify the observed source, schema_version, unparseable distinction, bounded length, and silence-on-success. Real-CLI run confirmed the diagnostic renders end-to-end ('CLI not executable at /nonexistent/adv'). |
| C1 | constraint | respected | static_check | The jq assertion .source == 'temporal' and (.schema_version != 1) expresses rq-advCliLocalInstall01 as written: accept source temporal (success or fail-closed error), reject top-level schema_version 1 (disk-only). No spec change made or needed. |
| C2 | constraint | respected | static_check | jq appears 38 times in deploy-local.sh and is a hard precondition (check_jq at lines 790 and 1140). The fix adds one more use; no new dependency. |
| C3 | constraint | respected | static_check | bun test case for disk-only payload asserts non-zero exit. Negative guard in deploy-local.test.ts (/grep -q.*schema_version/) prevents the old heuristic from returning. |
| C4 | constraint | respected | static_check | git diff confirms bin/adv and bin/lib/live-status.ts are untouched. Only scripts/deploy-local.sh and test files changed. |
| DONT1 | avoidance | respected | review | git diff shows no changes to bin/adv or any status payload builder. |
| DONT2 | avoidance | respected | review | The jq assertion includes (.schema_version != 1), preserving disk-only detection. bun test confirms disk-only still fails. |
| DONT3 | avoidance | respected | review | The jq assertion deliberately does not reference .live. Comment records why: the law accepts fail-closed live error metadata, so requiring liveness would trade a false positive for a false negative. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-709fb9d6317c | AC1, AC2, AC3 | SC1, SC2 | C1, C3, DONT2, DONT3 |  |
| tk-3b34bd0868e8 | AC1, AC2, AC3 | SC1, SC2 | C1, C2, C3, C4, DONT1, DONT2, DONT3 |  |
| tk-140f9d17e12b | AC4 | SC3 | C1, C3 |  |
