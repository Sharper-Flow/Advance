---
name: adv-tron
description: Investigate codebase structure, hotspots, risks, and suggest follow-up candidates
agent: adv-tron
---
# ADV Tron — Codebase Reconnaissance
Investigate codebase to map structure, identify hotspots, surface risks, suggest follow-up work. Read-only — × never modifies files or ADV state.
<UserRequest>
  $ARGUMENTS
</UserRequest>
## Argument Handling
`$ARGUMENTS` is optional. Two modes:
| Invocation | Mode |
|------------|------|
| No args | Broad reconnaissance of entire repo |
| With target | Scoped investigation of file/module/symbol/concept |

Target resolution: file path → read directly, directory → outline all, symbol name → search, concept → semantic search, ambiguous → try semantic → symbol → text. Fall back to the closest resolvable target or broad mode before asking user.
## Exits
| Exit | Condition |
|------|-----------|
| ✅ Report | Findings synthesized with follow-up suggestions |
| 🎤 Clarify | Target too ambiguous |

---
## Phase 1: Load Skill
`skill("adv-tron")` → provides investigation protocol, search priorities, evidence requirements, report schema.

Required — if the skill fails to load, stop and report a broken deploy (run scripts/deploy-local.sh --fix).
## Phase 2: Determine Mode
Empty args → broad. Non-empty → scoped. Emit: `[ADV:WORK] Tron reconnaissance: {mode}`.
## Phase 3: Gather Context
1. `adv_project_context` + `adv_change_list`
2. Broad: lgrep file tree for structure. Scoped: resolve target to concrete files/symbols → if unresolved after semantic/symbol/text search, fall back to the closest concrete target or broad reconnaissance and state that choice. Ask via `question` only if multiple plausible interpretations would lead to materially different investigations.
## Phase 4: Run as Tron Sub-Agent
This command declares `agent: adv-tron` in frontmatter, so OpenCode invokes the `adv-tron` subagent directly — no Task-tool spawn. ADV orchestrator agents deny `task: adv-tron`, making `/adv-tron` the only entry point. The agent's system prompt carries behavioral instructions; establish this packet plus mode-specific context as the working scope:

```
WORKING DIRECTORY: {workdir}
CHANGE: {change-id-or-none} | {title-or-ad-hoc}
SCOPE KEY: tron:{target-slug}
ATTEMPT: {attempt-number, starting at 1 for this Tron worker}
TASK_SCOPE: reconnaissance target and mode ({broad|scoped})
IN_SCOPE:
  - {repo areas, files, symbols, or architecture questions to inspect}
OUT_OF_SCOPE:
  - writes, ADV orchestration mutations, unrelated subsystems, agenda creation
DONE_WHEN:
  - bounded findings cite file evidence or state no evidence found
STOP_WHEN:
  - target cannot be resolved, evidence contradicts packet scope, or contract/security/release blocker appears
VERIFICATION:
  required_when_possible:
    - cite file:line evidence for each material finding
  optional_additional_checks: true
OPTIMIZATION_CANDIDATES (optional):
  - {validated static opt-scan candidates; if present, Tron preserves them as read-only optimization_candidates with detector_id, source evidence, expected_cost_shape, false_positive_caveat, verification_needed, and a recommended `/adv-optimizer` handoff}
EXPECTED OUTPUT: return TRON RECONNAISSANCE REPORT and call adv_subagent_report_submit with TRON_REPORT per .opencode/agents/adv-tron.md when CHANGE is a real ADV change
```

Pass only:

**Broad:** repo root, project context, ADV state (changes/specs), file tree summary. Task: map architecture, identify hotspots, note patterns, flag risks, check spec drift, suggest follow-ups. Cap: 10 findings.

**Scoped:** target, resolved files, repo root, project context, relevant ADV state. Task: deep-read target, trace dependencies, find related code, assess complexity/coverage/risk, check ADV overlap, suggest follow-ups. Cap: 15 findings.

**Opt-scan candidates:** If validated static opt-scan candidates are available, pass them in the spawn packet under `OPTIMIZATION_CANDIDATES`. Tron consumes them read-only, preserves all source evidence, and includes them as advisory `optimization_candidates` in the `TRON_REPORT` with a recommended `/adv-optimizer` handoff. Do not run opt-scan automatically from this command if candidates are not already available; candidate generation is outside Tron's scope.
## Key Tools
| Purpose | Tool |
|---------|------|
| Skill | `skill("adv-tron")` |
| Context | `adv_project_context`, `adv_change_list` |
| Structure | lgrep file tree, lgrep repo outline |
| Invocation | Command frontmatter `agent: adv-tron` (direct subagent invocation; not Task-spawned) |
