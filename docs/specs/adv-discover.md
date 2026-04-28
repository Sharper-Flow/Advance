# ADV Discover Command

> **Version:** 1.1.0
> **Updated:** 2026-04-10

## Purpose

Defines the rigor requirements for /adv-discover. The discover command gathers current-state evidence, investigates edge cases, scans for conflicts and related patterns, and produces structured findings for /adv-agree. It must extend prior research rather than rehash it.

## Requirements

### Discovery Checklist Enforcement

**ID:** `rq-disc01` | **Priority:** **[MUST]**

/adv-discover output MUST contain a Discovery Checklist section listing each mandatory protocol step with PASS or SKIP and a reason. This ensures no protocol step is silently omitted.

**Tags:** `discover`, `checklist`, `protocol`

#### Scenarios

**Checklist present in discovery output** (`rq-disc01.1`)

**Given:**
- A /adv-discover invocation completes successfully

**When:** The discovery output is persisted via adv_change_update

**Then:**
- The output contains a 'Discovery Checklist' section
- The checklist lists at least 7 mandatory protocol steps
- Each step has a PASS or SKIP status with a reason

---

### Phase 1.5 Skill Discovery Enforcement

**ID:** `rq-disc02` | **Priority:** **[MUST]**

/adv-discover MUST execute the skill discovery protocol from ADV_INSTRUCTIONS.md and emit a Skills Considered section. This prevents the agent from skipping domain-specific skill loading.

**Tags:** `discover`, `skill-discovery`, `protocol`

#### Scenarios

**Skill discovery executes and reports results** (`rq-disc02.1`)

**Given:**
- Trusted skill directories exist with SKILL.md files

**When:** /adv-discover runs Phase 1.5

**Then:**
- The output contains a 'Skills Considered' section
- The section lists examined skills with match assessment and action taken

**No skills available is reported explicitly** (`rq-disc02.2`)

**Given:**
- No SKILL.md files exist in trusted skill directories

**When:** /adv-discover runs Phase 1.5

**Then:**
- The output reports 'Skills considered: none available'
- The Skills Considered section is not omitted

---

### Prior Research Extension

**ID:** `rq-disc03` | **Priority:** **[MUST]**

