# Acceptance

Reviewed at: 2026-05-22T16:08:00.000Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | Active change title format is exactly `<change-id>` after existing trim/control-byte sanitization. | pass | Focused events/terminal tests passed; `buildTabTitle` active change returns raw change id and emitted active OSC payload is change id only. |
| AC2 | acceptance_criterion | Inactive title format is exactly `<project>` after existing trim/control-byte sanitization. | pass | Focused `buildTabTitle` inactive test passed: no active change returns project name. |
| AC3 | acceptance_criterion | Project name is not prefixed when a change id exists. | pass | Focused terminal test asserts emitted active title does not contain `advance: addFeatureX`; static audit forbids current `Project: change-id` runtime wording. |
| AC4 | acceptance_criterion | Worktree path, git branch, trunk/main checkout, status marker, progress, blocked marker, and emoji are not included in title strings. | pass | Focused formatter tests cover ignored status emoji/prefix/progress and active output contains only change id; design/review found no worktree/branch/trunk title inputs. |
| AC5 | acceptance_criterion | Tests cover active title, inactive title, empty/whitespace change id fallback, empty project with active change, sanitization, no-BEL/ST title output, and no status-churn retitle behavior. | pass | Focused test suite passed: active, inactive, whitespace fallback, empty project active, sanitization, no-BEL/ST, and status-churn no-retitle coverage. |
| AC6 | acceptance_criterion | Existing tmux, `/dev/tty`, and stdout fallback title emission behavior remains intact aside from title text. | pass | No emission control-flow changes; terminal tests covering tmux argv safety, no-BEL/ST, failed emission retry, and stdout fallback passed. |
| AC7 | acceptance_criterion | Current docs/specs no longer describe the active title as `Project: change-id`; they describe `change-id` active fallback to `project` inactive. | pass | `rq-titleIdentity01` added to canonical spec and markdown mirror; ADV_INSTRUCTIONS/status current wording updated; drift test passed. |
| AC8 | acceptance_criterion | Verification from `plugin/` passes: focused terminal/events/spec tests, `pnpm test`, `pnpm run check`, and `pnpm run build`. | pass | Focused tests passed; full `pnpm test` passed; `pnpm run check` passed; `pnpm run build` passed; strict ADV validation passed with NO_DELTAS warning only. |
| C1 | constraint | Do not migrate to OpenCode `session.title` ownership in this change. | respected | No `session.title` migration added; implementation remains in terminal formatter/emission path. |
| C2 | constraint | Do not change chat status markers. | respected | No status marker enum/semantic changes; only title docs/comment and existing test formatting touched. |
| C3 | constraint | Do not add Warp-specific rich styling assumptions; Warp title is plain text. | respected | No Warp styling/rich-title assumptions added; spec states plain title identity only. |
| C4 | constraint | Do not rewrite historical changelog/research-pack entries that are clearly historical unless they claim current behavior. | respected | Historical changelog/research-pack entries left untouched; only current docs/specs and runtime comments updated. |
| C5 | constraint | Do not weaken existing no-BEL or control-byte sanitization guarantees. | respected | `rq-titleBell01` unchanged; terminal no-BEL/ST/control-byte tests passed; static audit found no OSC 9/777 in terminal runtime. |
| DONT1 | avoidance | Avoid heuristic title shortening, acronym generation, verb stripping, humanization, or model-derived title text. | respected | Formatter remains trim-only with raw change id precedence; no humanization/shortening/model-derived text added. |
| DONT2 | avoidance | Avoid exposing trunk/worktree mechanics in user-visible title strings. | respected | No worktree/trunk/branch inputs added to title path; active title tests assert change id only. |
| DONT3 | avoidance | Avoid replacing removed BEL behavior with OSC 9, OSC 777, or another ADV-owned terminal notification protocol. | respected | Static audit checked terminal runtime for `OSC 9` and `OSC 777`; none added. No BEL replacement protocol added. |
| DONT4 | avoidance | Avoid using terminal title display metadata as authority for workflow correctness, security, permissions, persistence, gate completion, or spec compliance. | respected | Title remains display-only metadata; no workflow/security/persistence/gate logic reads terminal title. |

