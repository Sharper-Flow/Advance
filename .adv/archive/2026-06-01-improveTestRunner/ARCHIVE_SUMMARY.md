# Archive: Improve test runner

**Change ID:** improveTestRunner
**Archived:** 2026-06-01T21:47:46.908Z
**Created:** 2026-06-01T20:35:05.828Z

## Tasks Completed

- ✅ Align adv_run_test contract specs and schema expectations
  > Task checkpoint completed
- ✅ Implement streaming runner and typed adv_run_test result contract
  > Task checkpoint completed
- ✅ Add structured evidence parsing and sub-agent verification bridge
  > Task checkpoint completed
- ✅ Add repo-local workflow advisory and test-throttle alignment
  > Task checkpoint completed
- ✅ Run cross-cutting contract verification and benchmark evidence
  > Task checkpoint completed

## Specs Modified


## Wisdom Accumulated

- **[pattern]** For ADV/Temporal test execution, avoid centralizing all project test workflow inside ADV. Temporal should coordinate durable workflow state; repo-local tooling/CI should own suite routing, throttling, and environment policy. ADV should run explicit commands unchanged and return typed evidence/advisories only.