When prior research artifacts exist (temp/*.md, docs/*-prep.md including /adv-improve research packs, related archived changes), /adv-discover MUST cite them in an Extends section AND add at least one new finding beyond what they contained. This prevents discovery from rehashing prior work. When a cited pack contains Competitors & Alternatives or Emerging Patterns sections relevant to an open design question, /adv-discover MUST cite those sections in the LBP Check.

**Tags:** `discover`, `prior-research`, `extension`

#### Scenarios

**Prior artifacts cited and extended** (`rq-disc03.1`)

**Given:**
- A prior research artifact exists in temp/, docs/, or a related archived change

**When:** /adv-discover runs the prior research check

**Then:**
- The output includes an 'Extends' section citing the artifact
- The output adds at least one new finding not present in the cited artifact

**No prior research is non-blocking** (`rq-disc03.2`)

**Given:**
- No prior research artifacts exist in any canonical location

**When:** /adv-discover runs the prior research check

**Then:**
- The output reports 'No prior research found'
- Discovery does not block or fail

**Relevant /adv-improve research pack sections are cited in LBP Check** (`rq-disc03.3`)

**Given:**
- A docs/*-prep.md research pack is cited in the Extends section
- The pack contains Competitors & Alternatives or Emerging Patterns sections
- At least one open design question names external tools or libraries as a realistic alternative

**When:** /adv-discover emits the LBP Check section

**Then:**
- The LBP Check cites the specific pack sections relevant to the open question
- The LBP Check does not silently ignore the pack content

---

### Gated External-Solution Check

**ID:** `rq-disc10` | **Priority:** **[MUST]**

When the proposal's Discovery Agenda contains ecosystem unknowns, or an open design question lists external tools/libraries/services as a realistic option, /adv-discover MUST perform an External-Solution Check. It MUST first consult any cited docs/*-prep.md research pack; only when no relevant pack covers the question may it run fresh Kagi queries for competitors, alternatives, and emerging patterns. Purely internal changes (refactors, bug fixes, local doc/test fixes) may record 'No external alternatives apply' with rationale and skip the fresh search.

**Tags:** `discover`, `external-solution`, `lbp`, `research-pack`

#### Scenarios

**Pack-covered ecosystem question cites pack instead of re-searching** (`rq-disc10.1`)

**Given:**
- The Discovery Agenda contains an ecosystem unknown
- A docs/*-prep.md research pack already covers that ecosystem question

**When:** /adv-discover performs the External-Solution Check

**Then:**
- The LBP Check summarises findings from the pack and cites it
- Fresh Kagi queries are not run for the same question

**Uncovered ecosystem question triggers fresh external search** (`rq-disc10.2`)

**Given:**
- The Discovery Agenda contains an ecosystem unknown
- No cited docs/*-prep.md research pack covers that ecosystem question

**When:** /adv-discover performs the External-Solution Check

**Then:**
- Kagi queries for competitors/alternatives and emerging patterns are run
- Findings are recorded in the LBP Check with source URLs
- /adv-improve is recommended as a follow-up to persist the findings

**Purely internal change may skip with rationale** (`rq-disc10.3`)

**Given:**
- The change is a refactor, bug fix, or local doc/test update with no viable external alternative

**When:** /adv-discover performs the External-Solution Check

**Then:**
- The LBP Check records 'No external alternatives apply' with rationale
- No external search is required

---

### Conflict and Related-Work Scan

**ID:** `rq-disc04` | **Priority:** **[MUST]**

/adv-discover MUST run adv_change_list (with includeArchived), adv_change_validate, and adv_agenda_list, and report results in a Conflict Scan section. This prevents the agent from proposing work that conflicts with existing or archived changes.

**Tags:** `discover`, `conflict-scan`, `related-work`

#### Scenarios

**All three mandatory tools are called** (`rq-disc04.1`)

**Given:**
- A change in the discovery phase

**When:** /adv-discover runs the conflict scan

**Then:**
- adv_change_list with includeArchived is called
- adv_change_validate is called
- adv_agenda_list is called
- Results are reported in a 'Conflict Scan' section with explicit findings or 'no conflicts'

**Own-change validation warnings are excluded from conflict findings** (`rq-disc04.2`)

**Given:**
- adv_change_validate returns passed:false due to NO_TASKS or NO_DELTAS on the change being discovered

**When:** Conflict scan results are reported

**Then:**
- Own-change pre-prep warnings are not reported as external conflicts
- The warnings are noted as expected pre-prep state

---

### Edge Case Investigation

**ID:** `rq-disc05` | **Priority:** **[MUST]**

For each gap identified during discovery, /adv-discover MUST document at least 2 edge cases or failure modes, OR explicitly mark the gap as N/A: structural with rationale. This prevents shallow analysis that misses failure modes.

**Tags:** `discover`, `edge-cases`, `investigation`

#### Scenarios

**Each gap has at least 2 edge cases** (`rq-disc05.1`)

**Given:**
- A gap identified during discovery that involves logic or behavior

**When:** Discovery output is persisted

**Then:**
- The gap section contains at least 2 documented edge cases or failure modes

**Structural gaps allow N/A with rationale** (`rq-disc05.2`)

**Given:**
- A gap that is purely structural with no logic to test

**When:** Discovery output is persisted

**Then:**
- The gap may be marked 'Edge cases: N/A — structural' with a rationale explaining why no edge cases apply

---

### Design Question Depth

**ID:** `rq-disc06` | **Priority:** **[MUST]**

Each open design question in /adv-discover output MUST include trust model implications, blast radius, and alternatives considered. This prevents shallow one-liner questions that lack analysis depth.

**Tags:** `discover`, `design-questions`, `depth`

#### Scenarios

**Each question has three required annotations** (`rq-disc06.1`)

**Given:**
- A discovery output with open design questions

**When:** The output is persisted

**Then:**
- Each question lists trust model implications (agent-only, user-only, or joint)
- Each question lists blast radius (what breaks or changes if chosen wrong)
- Each question lists alternatives considered (or 'none viable, single direction')

---

### Draft Spec Delta Shapes

**ID:** `rq-disc07` | **Priority:** **[MUST]**

/adv-discover MUST include draft spec deltas with concrete requirement IDs (rq-* format) and at least one Given/When/Then scenario per delta, OR explicitly state 'No spec deltas required' with rationale. This prevents vague 'spec deltas will be needed' placeholders.

**Tags:** `discover`, `spec-deltas`, `requirements`

#### Scenarios

**Drafted deltas include IDs and scenarios** (`rq-disc07.1`)

**Given:**
- A discovery that identifies spec changes are needed

**When:** Discovery output is persisted

**Then:**
- Each draft delta has a concrete rq-* requirement ID
- Each draft delta has at least one Given/When/Then scenario

**No-delta changes are declared explicitly** (`rq-disc07.2`)

**Given:**
- A discovery that determines no spec changes are required

**When:** Discovery output is persisted

**Then:**
- The output states 'No spec deltas required' with a rationale
- The spec deltas section is not silently omitted

---

### P25 Related-Pattern Scan

**ID:** `rq-disc08` | **Priority:** **[MUST]**

/adv-discover MUST execute a related-pattern scan per rule P25 to detect similar bugs or gaps elsewhere in the codebase, and report results in a Related Pattern Scan section. This prevents fixing one instance while identical issues remain elsewhere.

**Tags:** `discover`, `p25`, `related-scan`

#### Scenarios

**Related-pattern scan executes and reports** (`rq-disc08.1`)

**Given:**
- A change in the discovery phase

**When:** /adv-discover runs the P25 scan

**Then:**
- The output contains a 'Related Pattern Scan' section
- The section lists similar patterns with file references or explicitly states 'no similar patterns found'

---

### Discovery-Owned Agreement Sign-Off

**ID:** `rq-disc11` | **Priority:** **[MUST]**

When /adv-discover absorbs the user-facing agreement flow, the command MUST present objectives and constraints for user sign-off before completing the discovery gate, and MUST persist agreement.md as part of the same command contract. This prevents discovery findings from being marked complete before the user-facing sign-off step occurs.

**Tags:** `discover`, `agreement`, `sign-off`, `gate-ownership`

#### Scenarios

**User sign-off occurs before discovery gate completion** (`rq-disc11.1`)

**Given:**
- A /adv-discover invocation has produced objectives, constraints, avoidances, and acceptance-criteria candidates

**When:** /adv-discover reaches the end of its agreement presentation flow

**Then:**
- The command presents objectives and constraints as inline handoff text for user sign-off per docs/command-voice-standard.md § Inline Approval Voice (Tier A)
- agreement.md is persisted via adv_change_update
- adv_gate_complete gateId: discovery occurs only after the sign-off flow completes

---

### Explicit Acceptance Criteria Checkpoint

**ID:** `rq-disc12` | **Priority:** **[MUST]**

/adv-discover MUST present draft acceptance criteria as a dedicated checkpoint before agreement.md persistence and before adv_gate_complete gateId: discovery. The checkpoint MUST offer explicit user outcomes for approval, /adv-clarify handoff, or write-in edits, and MUST NOT complete discovery until acceptance criteria are approved.

**Tags:** `discover`, `acceptance-criteria`, `checkpoint`, `agreement`

#### Scenarios

**Acceptance criteria checkpoint precedes agreement persistence and gate completion** (`rq-disc12.1`)

**Given:**
- /adv-discover has resolved all user-facing open questions and produced draft acceptance criteria

**When:** The command reaches the agreement sign-off flow

**Then:**
- The command presents Acceptance Criteria as a focused checkpoint
- The inline handoff offers approve, start /adv-clarify, and add/clarify outcomes per docs/command-voice-standard.md § Inline Approval Voice
- agreement.md is persisted only after acceptance criteria are approved
- adv_gate_complete gateId: discovery occurs only after approval

**/adv-clarify branch stops discovery cleanly** (`rq-disc12.2`)

**Given:**
- The user replies with /adv-clarify literal slash command at the acceptance criteria checkpoint

**When:** /adv-discover detects the literal /adv-clarify reply

**Then:**
- /adv-discover stops immediately without persisting agreement.md
- /adv-discover does not call adv_gate_complete
- The command instructs the user to run /adv-clarify {change-id} and rerun /adv-discover {change-id} afterward
- Non-literal clarification intent (e.g. 'I want to clarify X') is treated as revision text per Tier A LLM fallback, not as the /adv-clarify branch

---

### Full 11-Category AMBIGUITY ANALYSIS

**ID:** `rq-disc-tax1` | **Priority:** **[MUST]**

/adv-discover MUST run an ambiguity scan during Phase 2 with B/F/S/M required (v1) and D/X/Q/I/E/C/T optional, and emit an ### AMBIGUITY ANALYSIS section containing finding IDs, severity, evidence quotes, and a coverage report.

**Tags:** `discover`, `ambiguity-scan`, `taxonomy`

#### Scenarios

**Discovery produces AMBIGUITY ANALYSIS section with findings and coverage** (`rq-disc-tax1.1`)

**Given:**
- A change in the discovery phase
- clarify_enforcement is 'advisory' or 'strict'

**When:** /adv-discover runs Phase 2 analysis

**Then:**
- Output contains ### AMBIGUITY ANALYSIS section
- Section includes per-category findings (B1, F1, etc.) with severity ratings
- Evidence quotes follow anti-hallucination rule (verbatim or (no X) marker)
- Coverage line shows C/P/M/N/A status per required category (B/F/S/M)

**Legacy discovery skips AMBIGUITY ANALYSIS enforcement** (`rq-disc-tax1.2`)

**Given:**
- A change with discovery gate already completed (in-flight)

**When:** /adv-discover is invoked again

**Then:**
- The existing discovery output is preserved
- AMBIGUITY ANALYSIS is not enforced retroactively

**clarify_enforcement off skips AMBIGUITY ANALYSIS** (`rq-disc-tax1.3`)

**Given:**
- clarify_enforcement is 'off'

**When:** /adv-discover runs Phase 2

**Then:**
- No AMBIGUITY ANALYSIS section is emitted
- No trigger evaluation runs

---

### Mandatory /adv-clarify Trigger

**ID:** `rq-disc-tax2` | **Priority:** **[MUST]**

/adv-discover MUST halt and hand off to /adv-clarify when the AMBIGUITY ANALYSIS produces any CRITICAL finding OR 2+ HIGH findings. Single HIGH findings produce a warning but do not block. Trigger applies to all categories (required + optional).

**Tags:** `discover`, `clarify-trigger`, `mandatory-handoff`

#### Scenarios

**CRITICAL finding halts discovery and hands off to /adv-clarify** (`rq-disc-tax2.1`)

**Given:**
- AMBIGUITY ANALYSIS shows 1 CRITICAL B finding

**When:** /adv-discover evaluates findings in Phase 2.5

**Then:**
- Discovery halts
- Output instructs user to run /adv-clarify {change-id}
- adv_gate_complete gateId: discovery is NOT called

**Single HIGH finding produces warning, proceeds normally** (`rq-disc-tax2.2`)

**Given:**
- AMBIGUITY ANALYSIS shows 1 HIGH finding only

**When:** /adv-discover evaluates findings

**Then:**
- Warning is logged inline
- Discovery proceeds normally to Phase 3

**2+ HIGH findings halt discovery** (`rq-disc-tax2.3`)

**Given:**
- AMBIGUITY ANALYSIS shows 2+ HIGH findings (no CRITICAL)

**When:** /adv-discover evaluates findings

**Then:**
- Discovery halts
- Output hands off to /adv-clarify

---

### Post-Clarify Clean Coverage

**ID:** `rq-disc-tax3` | **Priority:** **[MUST]**

After /adv-clarify resolves findings via the ## Clarify Resolution Log mechanism, a fresh /adv-discover rerun MUST produce a coverage report with no CRITICAL findings and at most 1 HIGH finding. Reruns are capped at 2 before escalating.

**Tags:** `discover`, `post-clarify`, `rerun-cap`

#### Scenarios

**Post-clarify rerun shows clean coverage** (`rq-disc-tax3.1`)

**Given:**
- /adv-clarify has written resolutions to proposal.md
- ## Clarify Resolution Log contains resolved entries

**When:** /adv-discover is rerun

**Then:**
- New AMBIGUITY ANALYSIS shows no CRITICAL findings
- At most 1 HIGH finding
- Discovery proceeds to agreement normally

**Third rerun triggers escalation instead of auto-halt** (`rq-disc-tax3.2`)

**Given:**
- 2 prior /adv-clarify cycles completed
- A third rerun is attempted

**When:** /adv-discover evaluates findings

**Then:**
- Rerun cap is enforced
- Agent escalates to user via question tool
- No automatic halt-handoff occurs

---

### Skill Gap Detection

**ID:** `rq-sc01` | **Priority:** **[MUST]**

When `/adv-discover` or `/adv-research` Phase 1.5 skill discovery finds no matching skill for a domain relevant to the change's core problem, the agent MUST explicitly report the gap and MAY initiate on-demand skill creation.

**Tags:** `skill-creation`, `gap-detection`, `phase-1.5`

#### Scenarios

**Gap detected for core-relevant domain** (`rq-sc01.1`)

**Given:**
- Phase 1.5 skill discovery completes with no matching skill
- The change's tech stack or domain terms suggest a skill would be useful
- The domain is clearly relevant to the change's core problem

**When:** The agent evaluates skill search results

**Then:**
- The agent reports the gap in Skills Considered with "skill gap: {domain}"
- The agent may proceed to skill creation

**Partial match does not trigger creation** (`rq-sc01.2`)

**Given:**
- Phase 1.5 finds a partial keyword match in an existing skill
- The existing skill partially covers the detected domain

**When:** The agent evaluates skill search results

**Then:**
- The agent reports "partial coverage: {existing skill}" in Skills Considered
- The agent does NOT create a new skill for the partially covered domain

**Tangential domain does not trigger creation** (`rq-sc01.3`)

**Given:**
- Phase 1.5 finds no matching skill for a domain
- The domain is tangential to the change's core problem

**When:** The agent evaluates skill search results

**Then:**
- The agent reports "no skills matched" as normal
- The agent does NOT create a skill for tangential domains

---

### Skill Assembly and Persistence

**ID:** `rq-sc02` | **Priority:** **[MUST]**

Auto-created skills MUST use valid SKILL.md frontmatter format, MUST NOT use the `adv-` prefix (sync script collision), and MUST be written atomically to the global skills directory.

**Tags:** `skill-creation`, `assembly`, `persistence`

#### Scenarios

**Valid frontmatter format** (`rq-sc02.1`)

**Given:**
- The agent decides to create a skill for domain X

**When:** The agent assembles the SKILL.md

**Then:**
- The file has valid YAML frontmatter with `name: "agent-{domain}"`, `description`, `keywords`
- The file includes `metadata.source: "agent-created"`
- The file includes `metadata.review_status: "pending"`
- The file includes `metadata.created_at` with ISO timestamp
- The file includes `metadata.trigger_change` with the originating change ID
- The skill name does NOT start with `adv-`

**Atomic write with skip-if-exists** (`rq-sc02.2`)

**Given:**
- An auto-created skill is ready to persist

**When:** The agent writes to `~/.config/opencode/skills/agent-{domain}/SKILL.md`

**Then:**
- The write is atomic (temp+rename or equivalent)
- If a file already exists at the target path, the agent skips creation and reports "skill already exists: agent-{domain}"

**Overlap detection** (`rq-sc02.3`)

**Given:**
- A skill with the same name already exists in the global dir

**When:** The agent attempts creation

**Then:**
- The agent skips creation and reports "skill already exists: {name}"
- The existing skill is NOT overwritten

---

### Use-and-Notify Pattern

**ID:** `rq-sc03` | **Priority:** **[MUST]**

After creating a skill, the agent MUST load it via `skill()`, use it in the current workflow, and emit `[ADV:SKILL_CREATED]` notification.

**Tags:** `skill-creation`, `notification`, `status-marker`

#### Scenarios

**Skill loaded and used after creation** (`rq-sc03.1`)

**Given:**
- A skill was successfully written to the global skills dir

**When:** The agent continues the current workflow

**Then:**
- `skill("agent-{domain}")` is called
- The skill's guidance is applied in the current workflow

**Notification emitted** (`rq-sc03.2`)

**Given:**
- A skill was created during discovery or research

**When:** The workflow continues after creation

**Then:**
- `[ADV:SKILL_CREATED]` marker is emitted
- The notification includes the skill name, domain, and a brief description

**Pending review surfaced on next discovery** (`rq-sc03.3`)

**Given:**
- A skill exists in the global dir with `metadata.review_status: "pending"`

**When:** A subsequent `/adv-discover` Phase 1.5 runs

**Then:**
- Phase 1.5 scans for pending-review skills BEFORE keyword matching
- Pending skills are surfaced to the user for confirmation
- User confirms → `metadata.review_status` updated to "reviewed"
- User rejects → skill file deleted

---
