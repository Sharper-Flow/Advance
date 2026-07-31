---
name: adv-apply-subagent-packets
description: "Canonical sub-agent packet templates and verification result schema for /adv-apply delegation"
keywords: ["adv-apply", "sub-agent", "packet", "verification-triage", "apply-context"]
metadata:
  priority: high
  source: command-asset
---

# ADV Apply Sub-Agent Packets

Canonical detail offloaded from `.opencode/command/adv-apply.md`. Command owns the decision path; this document owns the verbatim packet templates and result schema.

## Verify-Burst Verification Triage Packet

Spawn `adv-verifier` (or `general` fallback) for heavy verification bursts that would pollute the main agent context.

**When to delegate:** output expected >200 lines, runtime >30s, combined lint/typecheck/tests, or timeout isolation needed.

**When to keep inline:** focused TDD `adv_run_test`, single-file lint, or short expected output.

```text
WORKING DIRECTORY: {workdir}
CHANGE: {change-id} | {title}
SCOPE KEY: verifier:{local-verify|ci-check|short-slug}
PHASE: local_verify | ci_check
ATTEMPT: {attempt-number, starting at 1}
TASK_SCOPE: verify-only — command/check identity, bounded evidence, classification, recommendation
IN_SCOPE:
  - local command failures and CI/check-run failures already observed by main ADV
OUT_OF_SCOPE:
  - code edits, ADV state mutation, gate completion, scope changes, final user-facing conclusions
DONE_WHEN:
  - return one strict Verification Triage Result JSON object
STOP_WHEN:
  - missing command/check evidence, unsafe credential exposure, or insufficient identity for stale-safe CI evidence
VERIFICATION:
  - cite command output, logs, check metadata, or test evidence
COMMANDS:
  - {cmd 1}
  - {cmd 2}
CI CHECKS (when PHASE=ci_check):
  - repo: {owner/repo}
  - check_name: {check or job name}
  - head_sha: {commit SHA}
  - run_url: {optional URL}
RULES:
  - Do not edit files, write files, or patch files.
  - Do not call adv_subagent_report_submit.
  - Do not complete gates, mutate ADV state, change scope, or publish final conclusions.
```

SCOPE KEY slug is hyphen-only; do not mirror underscored PHASE values.

## Verification Triage Result

Strict JSON returned by the verify worker; main ADV wraps with `schema_version: "1.0"`, `change_id`, `attempt`, `workdir_used`, and `scope: { kind: "change", scope_key: "verifier:<slug>" }` before submitting `adv-verification-triage-bundle`.

```json
{
  "agent": "adv-verification-triage-bundle",
  "phase": "local_verify | ci_check",
  "targets": [
    { "kind": "command", "command": "exact command", "exit_code": 1, "duration_ms": 1234 },
    { "kind": "ci_check", "repo": "owner/repo", "check_name": "test", "head_sha": "0123456789abcdef0123456789abcdef01234567", "run_url": "https://...", "conclusion": "failure" }
  ],
  "status": "pass | fail | inconclusive",
  "error_class": "SEMANTIC | TRANSIENT | ENVIRONMENTAL | FATAL | UNKNOWN",
  "confidence": "high | medium | low",
  "evidence_basis": "bounded source-backed reason",
  "findings": [{ "id": "...", "severity": "blocker|issue|suggestion|info", "summary": "...", "evidence": [{ "label": "test output", "locator": "command/check/log URL", "summary": "bounded excerpt or cited signal" }] }],
  "recommended_next_action": "continue | retry_narrower | route_adv_engineer | ask_user | block_environment | wait_ci | no_action",
  "scope_risk": false,
  "suggested_handoff": { "summary": "...", "in_scope": [], "out_of_scope": [], "done_when": [], "verification": [] },
  "failure_attribution": {
    "assertion": "exact failed assertion text or expectation",
    "test_locator": { "label": "test", "locator": "file:line or test name", "summary": "bounded test location" },
    "production_locator": { "label": "production", "locator": "file:line", "summary": "bounded production location" },
    "branch_result": "pass | fail | inconclusive | not_run",
    "base_result": "pass | fail | inconclusive | not_run",
    "comparison_status": "compared_clean | base_failed_branch_fail | base_unavailable | not_compared",
    "failure_mode": "assertion_mismatch | exception | timeout | missing_coverage | contract_conflict | order_sensitive | unknown",
    "owner_task": "tk-...",
    "evidence_refs": [{ "label": "...", "locator": "...", "summary": "..." }]
  },
  "required_main_agent_actions": [],
  "follow_ups": []
}
```

**Handling:** PASS/continue → continue task. FAIL with `route_adv_engineer` → validate predicates, build actual `adv-engineer` packet. `retry_narrower` / timeout / malformed → retry once narrower, then inline. `ask_user` / `block_environment` / UNKNOWN → main ADV owns escalation. `route_adv_engineer` is valid only when `error_class` is `SEMANTIC`, `scope_risk` false, `confidence` high/medium, and `suggested_handoff` populated. UNKNOWN is routing-only: treat as inconclusive; never map into task `error_recovery`.

## Apply Context Packet

Spawn `adv-engineer` for delegated implementation tasks.

