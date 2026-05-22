# Contract Traceability

**Change ID:** updateTerminalTitles2
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-05-22T16:08:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | Focused events/terminal tests passed; `buildTabTitle` active change returns raw change id and emitted active OSC payload is change id only. |
| AC2 | acceptance_criterion | pass | test | Focused `buildTabTitle` inactive test passed: no active change returns project name. |
| AC3 | acceptance_criterion | pass | test | Focused terminal test asserts emitted active title does not contain `advance: addFeatureX`; static audit forbids current `Project: change-id` runtime wording. |
| AC4 | acceptance_criterion | pass | test | Focused formatter tests cover ignored status emoji/prefix/progress and active output contains only change id; design/review found no worktree/branch/trunk title inputs. |
| AC5 | acceptance_criterion | pass | test | Focused test suite passed: active, inactive, whitespace fallback, empty project active, sanitization, no-BEL/ST, and status-churn no-retitle coverage. |
| AC6 | acceptance_criterion | pass | test | No emission control-flow changes; terminal tests covering tmux argv safety, no-BEL/ST, failed emission retry, and stdout fallback passed. |
| AC7 | acceptance_criterion | pass | test | `rq-titleIdentity01` added to canonical spec and markdown mirror; ADV_INSTRUCTIONS/status current wording updated; drift test passed. |
| AC8 | acceptance_criterion | pass | test | Focused tests passed; full `pnpm test` passed; `pnpm run check` passed; `pnpm run build` passed; strict ADV validation passed with NO_DELTAS warning only. |
| C1 | constraint | respected | static_check | No `session.title` migration added; implementation remains in terminal formatter/emission path. |
| C2 | constraint | respected | static_check | No status marker enum/semantic changes; only title docs/comment and existing test formatting touched. |
| C3 | constraint | respected | static_check | No Warp styling/rich-title assumptions added; spec states plain title identity only. |
| C4 | constraint | respected | static_check | Historical changelog/research-pack entries left untouched; only current docs/specs and runtime comments updated. |
| C5 | constraint | respected | static_check | `rq-titleBell01` unchanged; terminal no-BEL/ST/control-byte tests passed; static audit found no OSC 9/777 in terminal runtime. |
| DONT1 | avoidance | respected | review | Formatter remains trim-only with raw change id precedence; no humanization/shortening/model-derived text added. |
| DONT2 | avoidance | respected | review | No worktree/trunk/branch inputs added to title path; active title tests assert change id only. |
| DONT3 | avoidance | respected | review | Static audit checked terminal runtime for `OSC 9` and `OSC 777`; none added. No BEL replacement protocol added. |
| DONT4 | avoidance | respected | review | Title remains display-only metadata; no workflow/security/persistence/gate logic reads terminal title. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-26267080ad36 | AC1, AC2, AC3, AC4, AC6 | AC1, AC2, AC3, AC4, AC5, AC6 | C1, C2, C3, C5, DONT1, DONT2, DONT3, DONT4 |  |
| tk-e3fbc28b4f1e | AC7 | AC7, AC5 | C4, C5, DONT1, DONT2, DONT3, DONT4 |  |
| tk-b975614f63fc |  | AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8 | C1, C2, C3, C4, C5, DONT1, DONT2, DONT3, DONT4 |  |
