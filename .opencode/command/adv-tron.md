---
name: adv-tron
description: Investigate codebase structure, hotspots, risks, and suggest follow-up agenda candidates
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

Target resolution: file path → read directly, directory → outline all, symbol name → search, concept → semantic search, ambiguous → try semantic → symbol → text. Fall back to the closest resolvable target or broad mode before asking the user.
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
## Phase 4: Spawn Tron Sub-Agent
Spawn `adv-tron` agent via Task tool. System prompt has behavioral instructions. Pass only:

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
- Suggested next commands (`/adv-proposal`, `/adv-task`, `/adv-audit`, `/adv-tron`)
## Constraints
- Read-only — × never writes files or mutates ADV state
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
