# Acceptance

Reviewed at: 2026-07-30T06:15:00.000Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | Ten overlapping same-project ADV agents—including orchestrators and sub-agents—can remain serviceable within the existing 60 GB RAM / 16-core host budget. | pass | Historical 12-agent same-project peak and corrected per-project interval evidence; resource limits stated without synthetic latency claim. |
| SC2 | success_criterion | Runtime behavior, diagnostics, docs, and spec law describe the same concurrency policy. | pass | Runtime, status, ADR, specs, and generated assets use one resolved policy. |
| SC3 | success_criterion | Coding work cannot mutate shared trunk; approved deployment remains safely trunk-only. | pass | Target guards and trunk operations gates implemented/review READY. |
| SC4 | success_criterion | Parallel worktrees cannot interfere through mutable ports, databases, generated state, or dependency installation. | pass | Backend/frontend resource isolation implementations review READY. |
| SC5 | success_criterion | Remote/default-branch release proof is not invalidated by an unsafe local fast-forward. | pass | Archive local sync remains non-authoritative to remote release proof. |
| SC6 | success_criterion | Agents make code judgments and push decisions from a sufficiently current default-branch view. | pass | Target freshness wrappers enforce shared 60-second suppression. |
| AC1 | acceptance_criterion | With default configuration, no same-project session is left unable to process ADV state operations because another session owns a project worker lock; explicit singleton configuration remains compatible. | pass | Default per-session routing and explicit singleton compatibility regression matrix passes. |
| AC2 | acceptance_criterion | `adv_status` reports the same effective concurrency and worktree-protection values consumed by runtime, including whether each value was explicit or defaulted. | pass | Status/runtime omitted, explicit, invalid policy parity tests pass. |
| AC3 | acceptance_criterion | Existing historical/current evidence records the observed 12-agent overlap, session composition, queue-failure result, worker-memory range, and limits of inference; it must not claim ten independent-orchestrator latency was measured. | pass | Collector partitions verified intervals per project, unknown roles separate, historical 12/6 separately sourced; 16 tests pass. |
| AC4 | acceptance_criterion | After proven remote merge, dirty, diverged, wrong-branch, or unreachable local trunk remains unmodified; archive completion reports precise local-sync state and remediation. | pass | 204 archive helper/Phase 9 tests prove dirty/diverged/wrong-branch no mutation and remote proof authority. |
| AC5 | acceptance_criterion | In pokeedge and pokeedge-web, coding writes from trunk are blocked. Deployment runs only from a clean, current default checkout through explicitly approved operations; no deployment branch or operations worktree is created. | pass | Backend/frontend implementations enable guards and canonical ops gates; target reviews READY and matrices 17/17. |
| AC6 | acceptance_criterion | Brief concurrent worktree-creation lock ownership is absorbed within a bounded wait; exhaustion returns structured `BRANCH_LOCKED` without duplicate branch/worktree registration. | pass | Bounded lock retry deterministic tests pass; BRANCH_LOCKED retains structured exhaustion. |
| AC7 | acceptance_criterion | New worktrees in both target repos receive isolated mutable runtime resources or fail setup explicitly. Existing materialized worktrees remain usable. | pass | Target bootstrap/resource isolation execution done and reviews READY. |
| AC8 | acceptance_criterion | Freshness checks occur before code judgments, before push/PR, and after waits; shared fetch suppression is at most 60 seconds in both target repos. | pass | Both target wrappers set TTL 60; trigger routing implemented. |
| AC9 | acceptance_criterion | Automated regression coverage binds omitted, explicit, and invalid feature configuration to one effective value across runtime and diagnostics. | pass | One effective-value matrix binds runtime and diagnostics. |
| AC10 | acceptance_criterion | Current singleton spec law is reconciled with per-session routing and a ten-agent support target; no active spec simultaneously mandates client-only peers and per-session serviceability. | pass | Current specs reconcile per-session default and conditional singleton; generated checks pass. |
| C1 | constraint | Do not run a synthetic ten-session load test; use historical/current session, queue, memory, and repository data. | respected | No synthetic ten-session load test run. |
| C2 | constraint | Deliver as a coordinated three-repo outcome with independently tracked and merged changes in Advance, pokeedge, and pokeedge-web. | respected | Three independently tracked changes created; target terminal release follows Advance deployment per approved reentry. |
| C3 | constraint | Preserve existing dirty-trunk work until inspected and relocated; never discard it as cleanup. | respected | Dirty trunk work preserved local-only or removed only with explicit approval. |
| C4 | constraint | Keep Temporal workflow contracts, signals, and workflow-reachable import boundaries unchanged unless design proves an unavoidable contract need and re-enters agreement. | respected | Temporal workflow contracts/signals and workflow import boundaries unchanged. |
| C5 | constraint | Preserve explicit singleton compatibility while reconciling its spec semantics. | respected | Explicit singleton compatibility retained with safe pinned-queue refusal. |
| C6 | constraint | Release authority remains canonical remote/default-branch reachability, not local checkout state. | respected | Remote/default reachability remains release authority. |
| C7 | constraint | Deployment, rebuild, install, release, and publish operations run only from merged, current trunk. | respected | No deployment/rebuild/install/release executed from worktrees. |
| DONT1 | avoidance | Do not patch only one wrong boolean while retaining parallel feature-default owners. | respected | All feature readers consolidated, not one-line patched. |
| DONT2 | avoidance | Do not let status report policy that runtime does not consume. | respected | Status consumes same typed policy as runtime. |
| DONT3 | avoidance | Do not expose prose-only or uncallable workflow steps. | respected | Uncallable command prose removed; executable handler seam added. |
| DONT4 | avoidance | Do not add an internal `git-finalize.ts` caller forbidden by its boundary test. | respected | No internal git-finalize caller added. |
| DONT5 | avoidance | Do not make local trunk divergence a false release failure. | respected | Local divergence never becomes release failure. |
| DONT6 | avoidance | Do not create deployment branches or operations worktrees. | respected | No deployment branch or operations worktree introduced. |
| DONT7 | avoidance | Do not weaken worktree cleanup, lease, integration, or terminal-proof authority. | respected | Cleanup, lease, and terminal proof authority preserved. |
| DONT8 | avoidance | Do not add polling loops or periodic freshness daemons. | respected | No polling loop or freshness daemon added. |
| DONT9 | avoidance | Do not bulk-delete existing worktrees/branches in this change. | respected | No bulk worktree/branch deletion in current change. |
| DONT10 | avoidance | Do not redesign target-repo CI pipelines or cross-repo merge automation. | respected | No target CI or merge-order automation redesign. |
| OOS1 | out_of_scope | Temporal workflow contract and signal redesign. | not_applicable | No Temporal workflow contract/signal redesign. |
| OOS2 | out_of_scope | Worktree flock, lease, cleanup-authority, or release-gate redesign. | not_applicable | No worktree flock/lease/cleanup authority redesign. |
| OOS3 | out_of_scope | Bulk retirement of existing worktrees and local branches. | not_applicable | Fleet migration tracked as migrateExistingAdvWorktrees. |
| OOS4 | out_of_scope | Target-repo CI pipeline redesign. | not_applicable | No CI redesign. |
| OOS5 | out_of_scope | Cross-repo merge-order automation. | not_applicable | No cross-repo merge automation. |
| OOS6 | out_of_scope | Production deployment execution as part of the ADV release gate. | not_applicable | No production deployment execution in release gate. |

