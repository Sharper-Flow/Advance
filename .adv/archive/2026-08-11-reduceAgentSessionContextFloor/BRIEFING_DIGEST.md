# Archive Briefing Digest

**Change ID:** reduceAgentSessionContextFloor
**Title:** Reduce agent session context floor
**Status:** archived
**Generated:** 2026-08-11T18:50:04.300Z

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

Showing 72 of 72 durable facts.

- **[report_follow_up]** follow_ups: Audit each ADV agent markdown body to classify which lines are load-bearing baseline framing (cannot trim) vs redundant (safe to trim) — Q1 makes this mandatory before any manifest cut.
- **[report_follow_up]** follow_ups: Verify provider prompt-cache hit-rate for the stable system-prefix in practice; this determines whether the per-turn byte cost (Q2) translates to billed-token cost or only context-window cost.
- **[report_follow_up]** follow_ups: Track OpenCode V2 activation status; when durable-delta instruction model lands, re-verify that global instructions[] still loads into every session and that the no-merge rule does not break ADV's current global+project instruction assumptions.
- **[report_follow_up]** follow_ups: Confirm whether upstream issue #34721 (additive custom system prompts) has progressed — if additive mode ships, Q1 constraint relaxes and manifest trimming becomes lower-risk.
- **[research_citation]** sources: sst/opencode request.ts (system assembly + agent.prompt ternary): DEFINITIVE: system[0] = (agent.prompt ? [agent.prompt] : SystemPrompt.provider(model)) joined with input.system. Agent prompt REPLACES stock provider prompt (exclusive OR), not appended. (github.com/sst/opencode@d041eee packages/opencode/src/session/llm/request.ts:51-57)
- **[research_citation]** sources: sst/opencode system.ts (provider + skills render): provider(model) returns model-specific stock prompt. skills(agent): early-return if Permission.disabled([skill]) (omits whole block); else skill.available(agent) then Skill.fmt(list,{verbose:true}). (github.com/sst/opencode@d041eee packages/opencode/src/session/system.ts:26-92)
- **[research_citation]** sources: sst/opencode skill/index.ts (available + fmt): available(agent) filters list via Permission.evaluate('skill',name,permission).action!=='deny' (REMOVAL at render, not call-time). fmt verbose renders name+description+location only; content/body NEVER in system prompt. (github.com/sst/opencode@d041eee packages/opencode/src/skill/index.ts)
- **[research_citation]** sources.omitted: 6 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Q1 (REPLACE, high confidence): request.ts:52 ternary `(agent.prompt ? [agent.prompt] : SystemPrompt.provider(model))` is an exclusive OR. Every ADV agent with a non-empty markdown body runs WITHOUT the stock anthropic/gpt/gemini baseline prompt — the manifest IS the baseline. Trimming manifests is load-bearing-risky, not free. Q2 (name+desc+location only; re-rendered every turn): Skill.fmt verbose emits no body; content loads lazily via skill tool. The full system block (skills+env+instructions+mcp) is rebuilt inside runLoop's while(true) on every model turn — true per-turn cost, mitigated only by provider prompt-cache hits. Q3 (render-time removal): Skill.available(agent) filters via Permission.evaluate before fmt; denied skills vanish from the catalog. permission.skill accepts glob-object deny. Q4 (V2): docs describe durable-delta rendering and no-merge config arrays; do not contradict Q1-Q3 but flag migration risk on instructions[] merging. Validation: caution — research fully resolved, but Q1 materially constrains the naive trim-manifests approach.
- **[report_follow_up]** follow_ups: Measure actual eager token/rule-count delta before/after on a representative session (e.g. adv-ci-waiter) to convert directional evidence into a local number.
- **[report_follow_up]** follow_ups: Extend plugin/src/manifest-doc-drift.test.ts to assert cross-surface pointer integrity: every load-class=lazy section has an eager pointer with non-empty trigger/description; no routing-trigger/behavior-gating invariant is lazy.
- **[report_follow_up]** follow_ups: Evaluate a host-level change so OpenCode subagents receive only their own system prompt (Claude Code subagent model) as a separate change; removes the 94%-inapplicable-floor problem for adv-ci-waiter structurally.
- **[report_follow_up]** follow_ups: Add a pnpm run check gate: byte budget (wc -c) + eager instruction-count cap on instructions[], modeled on entropyvortex/meta-llm-charter lint.yml.
- **[report_follow_up]** follow_ups: Episode recall was unavailable this session (namespace absent from active tool surface); re-evaluate whether to wire it for future reference tasks.
- **[research_citation]** sources: Claude Code memory (CLAUDE.md) docs: Target <200 lines/file; 'Longer files consume more context and reduce adherence.' Decision rule: move multi-step procedures or single-codebase sections to a skill or path-scoped rule; /doctor trims derivable content (layouts, deps, architecture overviews), keeps pitfalls/rationale/non-default conventions. Auto-memory MEMORY.md eager cap = 200 lines or 25KB. (https://docs.anthropic.com/en/docs/claude-code/memory)
- **[research_citation]** sources: Claude Code Skills docs: Core eager/lazy rule: 'Create a skill when a section of CLAUDE.md has grown into a procedure rather than a fact.' Body loads only when used. description+when_to_use truncated at 1536 chars in eager listing. 'Keep SKILL.md under 500 lines.' Skill content persists across turns once loaded. (https://docs.anthropic.com/en/docs/claude-code/skills)
- **[research_citation]** sources: Anthropic skill authoring best practices: Context window is a public good. description = discovery mechanism, must say WHAT and WHEN, third person, max 1024 chars. Body <500 lines. 3-level progressive disclosure: metadata always loaded (~100 tokens), body on trigger, bundled files on reference. Warns of undertrigger; mitigations = sharp/pushy descriptions + trigger keywords. (https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- **[research_citation]** sources.omitted: 12 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Cross-system consensus: the eager/lazy line runs on a single 2-axis test present in Claude Code, Cursor, Copilot, and Anthropic Skills. Axis 1 = fact/trigger vs procedure/recipe. Axis 2 = WHETHER-to-act vs HOW-to-act. Eager keeps facts, triggers, routing, behavior-gating invariants, and the non-default conventions/pitfalls a new contributor would need. Lazy gets multi-step procedures, reference recipes, tier matrices, shell snippets, and rationale prose. Anthropic codifies this as 3-level progressive disclosure: L1 metadata (name+description, ~100 tokens, always loaded, is the ONLY trigger) / L2 body (loaded on trigger, <500 lines) / L3 bundled files (on reference). The description/metadata layer must carry the WHEN, never the WHAT. The demotion failure mode is real and documented: Cursor rules with no description+no glob+no alwaysApply silently become Manual and never fire; Anthropic warns skills 'undertrigger' and prescribes pushy descriptions. Mandatory mitigation = every demoted item leaves a pointer+trigger in the eager layer AND the agent retains the fetch capability. SPEC-LAW IMPLICATION (folds required_validation_consistency + spec_law_implications, which are not persisted schema keys): this composes with ADV's existing advance-meta enforcement-class taxonomy by adding an ORTHOGONAL load-class axis (eager|lazy) so each section is (enforcement-class x load-class). fully-enforced routing triggers/behavior-gating invariants pin to eager (pointer line + constraint table already required); inherently-prose rationale may take lazy provided it leaves an eager pointer. The existing structural assertions in plugin/src/manifest-doc-drift.test.ts should extend to assert (a) every lazy section has an eager pointer with non-empty trigger/description and (b) no routing-trigger/behavior-gating invariant is load-class=lazy. validation.status (pass) equals the advisory required_validation_consistency.status (pass) — consistent. Published evidence that reducing instruction COUNT (not just bytes) is measurably worth it is strong and peer-reviewed: follow rate falls non-linearly ~96%->20% as rules stack (arXiv 2608.02639), perfect-response collapses to zero by N=80 rules (2607.19257), Anthropic's own docs state longer CLAUDE.md files reduce adherence. Caveat: no study measures the exact 19k->11k delta for ADV's set, so justification is directional, not locally quantified. The user's chosen conservative depth (demote only recipes/tier-matrices/shell-snippets/rationale; keep every routing trigger + behavior-gating rule eager) is exactly the safe pattern the evidence recommends. OpenCode's loader injecting the same ~76KB floor into every sub-agent (94% inapplicable for adv-ci-waiter) is non-canonical: Claude Code subagents by design receive only their own system prompt — the documented remedy.
- **[report_follow_up]** follow_ups: Implementation: audit each of the 5 REFERENCED rules (P33/P35/P37/P40/P41) for embedded exception/permission/named-prohibition clauses that must stay eager regardless of sentence position; do not apply a mechanical first-sentence-only split.
- **[report_follow_up]** follow_ups: Implementation: KD4 check-prompt-budget.ts must frame its gate as regression-against-baseline (consistent with rq-providerAdvMetrics01), not absolute-correctness; document this in the script header.
- **[report_follow_up]** follow_ups: Implementation: new rq-loadClassAxis01 should explicitly scope its surface set (config-home instructions[] + agent manifests + skill catalog) without implying rq-proseReduction01's ADV-surface enumeration changed.
- **[report_follow_up]** follow_ups: Prep: firm up the per-skill cost model (DDC4) with measured catalog-entry bytes to confirm each demoted body substantially exceeds its description (net-win invariant).
- **[report_follow_up]** follow_ups: Tracking: confirm R5 (per-agent prompt scoping via host loader #10688) is added to adv backlog during execution, as the design commits.
- **[report_follow_up]** follow_ups: Tooling gap: adv_spec(action:search) failed to find 'enforcement-class'/'fully-enforced' terms present in the spec body — report this search-index gap; do not rely on adv_spec search alone for spec-law validation.
- **[research_citation]** sources: sst/opencode request.ts (agent.prompt exclusive-OR ternary): VERIFIED at call site: ...(input.agent.prompt ? [input.agent.prompt] : SystemPrompt.provider(input.model)) joined with input.system. Confirms F1 — agent.prompt REPLACES stock provider prompt (exclusive OR). Line drifted from cited L51-57 (d041eee) to ~L56-60 (0d927ba trunk); mechanism intact. (github.com/sst/opencode packages/opencode/src/session/llm/request.ts (prepare()))
- **[research_citation]** sources: sst/opencode skill/index.ts (available + fmt): VERIFIED at call site: available(agent) filters via Permission.evaluate('skill',name,agent.permission).action!=='deny' BEFORE fmt; fmt verbose renders name+description+location only, NEVER content. Confirms F2 (lazy body) + F3 (render-time removal). (github.com/sst/opencode packages/opencode/src/skill/index.ts (Skill.available, Skill.fmt))
- **[research_citation]** sources: sst/opencode prompt.ts (per-turn system rebuild): VERIFIED at call site: Effect.all([sys.skills(agent), sys.environment(model), instruction.system(), sys.mcp(...)]) re-evaluated each loop iteration; system rebuilt per turn. Confirms F2 per-turn cost. (github.com/sst/opencode packages/opencode/src/session/prompt.ts (~L1245, inside loop))
- **[research_citation]** sources.omitted: 7 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: The design is architecturally sound and its lever citations are verified at behavioral call sites (P38-compliant), not declarations. All four upstream OpenCode mechanisms cited (agent.prompt exclusive-OR, skill available/fmt render-time filter, per-turn system rebuild, prompt field origin) confirmed against sst/opencode trunk. KD7's load-class axis composes orthogonally with the existing rq-proseReduction01 3-class enforcement taxonomy (fully/partially/inherently-prose) rather than replacing it. The design reuses the existing manifest-doc-drift.test.ts surface and extends it (accurate claim). The six-workstream scope is the minimum needed to hit the <=50KB target; the lowest-risk Phase A subset alone (~17KB) would miss it. No materially simpler approach achieves all 5 objectives while preserving SC4. Two refinements warranted before execution: (1) KD1's 'first-sentence' truncation rule should explicitly classify embedded exception/permission/named-prohibition clauses as load-class:eager; analysis shows P37's 'normal agent context' qualifier already does the role-scoping, making this belt-and-suspenders rather than a correctness hole; (2) KD3's canonical adv-state-access.md adds ~1KB to the shared floor (including to worker agents like adv-ci-waiter that lacked the section), but removes ~11.5KB of per-agent duplication across 6 manifests — net strongly positive on aggregate. Neither is a blocker: both fall within the design's existing R1/AC3/conservative-depth mitigation framework. SPEC-LAW: no contradiction. load-class is orthogonal to rq-proseReduction01's taxonomy. KD4 budget baselines comply with rq-proseReduction03 (live in a check script, not a standing inventory). New skills must follow rq-skillProseCompression01. One consistency note: rq-providerAdvMetrics01 says 'must not impose a hard prompt-size cap as correctness proof' — KD4's gate must stay framed as regression-against-baseline (the design's wording already does this). NOTE: adv_spec(action:search) returned empty for terms confirmed present in the spec body (enforcement-class, fully-enforced) — a search-index gap; verified via grep on the git-tracked spec.json.
- **[archive_only_evidence]** decisions: Added the identical 12-entry permission.skill deny map to all seven manifests, preserving existing permission entries. — The task requires hand-written per-agent skill gating; existing permissions remain unchanged.
- **[archive_only_evidence]** decisions: Ran generate:manifests:check from plugin/. — This repository keeps package.json and the manifest generator under plugin/; the requested root invocation correctly failed with no package.json, then the documented package-directory invocation passed.
- **[archive_only_evidence]** verification: rg -l 'cloudflare\*' .opencode/agents/*.md || exit 1 (1) — Expected RED: zero deny-glob matches before edits.
- **[archive_only_evidence]** verification: rg -l 'cloudflare\*' .opencode/agents/*.md (0) — GREEN: exactly the seven requested manifests matched.
- **[archive_only_evidence]** verification: pnpm run generate:manifests:check (0) — Verify passed from plugin/: all agent manifests match generated output.
- **[archive_only_evidence]** decisions: Edited only three manifests. — adv.md and adv-researcher.md already lacked the requested duplicate headings; changing them would add no value.
- **[archive_only_evidence]** decisions: Preserved ADV State Access Policy sections. — The task explicitly reserves those sections for a separate canonical-promotion task.
- **[archive_only_evidence]** verification: if rg -q '^## (Local Code Exploration Priority|Editing Tool Priority)' .opencode/agents/adv.md .opencode/agents/adv-engineer.md .opencode/agents/adv-designer.md .opencode/agents/adv-reviewer.md .opencode/agents/adv-researcher.md; then echo FOUND; exit 1; else echo NOT_FOUND; fi (0) — GREEN: duplicate headings absent from all five manifests.
- **[archive_only_evidence]** verification: pnpm run generate:manifests:check (0) — Generated agent manifests match source policy output.
- **[archive_only_evidence]** verification: files='.opencode/agents/adv.md .opencode/agents/adv-engineer.md .opencode/agents/adv-designer.md .opencode/agents/adv-reviewer.md .opencode/agents/adv-researcher.md'; if rg -q '^## (Local Code Exploration Priority|Editing Tool Priority)' $files; then echo DUPLICATE_SECTIONS_PRESENT; exit 1; fi; count=$(rg -l '^## ADV State Access Policy' $files | wc -l); test "$count" -eq 5; echo "duplicate sections absent; ADV State Access Policy preserved in $count manifests" (0) — Duplicate sections absent; ADV State Access Policy preserved in all five manifests.
- **[archive_only_evidence]** verification: rg -q '## Local Code Exploration Priority' .opencode/agents/adv.md && echo FOUND || echo NOT_FOUND (0) — Pre-edit probe showed adv.md was already clean (NOT_FOUND), so no change was needed there.
- **[archive_only_evidence]** decisions: Moved only the two fenced rendering skeletons and retained surrounding behavioral framing. — The agent prompt is load-bearing; Sign-Off Boundary, Output Contract instructions, command binding, and Tier B approval mechanics must remain in adv.md.
- **[archive_only_evidence]** decisions: Made adv-archive.md the local rendering source and updated Phase 5 to reference its Sign-Off Report Template. — This keeps /adv-archive self-contained while preserving the canonical Gate Handoff Voice pointer to docs/command-voice-standard.md.
- **[archive_only_evidence]** verification: rg -c '## Change Report' .opencode/agents/adv.md (0) — RED passed: starting state contained one Change Report template in adv.md.
- **[archive_only_evidence]** verification: rg -q '## Change Report' .opencode/command/adv-archive.md && rg -q 'Sign-off report template' .opencode/agents/adv.md && echo OK (0) — GREEN passed: archive contains the relocated template and adv.md contains the pointer.
- **[archive_only_evidence]** verification: pnpm run generate:manifests:check (0) — Manifest generation consistency check passed.
- **[archive_only_evidence]** verification: ! rg -q '^## Change Report' .opencode/agents/adv.md && rg -q '^## Change Report: \{id\}' .opencode/command/adv-archive.md && rg -q '^## Sign-Off Report Template' .opencode/command/adv-archive.md && rg -q '^## Gate Handoff Voice Template' .opencode/command/adv-archive.md && rg -q '^### Sign-Off Boundary' .opencode/agents/adv.md && rg -q '^## Output Contract' .opencode/agents/adv.md && echo STRUCTURE_OK (0) — Final structure check passed: templates are archived, pointers and behavioral headings remain, and no Change Report skeleton remains in adv.md.
- **[archive_only_evidence]** decisions: Merged the shared forbidden-path policy with reviewer and researcher variants into one canonical instruction, retaining the broader forbidden-tool list and all unique wisdom/spec/project-context/conformance/gate rows. — The canonical file must be a superset of every source copy while avoiding manifest edits in this task.
- **[archive_only_evidence]** decisions: Registered the canonical file beside the existing ADV instruction pointers in global `instructions[]`. — This preserves the current instruction loading order and makes the policy always-on.
- **[archive_only_evidence]** verification: test -f ~/.config/opencode/instructions/adv-state-access.md && echo EXISTS || echo MISSING (0) — Required existence check passed. Review diff-check passed for all six manifest sources after normalized Markdown/semantic comparison; adv-verifier has no ADV State Access Policy section. `opencode debug config` also exited 0.
- **[unresolved_action]** required_main_agent_actions: Checkpoint the two new skill files in the ADV worktree. Preserve the four modified config-home instruction files as part of the change's external config-home sync/backup workflow.
- **[archive_only_evidence]** decisions: Moved the complete runbook tables, anti-patterns, fallback guidance, and merge/test command recipes into exactly two lazy skills. — Preserves procedure detail while keeping routing triggers, first command/flag mentions, and safety rails eager; respects the three-skill cap including the parallel adv-rule-rationale skill.
- **[archive_only_evidence]** decisions: Used the files' actual pre-edit size rather than the supplied 18154-byte estimate. — The four files measured 6027 bytes before this task, so the >15000 RED precondition was already false; the final <8000 GREEN condition is independently evidenced.
- **[archive_only_evidence]** verification: read -r total _ <<< "$(wc -c "/home/jon/.config/opencode/instructions/trunk-worktree-isolation.md" "/home/jon/.config/opencode/instructions/git-freshness.md" "/home/jon/.config/opencode/instructions/oc-ci-wait.md" "/home/jon/.config/opencode/instructions/oc-test-gate.md" | tail -1)"; test "$total" -gt 15000 (1) — RED assertion failed as expected; pre-stub direct measurement was 6027 total bytes, so the requested >15000 historical baseline was not present in this environment.
- **[archive_only_evidence]** verification: wc -c "/home/jon/.config/opencode/instructions/trunk-worktree-isolation.md" "/home/jon/.config/opencode/instructions/git-freshness.md" "/home/jon/.config/opencode/instructions/oc-ci-wait.md" "/home/jon/.config/opencode/instructions/oc-test-gate.md" | tail -1; read -r total _ <<< "$(wc -c "/home/jon/.config/opencode/instructions/trunk-worktree-isolation.md" "/home/jon/.config/opencode/instructions/git-freshness.md" "/home/jon/.config/opencode/instructions/oc-ci-wait.md" "/home/jon/.config/opencode/instructions/oc-test-gate.md" | tail -1)"; test "$total" -lt 8000 (0) — GREEN passed: four instruction stubs total 2427 bytes, below the 8000-byte threshold.
- **[archive_only_evidence]** verification: npx tsx scripts/check-prompt-budget.ts (0) — Prompt-floor budget check passed at 229762/242159 bytes; baseline update was not needed.
- **[unresolved_action]** required_main_agent_actions: Preserve the external /home/jon/.config/opencode/instructions/rules.yaml update when recording or deploying this change; it is outside the git worktree.
- **[archive_only_evidence]** decisions: Kept P33 machine-checkable mechanisms, P37 dedicated-wait-agent exception, and P41 Guard-and-Go/Clone-instead-of-call prohibitions in the eager rules. — These clauses are enforcement-critical under the task's KD1 validator refinement; remaining rationale moved to the skill.
- **[archive_only_evidence]** decisions: Used an explicit “Not separately specified.” scope marker for rules without a source scope field. — The skill format requires a scope block for every rule while preserving that the source supplied no separate scope.
- **[archive_only_evidence]** verification: test -f skills/adv-rule-rationale/SKILL.md && test "$(rg -c '^## P[0-9]+ — ' skills/adv-rule-rationale/SKILL.md)" -eq 18 && test "$(rg -c '^\*\*Scope:\*\*' skills/adv-rule-rationale/SKILL.md)" -eq 18 && test "$(rg -c '^\*\*Full rule:\*\*' skills/adv-rule-rationale/SKILL.md)" -eq 18 (0) — PASS: skill exists with all 18 P-rule sections, scope entries, and full-rule entries.
- **[archive_only_evidence]** verification: pnpm run check (0) — PASS: schemas, typecheck, manifests, frontmatter, isolation, prompt budget, lockfile policy, lint, and format checks.
- **[report_follow_up]** follow_ups: Main orchestrator should inspect the unrelated plugin/src/manifest-doc-drift.test.ts diff; do not include or revert it as part of this task unless its owning task requires it.
- **[unresolved_action]** required_main_agent_actions: Review the unrelated plugin/src/manifest-doc-drift.test.ts diff; do not include or revert it as part of this task unless its owning task requires it.
- **[archive_only_evidence]** decisions: Removed the duplicate section from build.md as well as the five listed manifests that contained it. — The requested all-manifest GREEN command found build.md as the actual sixth match; adv-verifier.md was absent, so removing build.md resolved the discovered sixth copy without leaving a canonical-policy duplicate.
- **[archive_only_evidence]** decisions: Used the registered canonical instruction as the preservation reference. — The canonical file contains the forbidden-artifact rules, approved ADV access guidance, tool mapping, invoke routing, and direct-read failure behavior represented by the removed copies.
- **[unresolved_action]** scope_drift: finish_owned_scope_then_report: Main orchestrator should inspect and reconcile the concurrent plugin test modification before checkpointing.
- **[archive_only_evidence]** verification: rg -c '## ADV State Access Policy' .opencode/agents/*.md | wc -l (0) — RED passed: six matching manifest files were detected before deletion.
- **[archive_only_evidence]** verification: rg -c '## ADV State Access Policy' .opencode/agents/*.md || echo ZERO (0) — GREEN passed: no matching policy headings remain in agent manifests.
- **[archive_only_evidence]** verification: pnpm run generate:manifests:check (0) — Manifest generation check passed from the plugin package directory.
- **[unresolved_action]** required_main_agent_actions: packet_defect: respawn adv-reviewer with PHASE: review and SCOPE KEY: review:acceptance; retain CHANGE, ATTEMPT, and WORKING DIRECTORY.
- **[unresolved_action]** required_main_agent_actions: No acceptance decision or gate completion may use this packet.
- **[archive_only_evidence]** verification: tests_run= results=n/a — No repository analysis or edits performed because the Context Packet identity anchors are invalid.

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
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| DONT4 | avoidance | respected |

## Unresolved Actions

- Checkpoint the two new skill files in the ADV worktree. Preserve the four modified config-home instruction files as part of the change's external config-home sync/backup workflow.
- Preserve the external /home/jon/.config/opencode/instructions/rules.yaml update when recording or deploying this change; it is outside the git worktree.
- Review the unrelated plugin/src/manifest-doc-drift.test.ts diff; do not include or revert it as part of this task unless its owning task requires it.
- finish_owned_scope_then_report: Main orchestrator should inspect and reconcile the concurrent plugin test modification before checkpointing.
- packet_defect: respawn adv-reviewer with PHASE: review and SCOPE KEY: review:acceptance; retain CHANGE, ATTEMPT, and WORKING DIRECTORY.
- No acceptance decision or gate completion may use this packet.
