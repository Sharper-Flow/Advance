# Contract Traceability

**Change ID:** addUserFocusVoiceRule
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-21T00:41:50.754Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| C1 | constraint | pass | static_check | 6 modified files; User-Focus inserted at docs/command-voice-standard.md:15-46 while Core Rules remain :5-13 and Manifest Description Rules begin :48. No existing voice rule text changed. |
| C2 | constraint | pass | static_check | No test file changed. Section :34 and :42 explicitly classify judgment-only/no drift test. 98/98 voice-enforcement drift tests pass (manifest-doc-drift 17/17). |
| C3 | constraint | pass | static_check | Motivational aside at docs/command-voice-standard.md:44-46 explicitly says 'not normative' and 'The rule generalizes.' Toolbox instance motivates only. |
| C4 | constraint | pass | static_check | 32-line inherently-prose structured section (one-line purpose + tables). Only Prose-Load Reduction Rules section is capped at 80 (plugin/src/manifest-doc-drift.test.ts:350-360); User-Focus not subject to that cap. |
| DONT1 | avoidance | respected | review | Translation discipline at docs/command-voice-standard.md:28-30 explicitly framed as 'Judgment — not a regex.' No heuristic detector language. |
| DONT2 | avoidance | respected | review | Single pointer-style reminder at .opencode/agents/adv.md:156 and mirror at .opencode/overlays/adv.overlay.md:15. No multi-paragraph bloat. |
| DONT3 | avoidance | respected | review | Aside at docs/command-voice-standard.md:44-46 says 'not normative' and 'rule generalizes'; toolbox reduceLaunchTime framed as instance-not-rule. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-4e010eff5c04 | C1 |  | DONT2 |  |
| tk-3d331b16c78c | C1, C3, C4 |  | DONT1, DONT3 |  |
| tk-0fa0b4883bc0 |  | C2 |  |  |