```text
WORKING DIRECTORY: {workdir}
CHANGE: {change-id} | {title}
TASK: {task-id} | {task-title} | type: {type} | tdd_intent: {intent}
ATTEMPT: {attempt-number, starting at 1}
TASK_SCOPE: {one-line implementation objective}
IN_SCOPE:
  - {owned files/findings/contract refs for this task}
OUT_OF_SCOPE:
  - {boundaries, DONT/OOS refs, unrelated subsystems}
DONE_WHEN:
  - {task acceptance condition}
STOP_WHEN:
  - contract/security/release blocker, unsafe edit, or impossible verification
VERIFICATION:
  required_when_possible:
    - {task-specific test/lint/typecheck command}
  optional_additional_checks: true
BRIEFING PACKET: inject the generated `_briefingPacket` (lane: engineer) here — includes identity_anchors, scope, contract, tasks, affected_files, EPIC CONTEXT, verification_expectations, durable_facts, unavailable_state
PROJECT STRUCTURE: {brief ls or glob output showing relevant directories/files in workdir}
DESIGN EXCERPT: {relevant section if task references design}
EXPECTED OUTPUT: implement the task, run tests, then call adv_subagent_report_submit with ENGINEER_REPORT per .opencode/agents/adv-engineer.md; use evidence_binding_version: typed-v1 and bind every verification row's test_run_id to the same-task runId returned by adv_run_test
```

## Designer Apply Context Packet

Mandatory follow-up after a successful same-cycle `adv-engineer` report or classified inline implementation for `metadata.frontend == "true"`. `adv-designer` remediates in scope; review/harden ownership stays with `adv-reviewer`.

```text
WORKING DIRECTORY: {workdir}
CHANGE: {change-id} | {title}
TASK: {task-id} | {task-title} | type: {type} | tdd_intent: {intent}
ATTEMPT: {attempt-number, starting at 1}
IMPLEMENTATION_RECEIPT:
  implementation_cycle_id: {active cycle id}
  provenance: {engineer_report:{stable report key} | inline:{baseline head SHA, diff reference}}
  validation: {successful same-task/same-cycle implementation evidence}
TASK_SCOPE: {one-line frontend/component objective}
IN_SCOPE:
  - {owned UI/component files/findings for this task}
OUT_OF_SCOPE:
  - backend logic, storage, APIs, Temporal, business rules, unrelated subsystems, review/harden
DONE_WHEN:
  - {task acceptance condition; UI verified}
STOP_WHEN:
  - contract/security/release blocker, unsafe edit, impossible verification, or BACKEND BOUNDARY hit
VERIFICATION:
  required_when_possible:
    - {task-specific component/lint/typecheck/a11y command}
  optional_additional_checks: true
BRIEFING PACKET: inject the generated `_briefingPacket` (lane: designer) here — includes identity_anchors, scope, contract, tasks, affected_files, EPIC CONTEXT, durable_facts, unavailable_state
VISUAL_CONTEXT:
  surface_type: {tool | dashboard | form | docs | marketing | component | unknown | unavailable: reason}
  existing_patterns:
    - {relevant primitives/components/layout patterns, or unavailable: reason}
  tokens_and_style_rules:
    - {known design tokens/style constraints, or unavailable: reason}
  viewport_targets:
    - {viewport/breakpoint expectations, or unavailable: reason}
  forbidden_patterns:
    - {agreement avoidances, project avoidances, and design anti-patterns}
  evidence_expectation: {browser/design proof expected with exact affected route/state, post-hydration readiness, and viewport context, or fallback rationale when unavailable}
DESIGN QUALITY BAR: component correctness, semantic HTML/accessibility, responsive behavior, visual polish, matching site design, finer details
NEIGHBORING RECOMMENDATIONS: finish owned UI scope if safe; surface adjacent UI inconsistencies via DESIGNER_REPORT.neighboring_recommendations[] and required_main_agent_actions
BACKEND BOUNDARY: if the UI task requires changing storage, APIs, Temporal, or business logic, stop and report. Populate scope_drift.recommendation: "stop_and_report" and required_main_agent_actions with handoff to adv-engineer. Do NOT edit backend files.
PROJECT STRUCTURE: {brief ls or glob output showing relevant directories/files in workdir}
DESIGN EXCERPT: {relevant section if task references design}
EXPECTED OUTPUT: implement the UI/component task, run tests, then call adv_subagent_report_submit with DESIGNER_REPORT per .opencode/agents/adv-designer.md; use evidence_binding_version: typed-v1 and bind every verification row's test_run_id to the same-task runId returned by adv_run_test
```

The active cycle is bound in the designer report under `apply_context.implementation_cycle_id`, not as a top-level key:

```json
"apply_context": {
  "implementation_cycle_id": "ic_<active-cycle-id>",
  "implementation_provenance": {
    "kind": "engineer_report",
    "report_key": "<stable engineer report key>"
  }
}
```

`implementation_provenance.kind` may be `engineer` (`baseline_head_sha`), `engineer_report` (`report_key`), or `inline` (`baseline_head_sha` + `diff_ref`). A top-level `implementation_cycle_id` is rejected by the strict schema. `VISUAL_CONTEXT` must use existing agreement/design/task/project/preview sources or explicit unavailable markers; it must not fabricate style context.
