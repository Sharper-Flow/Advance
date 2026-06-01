# Research Pack: adv_run_test Alignment

Target: `adv_run_test`
Mode: scoped concept / tool implementation
Created: 2026-06-01
Updated: 2026-06-01

## Purpose & Scope

Analyze how `adv_run_test` can better align with this repo's dev stack and ADV's agent model.

Covered:

- Local tool implementation, registration, tests, TDD specs, apply workflow docs, and sub-agent verification consumption.
- Local dev stack: TypeScript, Bun runtime, Node/Vitest test environment, pnpm, Temporal-backed ADV state.
- System logs requested by user: user services, Temporal service warnings, OpenCode DB maintenance logs, test/ADV-related journal entries.
- External references: Node child process APIs, Vitest reporters/worker controls, current AI test-verification landscape.

Non-scope:

- No ADV state mutation.
- No change/task/gate/spec creation.
- No implementation changes; recommendations only.

## Current State

### Security

- Severity: MEDIUM
  - Evidence: `plugin/src/tools/test.ts:117-127` executes caller-provided `command` with `child_process.exec`; Context7 Node docs state `exec()` runs through a shell and warns never to pass unsanitized input because shell metacharacters can trigger arbitrary command execution.
  - Impact: tool intentionally preserves shell semantics, but the trust boundary is implicit. The schema says “exact shell command,” yet output lacks an explicit `shell: true`/trusted-caller marker or risk classification.
  - Recommendation: keep shell compatibility, but make it structural: return `executionMode: "shell"`, document trusted-caller boundary in schema/description, and add tests that prove no command rewriting/sanitizing occurs.
  - Follow-up: `/adv-proposal Clarify adv_run_test shell contract`

### Reliability

- Severity: HIGH
  - Evidence: `plugin/src/tools/test.ts:117-162` uses `execAsync`, which buffers stdout/stderr and terminates on `maxBuffer`; Node docs say `exec()` buffers output and `maxBuffer` terminates/truncates output when exceeded. Current tests cover classification at `plugin/src/tools/test.test.ts:290-309`.
  - Impact: noisy but healthy test runs can be killed by buffer pressure before useful model-facing evidence is shaped.
  - Recommendation: move subprocess internals to `spawn(command, { shell: true })` with streaming capture, bounded ring buffers, high-signal extraction, duration tracking, and compatibility tests required by `rq-advRunTestLatency01`.
  - Follow-up: `/adv-proposal Stream adv_run_test output`

- Severity: MEDIUM
  - Evidence: `plugin/src/tools/test.ts:294-302` always returns `success: true` for command execution, including non-zero exits; `plugin/src/tools/test.test.ts:123-138` asserts failed commands return `success: true` with `exitCode: 1`.
  - Impact: consumers must infer failure from `exitCode`; model self-correction is less structural than an explicit `passed`, `classification`, or MCP-style tool-error/advisory field.
  - Recommendation: preserve backwards compatibility but add explicit `passed: exitCode === 0`, `classification: "passed" | "failed" | "timed_out" | "output_limit" | "spawn_error"`, and `durationMs`.
  - Follow-up: `/adv-task`

### Testing

- Severity: HIGH
  - Evidence: TDD spec `rq-TDD008path.3` says red phase rejects `exitCode=0` and green phase rejects non-zero exit codes; docs still instruct `adv_run_test phase:'red'` / `phase:'green'` in `ADV_INSTRUCTIONS.md:335-336` and `.opencode/command/adv-apply.md:68-69,552-554`; current schema in `plugin/src/tools/test.ts:176-202` has no `phase`; `plugin/src/tools/test.test.ts:56-74` asserts no phase.
  - Impact: spec/docs/model contract drift. Agents are told to pass a field the tool does not accept, and phase semantics are not machine-checkable.
  - Recommendation: either reintroduce a typed optional `phase: "red" | "green" | "verify"` with semantics validation, or update specs/docs to remove phase claims. Better model alignment: reintroduce phase for inline TDD and return phase-validity errors structurally.
  - Follow-up: `/adv-proposal Restore typed adv_run_test phases`

