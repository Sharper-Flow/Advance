# Archive Briefing Digest

**Change ID:** fixOpsFollowupRegistration
**Title:** Fix ops followup registration
**Status:** archived
**Generated:** 2026-09-01T20:31:01.388Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY

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

Showing 17 of 17 durable facts.

- **[report_follow_up]** follow_ups: Spec drift (pre-existing, separate change): live advance-epics spec still names adv_epic_create/adv_epic_show/adv_epic_link_change and advance-workflow names adv_backlog_add, all host-unregistered with compensating paths — decide spec rewrite vs doc note.
- **[report_follow_up]** follow_ups: If CI can run a git show of dc461d3a during implementation, capture the diff as acceptance evidence; my attribution of followup removal as collateral is inferred from six independent in-repo signals, not the commit diff.
- **[report_follow_up]** follow_ups: Optional hardening: add an assert-on-registration list (tools that MUST be in ADV_TOOL_NAMES) so future group-wide registry subtractions fail loudly for named capabilities.
- **[research_citation]** sources: followup.ts implementation retained: followupTools.adv_followup_promote exported; store-based execute(args, store); dryRun supported — bindGroup-compatible, no EXPLICITLY_BOUND entry needed. (plugin/src/tools/followup.ts:565-654)
- **[research_citation]** sources: registry exclusion: No followupTools import; PUBLIC_TOOL_GROUPS lists 19 groups, followup absent; ADV_TOOL_NAMES derives from it (35 tools). (plugin/src/tool-registry.ts:72-91,949-969)
- **[research_citation]** sources: registry internal guard: createFullToolMap throws when a PUBLIC_TOOL_ENTRIES name lacks a baseToolMap binding — restore requires group membership AND binding together. (plugin/src/tool-registry.ts:711-729)
- **[research_citation]** sources.omitted: 8 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Existing pattern: ADV derives catalog, invoke lookup, degraded map, and warrant surface from PUBLIC_TOOL_GROUPS (tool-registry.ts:949-1011); role policy is exact-key-locked to derived names (tool-role-policy.test.ts:57-61). dc461d3a removed followupTools from registry+policy; everything downstream (handler, tests, preflight, realm/lifecycle metadata, tool-ownership.md, cli-surface-matrix.md, three live spec laws) was retained, leaving the surface internally consistent (CI green) but externally law-breaking. Reference pattern: restore at the derive point (group membership + bindGroup binding + role row) is exactly how every other tool reaches catalog/invoke — no one-off paths needed. Deviation after restore: NONE. The design's 4 named steps are necessary but NOT sufficient: (1) tool-title.ts entry is mandatory or inventory AC5 fails (hasExplicitAdvToolTitle, tool-title.ts:127-129; test at tool-registry.inventory.test.ts:238-245); (2) pinned count 35→36 at tool-registry.inventory.test.ts:261 must be updated — this same assertion IS the AC3 removal-guard; (3) realm metadata: deriveToolRealm('adv_followup_promote') falls back to 'change' (tool-catalog-entries.ts:258-265) since REALM_OVERRIDES/PREFIXES lack a followup mapping while realm 'followup' (line 172) and its lifecycle (line 321) sit dead — add a REALM_OVERRIDES row or the catalog emits misleading metadata (not test-enforced). Regression homes: registry parity auto-enforced (DDC1 + throw at tool-registry.ts:721-729), role parity auto-enforced, invoke dry-run belongs in adv-invoke.integration.test.ts (production lookup closure), catalog membership via adv_tool_catalog output.
- **[archive_only_evidence]** decisions: Restored the existing followupTools group through both runtime binding and PUBLIC_TOOL_GROUPS. — This preserves one canonical source for runtime registration, inventory, catalog metadata, degraded registration, and invoke lookup.
- **[archive_only_evidence]** decisions: Kept follow-up promotion orchestrator-owned and used the existing manual dry-run handler path. — The handler already enforces typed provenance, target trust, idempotency, and child profile seeding.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tool-registry.inventory.test.ts src/tool-role-policy.test.ts src/tool-catalog-entries.test.ts src/utils/tool-title.test.ts src/tools/adv-invoke.integration.test.ts (1) — RED: 5 focused suites ran and failed on the missing inventory entry, role row, title builder, realm override, and invoke dispatch.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tool-registry.inventory.test.ts src/tool-role-policy.test.ts src/tool-catalog-entries.test.ts src/utils/tool-title.test.ts src/tools/adv-invoke.integration.test.ts (0) — GREEN: 5 focused suites passed with 66 tests.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tool-registry.inventory.test.ts src/tool-role-policy.test.ts src/tool-catalog-entries.test.ts src/utils/tool-title.test.ts src/tools/adv-invoke.integration.test.ts src/tools/followup.test.ts (0) — Verification: 6 focused suites passed with 76 tests, including existing follow-up promotion semantics.
- **[archive_only_evidence]** verification: pnpm run typecheck && pnpm run generate:manifests:check && pnpm run format:check (0) — Verification: TypeScript, generated manifest parity, and Prettier checks passed.
- **[unresolved_action]** required_main_agent_actions: Record this report as independent acceptance evidence and retain the parent-reproduction evidence for the prompt-floor limitation.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] The prompt-floor check measures user-level OpenCode instructions and skills outside the repository. A host configuration increase can fail an unchanged commit, so acceptance evidence must compare the same host state against the parent.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/tool-registry.inventory.test.ts src/tool-role-policy.test.ts src/tool-catalog-entries.test.ts src/utils/tool-title.test.ts src/tools/adv-invoke.integration.test.ts src/tools/followup.test.ts src/tools/agenda-retirement.test.ts src/utils/tool-arg-preflight.test.ts, pnpm --dir plugin run check, pnpm --dir plugin run lint && pnpm --dir plugin run format:check, git diff --check HEAD^ HEAD results=pass — Independent review found complete SC1-SC2 and AC1-AC5 traceability. The canonical group supplies one inventory entry, runtime binding, catalog metadata, orchestrator policy, explicit title, and invoke dispatch. Removing the group breaks runtime/inventory parity, while removing all registry wiring leaves the exhaustive role-policy key test red. The invoke test reaches the unchanged handler and proves success:true, dryRun:true, and bounded would_create. Existing handler tests cover target-path trust forwarding, idempotent duplicate detection, dry-run non-mutation, source validation, and retired agenda rejection. No epic/backlog registry tools returned. Eight focused files passed with 163 tests. Typecheck, schema check, and manifest check passed before the full check stopped at the host-dependent prompt-floor regression. The supplied base evidence reproduced that same failure on parent ed11ea17, and the check reads user-level OpenCode files outside the repository. Lint, format, diff hygiene, and clean-worktree checks passed. All 12 review dimensions passed: correctness, contract traceability, tests, security/trust, error handling, data integrity/idempotency, architecture, maintainability, performance, compatibility, scope, and release readiness.

## Contract / AC Coverage

No contract items.

## Unresolved Actions

- Record this report as independent acceptance evidence and retain the parent-reproduction evidence for the prompt-floor limitation.
