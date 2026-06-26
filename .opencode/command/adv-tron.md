---
name: adv-tron
description: Investigate codebase structure, hotspots, risks, and suggest follow-up agenda candidates
---
<!-- manifest: adv-tron · requiresChangeId: false -->
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
| ✅ Report | Findings synthesized with agenda suggestions |
| 🎤 Clarify | Target too ambiguous |

---
## Phase 1: Load Skill
`skill("adv-tron")` → provides investigation protocol, search priorities, evidence requirements, report schema. If the skill is unavailable, continue with the embedded protocol in this command file.
## Phase 2: Determine Mode
Empty args → broad. Non-empty → scoped. Emit: `[ADV:WORK] Tron reconnaissance: {mode}`.
## Phase 3: Gather Context
1. `adv_project_context` + `adv_change_list` + `adv_agenda_list`
2. Broad: `lgrep_get_file_tree` for structure. Scoped: resolve target to concrete files/symbols → if unresolved after semantic/symbol/text search, fall back to the closest concrete target or broad reconnaissance and state that choice. Ask via `question` only if multiple plausible interpretations would lead to materially different investigations.

### Analysis Startup Sequence

Before deep reads, establish baseline context in this order:

1. **WORKING DIRECTORY / repo root** — record the actual workdir and resolved target path.
2. **Project context** — load `adv_project_context`.
3. **active ADV state** — inspect active changes plus relevant agenda/wisdom/spec context using ADV read tools.
4. **repo tree/outline** — inspect repo tree/outline before target-local reads.
5. **coverage gaps** — record unavailable tools, skipped dimensions, and unexamined areas.

### Broad Scan

Run a bounded broad scan with: structure map, hotspot/risk scan, related pattern/convention scan, active-change/spec overlap check, and coverage gaps. Cap findings at 10.

### Scoped Scan

Run a bounded scoped scan with: target normalization, deep read, dependency/usage trace, related/sibling code scan, active-change/spec overlap check, and coverage gaps. Cap findings at 15.

### Degraded Execution

If `lgrep` or outline tools fail, fallback to allowed read/search tools, report degraded coverage, and only emit findings backed by inspected source. Unsupported signals become coverage gaps/open questions, not findings.

### Follow-up Routing Matrix

Use these trigger criteria for suggested next commands. Tron recommends only; it must not invoke `/adv-*`, must not create agenda/change/task state, and must not edit files.

| Trigger criteria | Recommend |
| --- | --- |
| Simplification, bloat, duplicated flow, verbose code, or long-term maintainability proposal needed | `/adv-optimizer <target>` |
| Slop smell, dead-code/deletion-safety, detector coverage, defensive overkill, AI-code quality issue | `/adv-slop-scan <target>` |
| Architecture boundary, stack-pack, structural-correctness, heuristic-owned state/spec/security/persistence concern | `/adv-arch-scan <target>` |
| Explicit spec-vs-implementation drift | `/adv-audit <capability>` |
| Follow-up already bounded and implementation-ready | `/adv-task` |
| Durable change needs proposal/agreement/design | `/adv-proposal <summary>` |
| More local reconnaissance needed before choosing owner | `/adv-tron <deeper-target>` |

Combination routing examples:

- `/adv-slop-scan <target> then /adv-optimizer <target>` — first classify slop/deletion-safety evidence, then synthesize simplification proposal.
- `/adv-arch-scan <target> then /adv-slop-scan <target>` — first validate architecture/structural boundary, then scan quality smells if source evidence also suggests code-level slop.
## Phase 4: Spawn Tron Sub-Agent
Spawn `adv-tron` agent via Task tool. System prompt has behavioral instructions. Pass this packet plus mode-specific context:

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
EXPECTED OUTPUT: return TRON RECONNAISSANCE REPORT and call adv_subagent_report_submit with TRON_REPORT per .opencode/agents/adv-tron.md when CHANGE is a real ADV change
```

Pass only:

**Broad:** repo root, project context, ADV state (changes/agenda/specs), file tree summary. Task: map architecture, identify hotspots, note patterns, flag risks, check spec drift, suggest agenda items. Cap: 10 findings.

**Scoped:** target, resolved files, repo root, project context, relevant ADV state. Task: deep-read target, trace dependencies, find related code, assess complexity/coverage/risk, check ADV overlap, suggest agenda items. Cap: 15 findings.
## Phase 5: Synthesize
Validate findings (require file references, remove evidence-free, deduplicate). Emit TRON RECONNAISSANCE REPORT:
- Target/scope
- Numbered findings (category, title, description, evidence, confidence)
- Hotspots (file/module + why)
- Risks (with file references)
- Open questions
- Possible agenda items (title, rationale, priority — suggestions only, not auto-created)
- Suggested next commands (command, target, trigger, rationale): `/adv-optimizer`, `/adv-slop-scan`, `/adv-arch-scan`, `/adv-proposal`, `/adv-task`, `/adv-tron`, and optional `/adv-audit` only for explicit spec-vs-implementation drift
## Constraints
- Read-only — × never writes files or mutates ADV state
- Adjacent commands are recommendations only — must not invoke `/adv-*`, must not create agenda/change/task state, must not edit files
- × No agenda creation — suggestions in human-readable form only
- × No change creation — user decides follow-up
- Bounded: 10 findings (broad), 15 (scoped)

---
## Key Tools
| Purpose | Tool |
|---------|------|
| Skill | `skill("adv-tron")` |
| Context | `adv_project_context`, `adv_change_list`, `adv_agenda_list` |
| Structure | `lgrep_get_file_tree`, `lgrep_get_repo_outline` |
| Spawn | Task tool (`adv-tron` agent) |