- Severity: MEDIUM
  - Evidence: `plugin/package.json:17-31` scripts expose `pnpm test`, `pnpm run check`, etc.; `plugin/vitest.config.ts:4-15` configures Vitest; no `bin/oc-test` exists (`glob bin/oc-test`, `*/bin/oc-test` returned no files). Always-on local policy says repos with `bin/oc-test` should route heavy tests through it.
  - Impact: Advance itself lacks the local throttle wrapper used elsewhere to avoid multi-session CPU saturation; `adv_run_test` cannot recommend or detect stack-specific safe tiers.
  - Recommendation: add repo-local `bin/oc-test` wrapper first; then optionally teach `adv_run_test` to surface a non-mutating advisory when it sees full-suite commands in repos with a wrapper.
  - Follow-up: `/adv-proposal Add Advance oc-test wrapper`

### Observability

- Severity: MEDIUM
  - Evidence: `plugin/src/utils/metrics.ts:1-9` says metrics are in-memory and reset on plugin init; `plugin/src/tools/test.ts:261-302` records substep durations but not command duration/result details beyond current response; `journalctl --user --since '14 days ago' --grep 'adv_run_test'` returned no entries; `journalctl --user -u temporal-dev --since '14 days ago' -p warning..alert` returned no entries.
  - Impact: operators can inspect current-session phase timing via `adv_status`, but cannot correlate historical adv_run_test timeouts, output-limit kills, or heavy-suite patterns after restart.
  - Recommendation: add bounded structured result telemetry to the response and health view: command hash, tool version, duration, classification, output bytes seen/retained, timeoutMs, workdir basename, and taskId. Do not log raw commands/output to system logs by default.
  - Follow-up: `/adv-task`

- Severity: LOW
  - Evidence: `journalctl --user -u opencode-db-maint.service --since '14 days ago'` showed successful runs but high memory peaks: 7.2G on 2026-05-27, 4.7G on 2026-05-27, 4.2G and 4.1G on 2026-06-01.
  - Impact: not caused by `adv_run_test`, but confirms local agent tooling can produce resource spikes; heavy test runs should be throttled and measured.
  - Recommendation: include resource-aware guidance in `adv_run_test` output when commands look like full suites and no `timeoutMs`/wrapper is present.
  - Follow-up: `/adv-task`

### Developer Experience

- Severity: HIGH
  - Evidence: `ADV_INSTRUCTIONS.md:284` says timeout responses include `errorClass: TestExecutionTimeout`; implementation returns `timedOut` and `timeoutMs` only (`plugin/src/tools/test.ts:294-302`).
  - Impact: docs and model-facing contract disagree; agents may look for fields that never exist.
  - Recommendation: add `errorClass`/`classification` fields or fix docs. Prefer adding fields while keeping existing `timedOut`/`maxBufferExceeded` for compatibility.
  - Follow-up: `/adv-task`

- Severity: MEDIUM
  - Evidence: `plugin/src/tools/test.ts:174-180` description says “Run a test command, capture the exit code, and return the result”; tool schema says `taskId` is “Task ID to record evidence for” (`plugin/src/tools/test.ts:177`), but implementation only validates task existence (`plugin/src/tools/test.ts:241-248`) and returns JSON; subagent report consumer only searches final task text for command strings (`plugin/src/tools/subagent-report.ts:321-355`).
  - Impact: “record evidence” implies durable evidence, but no dedicated evidence record exists. Model/report consumers rely on fragile text inclusion.
  - Recommendation: rename contract to “validate task + return evidence” or add a durable lightweight evidence ledger keyed by task/run. If durable storage is added, it must be Temporal-backed, not disk.
  - Follow-up: `/adv-proposal Add adv_run_test evidence ledger`

### Code Quality

- Severity: MEDIUM
  - Evidence: output shaping is regex-based in `plugin/src/tools/test.ts:57-115`; Vitest docs support JSON reporter and `outputFile`; current tool does not exploit structured reporter output.
  - Impact: model sees heuristic summaries rather than structured failed-test names/files/durations when Vitest is the detected runner.
  - Recommendation: keep generic shell fallback, but add stack-aware parsers for known outputs: Vitest JSON reporter, JUnit XML, and plain shell fallback. Use parser results for structured `failures[]`, `summary`, `artifacts[]`.
  - Follow-up: `/adv-proposal Add structured test evidence parsers`

## LBP / Reference Comparison

