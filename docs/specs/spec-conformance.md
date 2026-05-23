# Spec Conformance

> **Version:** 1.0.0
> **Updated:** 2026-05-23

## Purpose

Capability: External CI-isolated spec conformance verification. Verifies high-level acceptance criteria against the real system from outside the implementing agent's context. Source physically/runtime-isolated; archive-gated; tiered visibility. Pure opt-in per spec.

## Requirements

### Conformance Source Isolation From Implementing Agent

**ID:** `rq-confSource01` | **Priority:** **[MUST]**

Conformance test source for a locked spec MUST NOT be readable by the implementing agent via any tool path. Two location modes are supported: 'subfolder' (default, in-repo `.adv/specs/_conformance/`) and 'sibling' (opt-in, external repo `{project-parent}/advance-conformance-{project-id}/`). In subfolder mode, the runtime path-block guard is the primary defense. In sibling mode, physical absence in the working tree adds a second layer. Bash guard blocks `git clone`/`curl`/`wget` of locked sibling-repo paths or directory names.

**Tags:** `conformance`, `enforcement`, `isolation`

#### Scenarios

**Locked subfolder source is not readable by implementing agent** (`rq-confSource01.1`)

**Given:**
- A spec has conformance_required: true and is locked
- Conformance source lives in subfolder mode at .adv/specs/_conformance/{spec}/
- An implementing agent is in the execution gate

**When:** The agent attempts read/glob/grep/lgrep on a path inside .adv/specs/_conformance/{spec}/

**Then:**
- The runtime tool.execute.before guard rejects the call with a documented enforcement error
- No file content from the locked path is returned to the agent

**Locked sibling source is physically absent and bash-blocked** (`rq-confSource01.2`)

**Given:**
- A spec has conformance_required: true and is locked in sibling mode
- An implementing agent attempts to fetch the sibling repo

**When:** The agent runs git clone, curl, or wget against the sibling-repo path or URL

**Then:**
- The bash guard rejects the command with a conformance-boundary error
- The sibling repo is not present in the working tree

**Adversarial probe enumerates and verifies every documented bypass** (`rq-confSource01.3`)

**Given:**
- A locked conformance source exists in either mode
- An adversarial test fixture is exercised

**When:** The fixture attempts every documented read path (read tool, glob, grep, lgrep_search_*, bash cat/grep/find, bash git clone, bash curl, direct adv_conformance call)

**Then:**
- Each path is rejected with a conformance-boundary enforcement error
- No fixture run leaks the locked source content

---

### Lock-On-First-Archive Lifecycle

**ID:** `rq-confLock01` | **Priority:** **[MUST]**

Conformance source for a spec is unlocked while the spec is being authored. On the first successful `/adv-archive` of a spec with conformance_required: true, the spec's lock state flips atomically to `locked: true` with `locked_at` and `locked_at_archive` recorded. Lock state lives in shared external state (`~/.local/share/opencode/plugins/advance/{project-id}/conformance.json`) and survives worktree switches. Subsequent unlocking requires explicit user-invoked `adv_conformance action: 'unlock'` and is recorded in the override audit log.

**Tags:** `conformance`, `lifecycle`, `lock`

#### Scenarios

**First archive locks the conformance source** (`rq-confLock01.1`)

**Given:**
- A spec with conformance_required: true and locked: false
- All gates of the change are satisfied
- Conformance verdict is PASS

**When:** /adv-archive completes successfully for the change that authored or modified the spec

**Then:**
- The spec entry's locked field flips to true
- locked_at is set to the archive timestamp
- locked_at_archive is set to the change-id

**Lock state survives worktree switches** (`rq-confLock01.2`)

**Given:**
- A spec is locked from a previous archive in worktree A
- An agent switches to worktree B for the same project

**When:** The agent attempts to read the spec's conformance source in worktree B

**Then:**
- The lock state is read from the shared external conformance.json
- The runtime guard rejects the read just as it would in worktree A

**Unlock requires explicit user-invoked action with audit** (`rq-confLock01.3`)

**Given:**
- A spec is locked

**When:** adv_conformance action: 'unlock' is invoked by the user

