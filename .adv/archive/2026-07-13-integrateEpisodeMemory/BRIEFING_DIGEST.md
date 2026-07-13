# Archive Briefing Digest

**Change ID:** integrateEpisodeMemory
**Title:** Integrate Episode Memory
**Status:** archived
**Generated:** 2026-07-13T03:15:46.389Z

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

Showing 9 of 9 durable facts.

- **[agenda]** follow_ups: Design/agreement wording: acknowledge native episode_recall folds shared 'global' namespace into active-project recall (advisory-only).
- **[agenda]** follow_ups: Asset test: assert namespace=active-project and top_k<=5 in the source-owned recall instruction to catch drift toward omitted-namespace all-namespace recall.
- **[agenda]** follow_ups: ADV state for change integrateEpisodeMemory was not reachable from this session (owner project /home/jon/dev/advance; workflow not found); validated against packet-inline AGREEMENT + DESIGN plus target_path disk snapshot evidence.
- **[archive_only_evidence]** sources: Episode MCP episode_recall tool schema (in-scope tool contract): Native recall exposes namespace (nullable) + query (required) + top_k (nullable, default 8), returns hits with similarity score. namespace searches 'its memories plus the shared global namespace'. Confirms native namespace/top_k support; no wrapper needed. top_k<=5 is a valid subset of default 8.
- **[archive_only_evidence]** sources: ADV agent grant mechanism + asset-test pattern: Agent tool grants live in .opencode/agents/*.md YAML frontmatter tools: block. getToolGrant() asserts true/false/absent. Negative-grant pattern (=== null, task:false, 'NO orchestration mutations') is idiomatic — directly supports forbidden episode_remember/forget/stats grant tests.
- **[archive_only_evidence]** sources: Structural asset-test convention (source-owned instructions): 56+ *-assets.test.ts use readFileSync + regex to assert required clauses present and forbidden phrasing absent on source-owned markdown. Design's 'source-owned instructions + structural asset tests prove required grant/clauses and forbidden direct-write grant' maps exactly onto this established pattern.
- **[archive_only_evidence]** sources: Researcher agent lifecycle role + MCP grant model: adv-researcher runs /adv-discover, /adv-design, /adv-research and receives per-agent MCP grants (Context7, Exa, lgrep). Confirms discovery + adv-researcher are the correct read-only recall grant surfaces.
- **[archive_only_evidence]** sources: No pre-existing Episode references in advance source: Net-new integration; no prior grant to extend. No deploy-side MCP registration in advance/scripts, consistent with 'deploy does not register service' (host/user-owned MCP registration per global config).
- **[archive_only_evidence]** architecture_assessment: Design is a minimal, boring, structurally-correct integration. It grants exactly one net-new read-only capability (episode_recall) to the two lifecycle surfaces (discovery command + adv-researcher) that already own research context loads, using native Episode semantics (namespace + top_k<=5) with no wrapper — matching the established per-agent MCP grant model. Forbidden write/delete grants (episode_remember/forget/stats) and the source-owned-instructions + structural-asset-test enforcement both map directly onto idiomatic ADV conventions (getToolGrant negative assertions; readFileSync+regex clause tests). Outage tolerance (skip recall, bounded warning, never block gates) is the correct posture because ADV does not own the Episode service lifecycle, and advisory recall cannot authorize workflow state — preserving structural correctness (P33). Existing wisdom/reflection ingestion stays on the ordinary write path, unchanged. One minor semantic gap: native episode_recall folds the shared 'global' namespace into any namespaced search, so 'active-project scope' is not strict single-namespace isolation; low-risk for advisory recall but should be acknowledged in design/agreement wording.

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| SC3 | success_criterion | pass |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| DONT4 | avoidance | respected |
| OOS1 | out_of_scope | not_applicable |
| OOS2 | out_of_scope | not_applicable |
| OOS3 | out_of_scope | not_applicable |

## Unresolved Actions

None
