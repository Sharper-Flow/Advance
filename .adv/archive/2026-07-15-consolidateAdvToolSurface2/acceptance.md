# Acceptance

Reviewed at: 2026-07-15T15:45:07.948Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | The final canonical ADV tool count is lower than the source baseline captured at implementation start, and the baseline/final counts are asserted by tests. | pass | ADV_PUBLIC_TOOL_BASELINE_COUNT=80; retained canonical list is 78; inventory test asserts exact removal accounting. |
| SC2 | success_criterion | Every retained tool has one consistent registration, argument, title, discovery, warrant, and role-visibility representation. | pass | Typed PUBLIC_TOOL_GROUPS derives names and warrant surface; parity tests cover runtime, degraded map, args, and titles. |
| SC3 | success_criterion | Agents receive only role-authorized tools while required orchestrator and operator workflows remain available. | pass | Exhaustive code-owned role policy and exact manifest tests passed. |
| SC4 | success_criterion | Removed legacy and latent tools have no executable or active-reference residue. | pass | Five-name tombstone/reference checks and repo-wide cleanup passed. |
| AC1 | acceptance_criterion | `adv_roadmap` remains the sole backlog reader, preserves `source: "file" | "live"`, and provides bounded freshness plus O(1) active-change annotation without per-change workflow-query fan-out. | pass | Roadmap tests cover file/live behavior, <=100 batching, TTL freshness, and typed annotations_unavailable without fallback. |
| AC2 | acceptance_criterion | `adv_backlog_state` is absent from executable registration, canonical/degraded tool lists, tool metadata, prompts, agent allowlists, documentation, specs, and tests. | pass | Tombstone, registry, preflight, title, docs/spec, and asset checks prove adv_backlog_state removed. |
| AC3 | acceptance_criterion | `adv_project_wisdom_list` is absent from executable registration, canonical/degraded tool lists, tool metadata, prompts, agent allowlists, documentation, and tests; `adv_wisdom_list` without `changeId` remains able to return project-scoped wisdom. | pass | Wisdom tests prove project_only/maxEntries branch, filtering-before-limit, and specialized-tool removal. |
| AC4 | acceptance_criterion | `adv_gate_criteria`, `adv_epic_update_scope`, and `adv_epic_merge` have no implementation, export, test, or active reference. | pass | Latent-tool removal test verifies three definitions absent from groups, canonical names, and warrant surface. |
| AC5 | acceptance_criterion | Every retained callable has exactly one matching executable registration, canonical/degraded entry, declared-argument surface, title entry, prompt/agent reference, and role-allowlist classification; deterministic tests fail on divergence. | pass | Inventory parity suite verifies exact retained registration, degraded, warrant args, title, and canonical-name surfaces. |
| AC6 | acceptance_criterion | Every ADV agent allowlist is a strict subset of its documented responsibility classification; tests reject a role-irrelevant or unregistered ADV tool entry. | pass | Role-policy suite verifies exact manifests, default-deny order, and policy/document parity. |
| AC7 | acceptance_criterion | Archive/purge/repair, task checkpoint/update/cancel, Temporal repair, store maintenance, and cross-project trust-boundary operations remain distinct and retain existing approval, evidence, recovery, atomicity, and privacy safeguards. | pass | Review found no merged safety paths; policy preserves operator-only and action-level dual boundaries. |
| AC8 | acceptance_criterion | Active specs, CLI bridge guidance, tool ownership documentation, prompt assets, and release notes identify removed tools and replacement paths; `pnpm run check` and targeted removal/parity tests pass. | pass | Targeted 24-file/426-test, full 359-file/5370-test, and plugin pnpm run check passed; replacement docs and release notes added. |
| C1 | constraint | `adv_roadmap` remains the canonical backlog name and CLI bridge; no new `adv_backlog` tool is introduced. | respected | adv_roadmap retained; no adv_backlog introduced. |
| C2 | constraint | Backlog annotation retains the bounded single Visibility-query approach, batching issue numbers at 100 or fewer per query. | respected | Roadmap annotation path batches issue numbers at <=100. |
| C3 | constraint | CLI roadmap output does not fabricate active-change annotations from disk; annotation remains explicit MCP behavior. | respected | CLI remains thin; annotation degradation is explicit MCP output. |
| C4 | constraint | Removed tools have no wrapper, alias, forwarding endpoint, compatibility export, or hidden fallback. | respected | Removed names absent; tombstone tests reject aliases/active residues. |
| C5 | constraint | Tool-surface correctness is structural: use schemas, descriptors, parity tests, and preflight validation rather than prompt-only rules. | respected | Typed inventory, exact parity tests, preflight, and policy maps enforce tool-surface correctness. |
| C6 | constraint | Agent role scoping must not grant a tool across a destructive, privacy, approval, or cross-project trust boundary merely for fallback convenience. | respected | Default-deny wildcard precedes grants; operator-only tools restricted to orchestrator policy. |
| C7 | constraint | Preserve the current source-mode behavior of `adv_roadmap` and the existing project/change scope semantics of `adv_wisdom_list`. | respected | Roadmap source modes and wisdom aggregate/change semantics retained; project-only branch is explicit. |
| DONT1 | avoidance | Do not create a universal `adv` action router. | respected | Explicit createToolMap retained; no universal action router introduced. |
| DONT2 | avoidance | Do not keep compatibility wrappers, aliases, or deprecation shims for removed tools. | respected | All five removals are destructive; no wrappers or aliases. |
| DONT3 | avoidance | Do not merge safety-distinct archive, task, Temporal, store, or cross-project operations. | respected | Review verified archive/task/Temporal/store/cross-project operations remain separate. |
| DONT4 | avoidance | Do not retain latent unreachable code merely because archived artifacts described it as shipped. | respected | Latent definitions and owned helpers/tests removed; retained workflow behavior preserved. |
| DONT5 | avoidance | Do not report a clean conflict scan while Temporal inventory has deadline omissions. | respected | Discovery recorded Temporal inventory degradation; no false clean conflict claim. |
| OOS1 | out_of_scope | Reintroducing Agenda tools or Agenda workflow authority. | not_applicable | No Agenda authority reintroduced. |
| OOS2 | out_of_scope | Renaming or replacing `adv_roadmap` with a new `adv_backlog` tool. | not_applicable | No new adv_backlog tool. |
| OOS3 | out_of_scope | Broad redesign of the GitHub Project/file backlog model beyond absorbing `adv_backlog_state` freshness and annotation behavior. | not_applicable | Backlog model retained; only state-reader behavior folded into roadmap. |
| OOS4 | out_of_scope | Changes to default response shapes for unrelated retained tools. | not_applicable | No unrelated retained-tool response shapes changed. |