**Then:**
- The lock state flips to false
- An override audit entry is appended to the spec's overrides array recording user, reason, re_verify_deadline, and applied_at
- Future amendments to the spec require re-archiving to re-lock

---

### Saved State Notification Failure Visibility

**ID:** `rq-confSignalVisibility01` | **Priority:** **[MUST]**

When adv_conformance writes local conformance state for lock, override, or run and the change-workflow notification fails, the tool response MUST preserve the local-state success result and include a structured signalWarning object with stable code, reason, recoverability, and change-id. The warning MUST NOT be debug-log-only.

**Tags:** `conformance`, `visibility`, `signals`

#### Scenarios

**Lock save succeeds but workflow notification fails visibly** (`rq-confSignalVisibility01.1`)

**Given:**
- A tracked conformance spec exists
- adv_conformance action: 'lock' persists locked state
- The change-workflow signal rejects

**When:** The tool returns to the caller

**Then:**
- The response reports success for the local lock state
- The response includes signalWarning.code = 'ADV_CONFORMANCE_SIGNAL_FAILED'
- signalWarning.reason contains the notification failure reason
- signalWarning.recoverable is true and signalWarning.changeId identifies the change workflow

**Override save succeeds but workflow notification fails visibly** (`rq-confSignalVisibility01.2`)

**Given:**
- A tracked conformance spec has locked_at_archive set
- adv_conformance action: 'override' persists an override audit entry
- The change-workflow signal rejects

**When:** The tool returns to the caller

**Then:**
- The response reports success for the local override audit
- The response includes signalWarning with stable code, reason, recoverable flag, and changeId
- The override entry remains persisted

**Run verdict save succeeds but workflow notification fails visibly** (`rq-confSignalVisibility01.3`)

**Given:**
- A tracked conformance spec has locked_at_archive set
- adv_conformance action: 'run' persists last_verdict
- The change-workflow signal rejects

**When:** The tool returns to the caller

**Then:**
- The response preserves the structured verdict result
- The response includes signalWarning with stable code, reason, recoverable flag, and changeId
- The last_verdict remains persisted

---

### Single Structured Verdict, Role-Aware Tool Access

**ID:** `rq-confVerdict01` | **Priority:** **[MUST]**

Conformance runs produce a single structured verdict shape `{verdict: 'PASS' | 'DRIFT', run_id, failed: [{rq_id, summary}]}`. The implementing agent has no tool path to call `adv_conformance` during the execution gate (role guard in tool.execute.before). The orchestrator (in `/adv-archive`) calls the tool and receives the verdict. Full diagnostic detail is echoed to the user terminal at archive time but never returned through a tool channel reachable by an apply-phase agent.

**Tags:** `conformance`, `verdict`, `role-guard`

#### Scenarios

**Apply-phase agent cannot call adv_conformance** (`rq-confVerdict01.1`)

**Given:**
- An active task is in the execution gate

**When:** The agent attempts to call adv_conformance with any action

**Then:**
- The tool.execute.before role guard rejects the call with an enforcement error
- No conformance state mutation or read occurs

**Orchestrator receives single structured verdict** (`rq-confVerdict01.2`)

**Given:**
- A change has reached /adv-archive Phase 5.5
- The spec has conformance_required: true

**When:** The orchestrator calls adv_conformance action: 'run'

**Then:**
- The tool returns {verdict: 'PASS' | 'DRIFT', run_id, failed} with no tiered shaping
- On DRIFT, failed contains AC labels (rq_id) plus brief summary, no source code or test internals

---

### Archive Blocked On Non-PASS Verdict

**ID:** `rq-confArchiveGate01` | **Priority:** **[MUST]**

Archive of a spec with `conformance_required: true` is blocked unless the conformance verdict is PASS or a valid time-bounded override is recorded. The conformance gate runs in `/adv-archive` Phase 5.5, between User Signoff (Phase 5) and Execute Archive (Phase 6). It runs BEFORE `adv_change_archive` is called, so active source removal (`rq-archiveRetirement01`) only triggers on a passing or override-approved release.

**Tags:** `conformance`, `archive`, `gate`

#### Scenarios

**DRIFT verdict halts archive** (`rq-confArchiveGate01.1`)