| Area | Current | Reference | Classification | Correction |
|---|---|---|---|---|
| Subprocess execution | `execAsync(command)` with `timeout` + `maxBuffer` (`plugin/src/tools/test.ts:117-162`) | Node docs: `exec()` runs a shell and buffers output; `spawn()` streams stdout/stderr and supports `shell`, `timeout`, `AbortSignal` | DRIFTED | Use `spawn` with `shell: true` to preserve shell semantics while streaming and bounding retained output. Greenfield: implement a small subprocess runner abstraction with fakeable clock/process adapter. |
| Output evidence | Regex high-signal lines + tail (`plugin/src/tools/test.ts:57-115`) | Vitest docs: JSON reporter and `outputFile` produce structured test results compatible with Jest JSON | DRIFTED | Add optional parser pipeline: Vitest JSON/JUnit first, regex fallback second. Greenfield: typed `TestRunResult` with `summary`, `failures[]`, `artifacts[]`. |
| Worker/resource control | No repo `bin/oc-test`; no local full-suite throttle evidence | Local instruction policy requires `bin/oc-test` when provided; Vitest v4 uses `maxWorkers` / `VITEST_MAX_WORKERS` | DRIFTED | Add `bin/oc-test` to this repo and include `VITEST_MAX_WORKERS` guidance/advisory. Greenfield: test profiles `targeted|smoke|full` as first-class input, shell command as escape hatch. |
| TDD phase semantics | Specs/docs reference `phase:'red'/'green'`; schema has no phase | `tdd-contract` requires red/green evidence semantics validation | ANTI-PATTERN | Reintroduce typed optional phase or update spec/docs. Greenfield: phase is a discriminated union with structural exit-code validation. |
| Observability | In-memory phase metrics only (`plugin/src/utils/metrics.ts:1-9,39-43`) | MCP tool guidance emphasizes actionable execution errors; current system logs have no `adv_run_test` entries | DRIFTED | Return structured classifications and expose bounded health counters; avoid raw command/output logs. Greenfield: per-task evidence ledger with retention. |
| Tool result contract | `success: true` for non-zero command exit (`plugin/src/tools/test.ts:294-302`) | MCP docs: tool execution errors should provide actionable feedback; tests can still be a successful tool call with failed command result | SOUND with gap | Keep tool-call success separate from test pass/fail, but add explicit `passed` and `classification`. Greenfield: `toolSuccess` vs `testPassed` naming. |

## Competitors & Alternatives

1. CodeLoop — MCP-based verification suite for agents.
   - Difference: combines build, tests, screenshots, video, design diff, app logs, and confidence gates.
   - Maturity: public product; claims 29 MCP tools and structured confidence scoring.
   - Source: https://codeloop.tech/
   - Relevance: strong reference for model-facing structured verification output; too broad to copy wholesale.

2. Diffblue Testing Agent — autonomous test generation/verification.
   - Difference: plans, generates, verifies, cleans up, and prepares PRs; discards tests that do not compile/pass.
   - Maturity: commercial product; Java/Python support signal.
   - Source: https://www.diffblue.com/agents/
   - Relevance: shows value of structural verification loop and cleanup; less relevant to generic shell command execution.

3. nit — local-first AI quality agent.
   - Difference: auto-detects stack, uses existing frameworks, self-iterates, monitors drift, supports Vitest/pytest/Jest/Playwright.
   - Maturity: public GitHub project surfaced in 2026 search.
   - Source: https://github.com/getnit-dev/nit
   - Relevance: directly supports stack detection + framework-native tests; useful benchmark for `adv_run_test` profiles/parsers.

## Emerging Patterns

1. Structured agent/tool-call testing.
   - Summary: tools like `toolcallcheck` and MCP conformance suites assert exact tool calls, args, trajectories, and protocol behavior offline.
   - Source: https://github.com/adwantg/toolcallcheck and https://github.com/modelcontextprotocol/conformance/
   - Relevance: `adv_run_test` should expose typed evidence suitable for exact assertions, not only text blobs.

2. Verified-spec-to-test loops for browser/UI work.
   - Summary: tools such as Ouroboros Tester and Hover use Playwright MCP/browser evidence, then crystallize deterministic Playwright specs.
   - Source: https://github.com/hadetan/ouroboros-tester and https://github.com/Hyperyond/Hover
   - Relevance: less central to `adv_run_test`, but supports future artifact handling for screenshots/traces and deterministic test artifacts.

## Applicability to This Repo

High applicability:

- Stream subprocess output while preserving shell semantics (`plugin/src/tools/test.ts:117-162`; `rq-advRunTestLatency01`).
- Restore/resolve typed TDD phase contract drift (`tdd-contract` + `.opencode/command/adv-apply.md` + schema).
- Add explicit `passed`, `classification`, `durationMs`, and output byte counters to response.
- Add Vitest/JUnit structured parser path; repo already uses Vitest (`plugin/package.json:28`, `plugin/vitest.config.ts:4-15`).
- Add Advance-local `bin/oc-test` wrapper before expecting agents/tools to use it.

Medium applicability:

- Durable per-task evidence ledger. Valuable, but requires Temporal state design and migration care.
- System-log integration. Avoid raw logs; bounded counters and health view are safer.

Low applicability / reject:

- Rewriting user commands automatically to wrappers. Conflicts with exact-command shell semantics and `rq-advRunTestLatency01`; prefer advisory/profile inputs.
- Sending raw command output to system logs. Risky for secrets/noise; response + bounded health telemetry is enough.

System-log notes:

- Running user services: `temporal-dev.service`, `vision.service`.
- Temporal warnings: none from `journalctl --user -u temporal-dev --since '14 days ago' -p warning..alert`.
- `adv_run_test` journal entries: none from `journalctl --user --since '14 days ago' --grep 'adv_run_test'`.
- User warnings were unrelated authentication/Ubuntu Insights entries.
- OpenCode DB maintenance succeeded but showed memory peaks up to 7.2G; supports resource-aware test-throttle opportunity.

Tooling fallback notes:

- `lgrep_search_semantic` timed out twice while searching `adv_run_test` evidence flow; analysis fell back to `lgrep_search_text`, direct `read`, specs, and docs.

## Open Questions for Research

1. Should `adv_run_test` regain `phase` as part of the public schema, or should `tdd-contract` be amended to make phase purely narrative?
2. If durable evidence is added, should it live on task workflow state, change workflow state, or a separate Temporal evidence workflow?
3. Should `adv_run_test` expose profile inputs (`targeted|smoke|full`) while keeping `command` required, or should profiles be a separate tool?
4. Which structured result artifact should be canonical for non-Vitest projects: JUnit XML, TAP, JSON per runner, or adapter registry?
5. What retention/privacy policy should apply to command text, workdir, and output snippets in any evidence ledger?

## Sources

- Local implementation: `plugin/src/tools/test.ts:25-302`
- Local tests: `plugin/src/tools/test.test.ts:56-362`
- Tool registration: `plugin/src/tool-registry.ts:553-577`; `plugin/src/tool-registry.test.ts:419-427`
- TDD spec: `tdd-contract` requirement `rq-TDD008path`; `docs/specs/tdd-contract.md:283-308`
- Apply docs: `ADV_INSTRUCTIONS.md:284,335-340`; `.opencode/command/adv-apply.md:64-70,552-556`
- Subagent verification consumer: `plugin/src/tools/subagent-report.ts:321-355`
- Metrics: `plugin/src/utils/metrics.ts:1-9,39-43,160-187`
- Dev stack: `plugin/package.json:17-31`; `plugin/vitest.config.ts:4-15`
- Context7 Node docs: `/nodejs/node`, `child_process.exec()` and `child_process.spawn()` documentation
- Context7 Vitest docs: `/vitest-dev/vitest`, JSON reporter, `outputFile`, `maxWorkers` / `VITEST_MAX_WORKERS`
- MCP tools docs: https://modelcontextprotocol.io/specification/draft/server/tools
- CodeLoop: https://codeloop.tech/
- Diffblue Testing Agent: https://www.diffblue.com/agents/
- nit: https://github.com/getnit-dev/nit
- toolcallcheck: https://github.com/adwantg/toolcallcheck
- MCP conformance: https://github.com/modelcontextprotocol/conformance/
- Ouroboros Tester: https://github.com/hadetan/ouroboros-tester
- Hover: https://github.com/Hyperyond/Hover
- System logs scanned: `systemctl --user list-units --type=service --state=running --no-pager`; `journalctl --user --since '14 days ago' --grep 'adv_run_test'`; `journalctl --user -u temporal-dev --since '14 days ago' -p warning..alert`; `journalctl --user -u opencode-db-maint.service --since '14 days ago'`
