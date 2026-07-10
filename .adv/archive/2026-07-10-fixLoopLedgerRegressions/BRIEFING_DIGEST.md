# Archive Briefing Digest

**Change ID:** fixLoopLedgerRegressions
**Title:** Fix loop ledger regressions
**Status:** archived
**Generated:** 2026-07-10T20:45:10.909Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY
- Origin: discovery

## Archive Digest

**Status:** archived

| Gate | Status |
| --- | --- |
| proposal | done |
| discovery | done |
| design | done |
| planning | done |
| execution | done |
| acceptance | done |
| release | pending |

## Epic Context

No Epic membership

## Durable Facts

Showing 80 of 80 durable facts.

- **[agenda]** follow_ups: ops-follow-up-assets.test.ts:142-145 advance-workflow version pin expects 1.26.0 but spec is 1.27.0 (explicit DONT1 — leave for verification task AC7 / separate baseline repair)
- **[agenda]** follow_ups: adv-skill-backed-commands-assets.test.ts stage-boundary specs assertion expects advance-workflow 1.26.0 but spec is 1.27.0 (out of scope, OOS4)
- **[agenda]** follow_ups: temporal/workflows.signal-handlers.test.ts 'sets and clears epic_membership projection through signals' fails intermittently in unrelated Temporal subsystem (not touched by this diff; for verification task to classify)
- **[unresolved_action]** required_main_agent_actions: Have verification task tk-550e9ea0c687 record the remaining failures (2× advance-workflow 1.26.0-vs-1.27.0 pin; intermittent temporal epic_membership) as pre-existing and unrelated under AC7 with parent/diff evidence.
- **[unresolved_action]** required_main_agent_actions: Investigate why `pnpm test -- <file>` / `-t` does not narrow vitest collection in this repo (full suite runs regardless of filter); affects signal-to-noise for targeted engineer verification.
- **[archive_only_evidence]** decisions: Appended rq-subagentReports23 as the final element of the expected requirements array — toEqual is order-sensitive and the spec places rq-subagentReports23 last (index 22, after rq-subagentReports22); appending preserves exact ordering rather than weakening to a set/contains check (design point 1: correct exact assertions, do not broaden).
- **[archive_only_evidence]** decisions: Updated subagent-reports version pin from 1.6.0 to 1.7.1 with an exact toBe — AC2 requires the exact current version; kept a strict equality assertion rather than a loose/at-least comparison.
- **[archive_only_evidence]** decisions: Left the advance-workflow 1.26.0 pin untouched — DONT1/AC2 explicitly forbid altering unrelated advance-workflow baseline version-pin expectations; the 1.26.0-vs-1.27.0 drift is a pre-existing baseline failure owned by the verification task (AC7).
- **[unresolved_action]** scope_drift: finish_owned_scope_then_report: Two unrelated advance-workflow version-pin failures (1.26.0 expected vs 1.27.0 actual) in ops-follow-up-assets.test.ts and adv-skill-backed-commands-assets.test.ts, plus an intermittent temporal epic_membership signal-handler failure, appear in the full suite. None are caused by this task's two-file diff; they are pre-existing baseline/subsystem failures.
- **[archive_only_evidence]** verification: pnpm test -- src/subagent-reports-spec-assets.test.ts src/ops-follow-up-assets.test.ts (1) — RED (before edits): 4 failures including both targets — subagent-reports spec rq list missing rq-subagentReports23 (expected 22, got 23) and subagent-reports version 1.6.0 vs 1.7.1.
- **[archive_only_evidence]** verification: pnpm test -- src/subagent-reports-spec-assets.test.ts src/ops-follow-up-assets.test.ts (1) — GREEN (after edits): both targets no longer failing; failure count dropped 4→3, all remaining out-of-scope (2× advance-workflow 1.26.0 pin, 1× intermittent epic_membership).
- **[archive_only_evidence]** verification: pnpm test -- src/subagent-reports-spec-assets.test.ts (1) — Isolation: requested file produced no own failures; only full-suite bleed-through (advance-workflow pins + epic_membership) reported, confirming subagent-reports-spec-assets.test.ts is green.
- **[archive_only_evidence]** verification: pnpm test -- -t "subagent-reports spec exists and parses as a Spec|subagent-reports version is at least 1.3.0" (1) — Name-filtered run: only the 2 advance-workflow pin failures remained; name-matched target tests passed; epic_membership absent (intermittent).
- **[archive_only_evidence]** verification: node -e (spec rq-list and version equality check) (0) — Deterministic proof: AC1 rq-list (with rq-subagentReports23) === spec ids → true; AC2 subagent-reports version === 1.7.1 → true.
- **[archive_only_evidence]** verification: git diff --check (0) — No whitespace errors in the two-file diff.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm test -- src/subagent-reports-spec-assets.test.ts src/ops-follow-up-assets.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm test -- src/subagent-reports-spec-assets.test.ts src/ops-follow-up-assets.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm test -- src/subagent-reports-spec-assets.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm test -- -t "subagent-reports spec exists and parses as a Spec|subagent-reports version is at least 1.3.0"
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: node -e (spec rq-list and version equality check)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: git diff --check
- **[unresolved_action]** required_main_agent_actions: Run bin/oc-test full for AC7 (gate-level, outside this task's inline TDD) and confirm any remaining failures are pre-existing/unrelated per parent/diff evidence.
- **[unresolved_action]** required_main_agent_actions: Mark task tk-38e52641f17a complete after review (engineer did not complete the task per instruction).
- **[archive_only_evidence]** decisions: Introduced one exported pure helper bundleJsonStringify() in plugin/src/archive/archive.ts and reused it at all 6 archive-bundle JSON write sites plus the recovery archive-sidecar change.json in tools/_recovery-writers.ts. — P33 structural correctness + P04 locality: a single owned serialization boundary guarantees exactly-one-trailing-newline everywhere instead of 7 ad-hoc concatenations. JSON.stringify never emits a trailing newline, so `${...}\n` always yields exactly one. Reuse from _recovery-writers.ts (already imports findArchiveBundle from archive.ts) adds no new dependency/cycle.
- **[archive_only_evidence]** decisions: Did NOT add newlines to writeSpecToDisk (spec.json), the sibling raw-copy writes (proposal.md etc.), markdown artifacts (ARCHIVE_SUMMARY.md, BRIEFING_DIGEST.md, CONTRACT_TRACEABILITY.md), or the active-dir change.json (storage/json.ts saveChange). — AC3 enumerates only change.json/wisdom.json/multi-repo-archive.json; C2 scopes enforcement to archive writes + recovery archive-sidecar writes; DONT3 forbids broadening beyond bundle JSON. spec.json is a spec capability file, not a bundle artifact; sibling copies propagate source bytes verbatim; the active change.json is not an archive bundle.
- **[archive_only_evidence]** decisions: Asserted exactly-one-newline via endsWith('\n')===true && endsWith('\n\n')===false plus a JSON.parse round-trip, and added a direct bundleJsonStringify() unit test. — The double assertion distinguishes 'exactly one' from 'at least one' (the original EOF-whitespace defect was blank trailing lines); the unit test structurally covers every call site regardless of path.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/archive/archive.test.ts -t "archive bundle JSON artifacts end with exactly one trailing newline" (1) — RED: 4 new AC3/SC2 tests failed with 'expected false to be true' on endsWith('\n') — bundle artifacts had no trailing newline before the fix.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/tools/_recovery-writers.test.ts -t "appends a report to the ARCHIVE BUNDLE change.json" (1) — RED: recovery archive-sidecar change.json assertion failed (expected false to be true on endsWith('\n')) before the fix.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/archive/archive.test.ts -t "archive bundle JSON artifacts end with exactly one trailing newline" (0) — GREEN: 4 new AC3/SC2 tests pass (bundleJsonStringify unit + createArchive change.json/wisdom.json + multi-repo-archive.json + createInRepoArchive change.json/wisdom.json).
- **[archive_only_evidence]** verification: pnpm exec vitest run src/tools/_recovery-writers.test.ts -t "appends a report to the ARCHIVE BUNDLE change.json" (0) — GREEN: recovery archive-sidecar change.json now ends with exactly one trailing newline.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/archive/archive.test.ts src/tools/_recovery-writers.test.ts (0) — VERIFY: full files pass, 39/39 tests, no regressions.
- **[archive_only_evidence]** verification: pnpm exec tsc --noEmit (0) — Typecheck clean — new archive.ts export and _recovery-writers import compile; no cycle/type errors.
- **[archive_only_evidence]** verification: git diff --check (0) — AC6: no whitespace errors in the follow-up diff.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/archive/archive.test.ts -t "archive bundle JSON artifacts end with exactly one trailing newline"
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/_recovery-writers.test.ts -t "appends a report to the ARCHIVE BUNDLE change.json"
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/archive/archive.test.ts -t "archive bundle JSON artifacts end with exactly one trailing newline"
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/_recovery-writers.test.ts -t "appends a report to the ARCHIVE BUNDLE change.json"
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/archive/archive.test.ts src/tools/_recovery-writers.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec tsc --noEmit
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: git diff --check
- **[agenda]** follow_ups: Pre-existing prettier formatting issue in plugin/src/archive/archive.test.ts (reported by `pnpm run format:check`); unrelated to this relocation and not modified by me. Surface for a separate fix rather than expanding this scope.
- **[archive_only_evidence]** decisions: Placed subagentReportKey in types/subagent-reports.ts (not the types/index.ts barrel); consumers import the explicit ../types/subagent-reports path. — Matches the task target exactly, keeps the workflow-bundle edge explicit and local, and avoids forcing every consumer to import the whole types barrel.
- **[archive_only_evidence]** decisions: Deleted SubagentAgent and SubagentReportScope from the temporal/contracts.ts type-import block when removing the helper. — They were used only by subagentReportKey; leaving them would fail no-unused-vars. No re-export shim was added, per the task's 'remove temporal ownership' requirement.
- **[archive_only_evidence]** decisions: Added 4 byte-stable format-pinning tests (legacy taskId shape, structural task scope, structural change scope, unknown-scope fallback) in types/subagent-reports.test.ts. — The identity is a cross-sidecar dedupe key; relocating it must not change the persisted format, so the format is now locked by tests in the helper's new home.
- **[unresolved_action]** scope_drift: finish_owned_scope_then_report: During verification (`pnpm run format:check`), prettier flagged plugin/src/archive/archive.test.ts as unformatted. git status confirms it is NOT part of this task's modified set, so it is a pre-existing baseline issue in an unrelated subsystem. I left it untouched to avoid scope drift.
- **[archive_only_evidence]** verification: npx vitest run src/types/subagent-reports.test.ts (RED, pre-implementation) (0) — RED confirmed: 4 new subagentReportKey tests failed (helper not yet exported from ./subagent-reports); 49 pre-existing tests passed. (Note: exit code reflects the tail pipe; vitest reported 4 failed | 49 passed.)
- **[archive_only_evidence]** verification: npx vitest run src/types/subagent-reports.test.ts (GREEN, post-implementation) (0) — GREEN: 53 passed — 49 pre-existing + 4 new format-pinning tests for subagentReportKey.
- **[archive_only_evidence]** verification: npx vitest run src/temporal/workflow-bundle-boundary.test.ts src/utils/loop-ledger.purity.test.ts src/tools/followup.test.ts src/types/subagent-reports.test.ts (0) — 71 passed across 4 files: workflow-bundle-boundary (6), loop-ledger.purity (2), followup consumer (10), subagent-reports (53). Confirms temporal/change-state importing from types/ keeps the workflow bundle boundary intact and loop-ledger purity is preserved after repoint.
- **[archive_only_evidence]** verification: pnpm run typecheck (tsc --noEmit) (0) — Clean — all 7 consumers compile against the new import and contracts.ts has no unused imports after removing the helper + 2 type imports.
- **[archive_only_evidence]** verification: pnpm run lint (eslint src/) (0) — Clean — no ESLint errors/warnings across src/.
- **[archive_only_evidence]** verification: npx prettier --check <10 touched files> (0) — All touched files use Prettier code style. (Whole-src format:check flags only the pre-existing, unrelated src/archive/archive.test.ts.)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: npx vitest run src/types/subagent-reports.test.ts (RED, pre-implementation)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: npx vitest run src/types/subagent-reports.test.ts (GREEN, post-implementation)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: npx vitest run src/temporal/workflow-bundle-boundary.test.ts src/utils/loop-ledger.purity.test.ts src/tools/followup.test.ts src/types/subagent-reports.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run typecheck (tsc --noEmit)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run lint (eslint src/)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: npx prettier --check <10 touched files>
- **[agenda]** follow_ups: Implementation must include _recovery-writers.ts:401-404 in trailing-newline enforcement (C2 covers recovery archive-sidecar writes, not just archive.ts).
- **[agenda]** follow_ups: archive.ts has two archived-change write code paths (~817-855 and ~958-993); ensure both get the trailing newline to avoid a path-dependent regression.
- **[agenda]** follow_ups: Optional future refactor (out of scope here): centralize JSON+newline writes behind a helper to prevent recurrence (P29), tracked separately per DONT3/OOS4.
- **[archive_only_evidence]** sources: temporal/contracts.ts subagentReportKey definition: Pure string-composition helper. Type-only deps: SubagentReportScope, SubagentAgent (imported from ../types). No runtime deps, no node:*, no side effects. Trivially relocatable.
- **[archive_only_evidence]** sources: types/subagent-reports.ts import surface: Imports only `zod` and `./wisdom`. Fully workflow-safe host module for subagentReportKey. SubagentAgent/SubagentReportScope already defined here.
- **[archive_only_evidence]** sources: Workflow bundle boundary test: Forbids only storage/, tools/, tool-registry, plugin-init, node:*, and defineUpdate from workflow-reachable set. Moving helper into types/ trips none of these; change-state.ts already imports from ../types.
- **[archive_only_evidence]** sources: subagentReportKey consumer map: 7 production + 1 test consumer confirmed. All can retarget import to types-layer owner with identical key output (C1/AC4).
- **[archive_only_evidence]** sources: atomicWriteFile verbatim-write behavior: Writes content byte-for-byte; adds no formatting/newline. Confirms C2: trailing newline must be added at each JSON.stringify call site, not delegated to atomicWriteFile.
- **[archive_only_evidence]** sources: Archive JSON write sites: change.json/wisdom.json/multi-repo-archive.json written via JSON.stringify(...,null,2) in two archive code paths plus one recovery archive-sidecar. All lack trailing newline today.
- **[archive_only_evidence]** sources: Current spec vs stale assertions: Spec is already version 1.7.1 with rq-subagentReports23 present; test still asserts 1.6.0 and requirement list ending at rq-subagentReports22. Assertions are stale, not the spec.
- **[archive_only_evidence]** sources: POSIX text-file newline convention: Canonical text files terminate the final line with a newline. Explicit trailing-newline for generated JSON is the boring, proven convention and aligns with git diff --check expectations (AC6).
- **[archive_only_evidence]** architecture_assessment: All three decisions are minimal, boring, and behavior-preserving. (1) Relocating subagentReportKey from temporal/contracts to types/subagent-reports moves a pure, dependency-free helper to the layer that already owns its only type dependencies; the workflow bundle boundary test forbids only storage/tools/tool-registry/plugin-init/node:* and defineUpdate, none of which types/ can introduce, so Temporal replay/bundle safety is preserved and the loop-ledger projector's purity boundary becomes structurally true rather than nominal. Rejecting a temporal/contracts re-export shim (DONT2) is correct: a shim would leave the exact boundary smell the change exists to remove. (2) atomicWriteFile writes verbatim, so owning the trailing newline explicitly at each JSON.stringify boundary (both archive code paths + the recovery archive-sidecar) is the correct C2 placement; scope is bounded to bundle JSON trailing newlines (DONT3) and does not rewrite historical bundles (C3/OOS3). (3) The two asset assertions are stale relative to a spec already at 1.7.1 with rq-subagentReports23; updating the exact expected values (not weakening .toEqual to .toContain or a >= check) preserves assertion strength while isolating the unrelated advance-workflow 1.26.0 pin (DONT1).
- **[unresolved_action]** required_main_agent_actions: packet_defect: respawn the reviewer with `SCOPE KEY: review:acceptance` (alongside CHANGE, ATTEMPT, PHASE, WORKING DIRECTORY, and BRIEFING PACKET).
- **[unresolved_action]** required_main_agent_actions: Do not complete acceptance until independent review verifies AC1–AC7, including parent/diff evidence for the two advance-workflow version-pin failures.
- **[archive_only_evidence]** verification: tests_run= results=n/a — No repository analysis or edits performed: required independent-review identity anchor was absent.
- **[unresolved_action]** required_main_agent_actions: Checkpoint plugin/src/archive/archive.ts and plugin/src/archive/archive.test.ts through the normal task checkpoint path before advancing; reviewer intentionally did not mutate task/gate state.
- **[unresolved_action]** required_main_agent_actions: Record Finding A as rejected_with_evidence/non-blocking in release-hardening evidence: DONT1 + AC7, unchanged parent/diff proof, and no advance-workflow pin edits.
- **[unresolved_action]** required_main_agent_actions: Leave plugin/src/archive/index.ts public surface unchanged; no action required for Finding C.
- **[wisdom_candidate]** wisdom_candidates: [pattern] Archive serialization helpers accepting unknown must guard JSON.stringify's undefined return, not rely on template interpolation; this turns malformed output into a deterministic local failure.
- **[archive_only_evidence]** changes_made: plugin/src/archive/archive.ts: Added a structural guard that rejects values for which JSON.stringify returns undefined, preventing template interpolation from writing invalid archive JSON.
- **[archive_only_evidence]** changes_made: plugin/src/archive/archive.test.ts: Added regression coverage proving bundleJsonStringify rejects undefined rather than producing an invalid JSON artifact.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/archive/archive.test.ts, bin/oc-test targeted -- src/archive/archive.test.ts src/tools/_recovery-writers.test.ts, git diff --check results=pass — Archive suite passed 21/21, then archive plus recovery-writer suites passed 40/40. git diff --check exited clean. Call-site review covered archived Change objects, wisdom wrapper objects, typed MultiRepoArchiveMetadata, and recovery's updated Change; each is JSON-serializable. Existing full-suite evidence records only the two unrelated advance-workflow 1.26.0 pin failures permitted by AC7.
- **[agenda]** follow_ups: Two unrelated advance-workflow 1.26.0 version-pin failures remain outside this change; non-blocking under AC7 and DONT1.

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| SC3 | success_criterion | pass |
| SC4 | success_criterion | pass |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| AC6 | acceptance_criterion | pass |
| AC7 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| OOS1 | out_of_scope | not_applicable |
| OOS2 | out_of_scope | not_applicable |
| OOS3 | out_of_scope | not_applicable |
| OOS4 | out_of_scope | not_applicable |

## Unresolved Actions

- Have verification task tk-550e9ea0c687 record the remaining failures (2× advance-workflow 1.26.0-vs-1.27.0 pin; intermittent temporal epic_membership) as pre-existing and unrelated under AC7 with parent/diff evidence.
- Investigate why `pnpm test -- <file>` / `-t` does not narrow vitest collection in this repo (full suite runs regardless of filter); affects signal-to-noise for targeted engineer verification.
- finish_owned_scope_then_report: Two unrelated advance-workflow version-pin failures (1.26.0 expected vs 1.27.0 actual) in ops-follow-up-assets.test.ts and adv-skill-backed-commands-assets.test.ts, plus an intermittent temporal epic_membership signal-handler failure, appear in the full suite. None are caused by this task's two-file diff; they are pre-existing baseline/subsystem failures.
- verification_missing: No adv_run_test evidence found for reported command: pnpm test -- src/subagent-reports-spec-assets.test.ts src/ops-follow-up-assets.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm test -- src/subagent-reports-spec-assets.test.ts src/ops-follow-up-assets.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm test -- src/subagent-reports-spec-assets.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm test -- -t "subagent-reports spec exists and parses as a Spec|subagent-reports version is at least 1.3.0"
- verification_missing: No adv_run_test evidence found for reported command: node -e (spec rq-list and version equality check)
- verification_missing: No adv_run_test evidence found for reported command: git diff --check
- Run bin/oc-test full for AC7 (gate-level, outside this task's inline TDD) and confirm any remaining failures are pre-existing/unrelated per parent/diff evidence.
- Mark task tk-38e52641f17a complete after review (engineer did not complete the task per instruction).
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/archive/archive.test.ts -t "archive bundle JSON artifacts end with exactly one trailing newline"
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/_recovery-writers.test.ts -t "appends a report to the ARCHIVE BUNDLE change.json"
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/archive/archive.test.ts -t "archive bundle JSON artifacts end with exactly one trailing newline"
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/_recovery-writers.test.ts -t "appends a report to the ARCHIVE BUNDLE change.json"
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/archive/archive.test.ts src/tools/_recovery-writers.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec tsc --noEmit
- verification_missing: No adv_run_test evidence found for reported command: git diff --check
- finish_owned_scope_then_report: During verification (`pnpm run format:check`), prettier flagged plugin/src/archive/archive.test.ts as unformatted. git status confirms it is NOT part of this task's modified set, so it is a pre-existing baseline issue in an unrelated subsystem. I left it untouched to avoid scope drift.
- verification_missing: No adv_run_test evidence found for reported command: npx vitest run src/types/subagent-reports.test.ts (RED, pre-implementation)
- verification_missing: No adv_run_test evidence found for reported command: npx vitest run src/types/subagent-reports.test.ts (GREEN, post-implementation)
- verification_missing: No adv_run_test evidence found for reported command: npx vitest run src/temporal/workflow-bundle-boundary.test.ts src/utils/loop-ledger.purity.test.ts src/tools/followup.test.ts src/types/subagent-reports.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run typecheck (tsc --noEmit)
- verification_missing: No adv_run_test evidence found for reported command: pnpm run lint (eslint src/)
- verification_missing: No adv_run_test evidence found for reported command: npx prettier --check <10 touched files>
- packet_defect: respawn the reviewer with `SCOPE KEY: review:acceptance` (alongside CHANGE, ATTEMPT, PHASE, WORKING DIRECTORY, and BRIEFING PACKET).
- Do not complete acceptance until independent review verifies AC1–AC7, including parent/diff evidence for the two advance-workflow version-pin failures.
- Checkpoint plugin/src/archive/archive.ts and plugin/src/archive/archive.test.ts through the normal task checkpoint path before advancing; reviewer intentionally did not mutate task/gate state.
- Record Finding A as rejected_with_evidence/non-blocking in release-hardening evidence: DONT1 + AC7, unchanged parent/diff proof, and no advance-workflow pin edits.
- Leave plugin/src/archive/index.ts public surface unchanged; no action required for Finding C.