**Given:**
- A spec with conformance_required: true
- All seven gates are satisfied including user signoff
- Conformance run returns verdict: DRIFT

**When:** The orchestrator evaluates Phase 5.5

**Then:**
- Archive halts before Phase 6
- The user is presented with three options: fix code locally and rerun archive, override with audit, or unlock + amend the spec
- adv_change_archive is not called

**PASS verdict allows archive to proceed** (`rq-confArchiveGate01.2`)

**Given:**
- A spec with conformance_required: true
- Conformance run returns verdict: PASS

**When:** The orchestrator evaluates Phase 5.5

**Then:**
- Archive continues to Phase 6 (Execute Archive)
- Active source removal (rq-archiveRetirement01) executes only after this gate has passed

---

### Time-Bounded Override With Audit Trail

**ID:** `rq-confOverride01` | **Priority:** **[MUST]**

When CI is unavailable or the user disputes a DRIFT verdict, archive may proceed only via explicit override. Override records MUST include: user identity, reason, re-verify deadline (timestamp), and applied_at. Override entries are append-only; never deleted. Overrides apply to the next archive attempt only; a subsequent archive without a fresh override defaults to PASS-required.

**Tags:** `conformance`, `override`, `audit`

#### Scenarios

**Override entry must include all required audit fields** (`rq-confOverride01.1`)

**Given:**
- A user invokes adv_conformance action: 'override'

**When:** The override is recorded

**Then:**
- The override entry contains user, reason, re_verify_deadline, and applied_at
- Missing any required field rejects the override with a validation error

**Override audit is append-only** (`rq-confOverride01.2`)

**Given:**
- A spec has 2 prior override entries
- A new override is recorded

**When:** The state is persisted

**Then:**
- The overrides array now has 3 entries in chronological order
- Prior entries are not modified or removed

---

### Graceful Degradation For Specs Without Conformance

**ID:** `rq-confDegradation01` | **Priority:** **[MUST]**

Specs default to `conformance_required: false`. Such specs archive normally without invoking the conformance gate. The flag is visible in archive metadata so audit records reflect whether conformance was applied. There is no auto-flip: user opts in per spec by setting conformance_required: true.

**Tags:** `conformance`, `degradation`, `opt-in`

#### Scenarios

**Specs with conformance_required: false skip Phase 5.5** (`rq-confDegradation01.1`)

**Given:**
- A spec has conformance_required: false

**When:** /adv-archive runs against a change that touches this spec

**Then:**
- Phase 5.5 is skipped silently
- Archive proceeds to Phase 6 unchanged

**Existing specs are not auto-flipped** (`rq-confDegradation01.2`)

**Given:**
- The conformance feature has shipped
- An existing spec has conformance_required: false

**When:** A change modifies the spec and reaches archive

**Then:**
- The spec's flag remains false unless the spec author explicitly flipped it
- Archive proceeds without invoking conformance

---

### Drift Triage: Halt + Report, No Auto-Resolve

**ID:** `rq-confTriage01` | **Priority:** **[MUST]**

On DRIFT verdict at archive, the agent halts and reports the failing AC labels (rq_id + summary) plus override/unlock command instructions. The agent does NOT orchestrate the fix. The user picks one of three options manually: fix code locally and rerun archive, invoke `adv_conformance action: 'override'`, or invoke `adv_conformance action: 'unlock'` to amend the spec. No automated path creates a new remediation change or amends the spec without explicit user action.

**Tags:** `conformance`, `triage`, `user-control`

#### Scenarios

**DRIFT halt presents three explicit options** (`rq-confTriage01.1`)

**Given:**
- Phase 5.5 produces verdict: DRIFT with failed AC labels

**When:** The orchestrator surfaces the result

**Then:**
- The user sees the failing rq_id list and brief summaries
- The user sees three explicit options: fix locally + rerun archive; adv_conformance action: 'override'; adv_conformance action: 'unlock'
- The agent does NOT auto-create a remediation change

**Agent does not amend the spec without explicit unlock** (`rq-confTriage01.2`)

**Given:**
- A DRIFT verdict has been surfaced

**When:** The user has not yet replied

**Then:**
- The agent does not edit the spec
- The agent does not edit the implementation
- The agent waits for an explicit user choice before continuing

---
