# Archive Briefing Digest

**Change ID:** verifyOpencodeToolVisibility
**Title:** Verify OpenCode tool visibility
**Status:** archived
**Generated:** 2026-07-28T07:01:08.241Z

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

Epic: optimizeAdvToolSurface · Verify OpenCode tool visibility semantics (blocking prereq) (order 1)

## Durable Facts

Showing 15 of 15 durable facts.

- **[archive_only_evidence]** verification: tests_run=npx tsx scripts/check-frontmatter.ts results=pass — Ran from plugin/; exit 0 with `frontmatter check passed: 42 file(s) scanned`. plugin/scripts/check-frontmatter.ts imports parseFrontmatterText and assertPolicyMatch from ../src/utils/manifest-frontmatter (lines 16-20); plugin/package.json chains the script in scripts.check (line 24).
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: npx tsx scripts/check-frontmatter.ts
- **[archive_only_evidence]** verification: tests_run= results=n/a — Static deploy-preflight review: scripts/deploy-local.sh check_agent_frontmatter invokes `./node_modules/.bin/tsx scripts/check-frontmatter.ts --deploy "$asset_dir"` (lines 616-628), not a Python heuristic. The agent-copy loop invokes _check_single_asset_frontmatter for every non-repo-local, non-overlay .opencode/agents/*.md asset before copy (lines 1653-1677). A local repository-wide literal search found no `--force` in scripts/deploy-local.sh.
- **[archive_only_evidence]** verification: tests_run=npx tsx scripts/check-frontmatter.ts results=pass — Ran from plugin/; exit 0 with `frontmatter check passed: 42 file(s) scanned`. The Invoke routing note is after the closing frontmatter delimiter in adv.md (lines 76-77) and adv-tron.md (lines 55-56); the same note was found in all 11 .opencode/agents manifests, including the requested seven. .opencode/command/adv-archive.md line 3 and adv-task.md line 3 use double-quoted description values.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: npx tsx scripts/check-frontmatter.ts
- **[archive_only_evidence]** verification: tests_run=plugin/: npx tsx scripts/check-frontmatter.ts (exit 0), plugin/: npx tsx -e YAML frontmatter probe for adv-tron.md, adv.md, adv-verifier.md (exit 0) results=pass — 1) check-frontmatter.ts exited 0: 42 manifests scanned. 2) adv-tron.md parsed: 11 adv_* true grants; adv_spec absent. 3) adv.md parsed: 18 adv_* true grants; adv_archive_purge absent. 4) adv-verifier.md parsed: 11 adv_* true grants.
- **[report_follow_up]** follow_ups: Add explicit tests that malformed ADV-owned assets cannot be deployed under any flag, while user-owned overlay targets warn and preserve the nonzero classification required by their applicable path.
- **[report_follow_up]** follow_ups: Validate runtime placement so the bounded scan cannot turn a warning-only manifest defect into tryInitStore failure.
- **[research_citation]** sources: Existing deploy guard: Existing guard is a Python duplicate-key heuristic that skips no-colon lines; it is called only for adv.md at line 883. (file:///home/jon/dev/advance/scripts/deploy-local.sh#L616-L683)
- **[research_citation]** sources: Existing generator: Generator calls injectTier4InvokeRoutingNote; current implementation performs content-wide regex replacement without a frontmatter boundary. (file:///home/jon/dev/advance/plugin/scripts/generate-agent-manifests.ts#L257-L276)
- **[research_citation]** sources: Plugin init call path: Plugin initialization invokes tryInitStore; this is the cited init hook. (file:///home/jon/dev/advance/plugin/src/index.ts#L395-L405)
- **[research_citation]** sources.omitted: 3 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: KD1 and KD2 rest on verified code levers: the deploy check is a colon-dependent duplicate-key heuristic and the generator note injector is content-wide. A shared yaml@2 parser core is structurally stronger and simpler than maintaining three validators. However, DDC4's proposed deploy --force bypass contradicts the approved prevention/blocking objective unless removed or explicitly re-contracted. Spec-law implications: no existing manifest-specific law was found; advance-meta rq-deployAssetContinuation01 must remain satisfied.
- **[unresolved_action]** validation.blockers: DDC4 proposes a deploy --force escape hatch, but AC5 requires deploy to block ADV-owned invalid assets. Existing source search finds no deploy-local --force option to preserve.
- **[epic_terminal_note]** epic.membership: optimizeAdvToolSurface · Verify OpenCode tool visibility semantics (blocking prereq) (order 1)

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
| AC8 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| C5 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| DONT4 | avoidance | respected |
| DONT5 | avoidance | respected |
| DONT6 | avoidance | respected |
| OOS1 | out_of_scope | not_applicable |
| OOS2 | out_of_scope | not_applicable |
| OOS3 | out_of_scope | not_applicable |
| OOS4 | out_of_scope | not_applicable |
| OOS5 | out_of_scope | not_applicable |
| OOS6 | out_of_scope | not_applicable |
| OOS7 | out_of_scope | not_applicable |
| OOS8 | out_of_scope | not_applicable |

## Unresolved Actions

- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: npx tsx scripts/check-frontmatter.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: npx tsx scripts/check-frontmatter.ts
- DDC4 proposes a deploy --force escape hatch, but AC5 requires deploy to block ADV-owned invalid assets. Existing source search finds no deploy-local --force option to preserve.
