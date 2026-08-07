# Backlog Coordination

> **Version:** 1.6.0
> **Updated:** 2026-08-04

## Purpose

Multi-agent backlog and WIP coordination via per-change disk projections and bounded claim indexes. Eliminates drift between agent view and user view in single-developer-multi-agent workflows. Bug priority labels act as the source of truth for issue ordering; the change projection itself acts as the durable claim record.

## Requirements

### Cross-session issue claim visibility via AdvBacklogIssueNumber

**ID:** `rq-backlogCoord01` | **Priority:** **[MUST]**

When a change change projection is created with state.origin.issue_number set, regardless of readable origin-kind label, the change projection's AdvBacklogIssueNumber projection field is populated from that issue number. Peer sessions detect existing claims through disk projection lookup filtered on AdvAffectedProjects + AdvBacklogIssueNumber + AdvLifecycleState = "open" + ExecutionStatus = "Running". The change change projection remains the durable claim; roadmap rendering is not part of this contract.

**Tags:** `coordination`, `projection fields`, `claims`

#### Scenarios

**projection fields populated when origin.issue_number set** (`rq-backlogCoord01.1`)

**Given:**
- A change change projection created with seedState.origin = { kind: 'triage', issue_number: 42 }

**When:** buildChangeProjectionFields runs on the change projection state

**Then:**
- The result includes AdvBacklogIssueNumber: ['42']

**projection fields omitted when origin.issue_number absent** (`rq-backlogCoord01.2`)

**Given:**
- A change change projection with state.origin undefined OR state.origin.issue_number undefined

**When:** buildChangeProjectionFields runs

**Then:**
- The result does NOT include an AdvBacklogIssueNumber key

**Peer session sees claim via projection lookup query** (`rq-backlogCoord01.3`)

**Given:**
- Session A creates an issue-linked change with origin.issue_number = 51 in project pid-abc
- projection fields propagation has completed

**When:** Session B queries open running change projections for AdvBacklogIssueNumber = "51"

**Then:**
- The response includes session A's change change projection ID

---

### Atomic issue claim check at change-create time

**ID:** `rq-backlogCoord02` | **Priority:** **[MUST]**

adv_change_create with a positive origin.issue_number performs a disk projection lookup query before change projection start, independent of the readable origin-kind label. If an existing running open-lifecycle change in the same project holds the same AdvBacklogIssueNumber, the tool returns typed CLAIM_CONFLICT evidence. Successful issue-linked creation makes the change change projection the durable claim record.

**Tags:** `coordination`, `claims`, `atomicity`

#### Scenarios

**CLAIM_CONFLICT returned when active change exists for same issue** (`rq-backlogCoord02.1`)

**Given:**
- An open running change change projection holds origin.issue_number = 51 in project pid-abc

**When:** adv_change_create is called with origin_kind: 'triage', origin_issue_number: 51

**Then:**
- The tool returns code CLAIM_CONFLICT with existing change evidence
- No new change projection starts

**Claim succeeds when no existing change holds the issue** (`rq-backlogCoord02.2`)

**Given:**
- No active change projection holds origin.issue_number = 99

**When:** adv_change_create is called with origin_kind: 'triage', origin_issue_number: 99

**Then:**
- The change projection is created
- AdvBacklogIssueNumber is '99'

**Claim check skipped when issue number absent** (`rq-backlogCoord02.3`)

**Given:**
- A create request has no origin.issue_number

**When:** adv_change_create validates the request

**Then:**
- No issue-claim projection lookup query fires
- Creation proceeds independently

---

### Post-create double-check window for race tolerance

**ID:** `rq-backlogCoord03` | **Priority:** **[MUST]**

disk projection lookup is eventually consistent. Two simultaneous issue-linked adv_change_create calls may both pass the pre-create check. After change projection start, any create with a positive origin.issue_number re-runs the same projection lookup query within the configured window, independent of origin kind. More than one change projection sharing the issue produces CLAIM_RACE_DETECTED advisory evidence; the new change is not rolled back.

**Tags:** `coordination`, `claims`, `eventual-consistency`

#### Scenarios

**Race detected when concurrent issue-linked creates land** (`rq-backlogCoord03.1`)

**Given:**
- Two triage-origin creates run concurrently with origin.issue_number = 7
- Both pre-create checks return empty

**When:** Each completes its post-create double-check

**Then:**
- Each response includes CLAIM_RACE_DETECTED with both IDs
- Both changes remain alive

**No race warning on solo issue-linked create** (`rq-backlogCoord03.2`)

**Given:**
- One create has origin.issue_number = 8
- No concurrent create shares the issue

**When:** The post-create check runs

**Then:**
- Exactly one change projection is returned
- No CLAIM_RACE_DETECTED warning appears

---

### Single-call WIP visibility aggregator

**ID:** `rq-backlogCoord04` | **Priority:** **[MUST]**

adv_wip_state returns a single aggregated view of an ADV project's in-flight coordination state: (a) running open-lifecycle changes from disk projection lookup, (b) worktree state from the worktree state DB, (c) peer sessions from the session registry. One tool call per agent session; no client-side composition required. Read-only — does not mutate state.

**Tags:** `coordination`, `wip`, `aggregation`

#### Scenarios

**Aggregated response includes all three sources** (`rq-backlogCoord04.1`)

**Given:**
- Project pid-abc has 2 active changes, 1 active worktree, 1 peer session

**When:** adv_wip_state is called

**Then:**
- The response includes active_changes: [...] with 2 entries
- The response includes worktrees: [...] with 1 entry
- The response includes peer_sessions: [...] with 1 entry
- The response includes generated_at as ISO 8601 timestamp

**Partial failure surfaces as warning, not error** (`rq-backlogCoord04.2`)

**Given:**
- Session registry lookup fails (e.g., SQLite locked)
- Active changes and worktrees succeed

**When:** adv_wip_state is called

**Then:**
- The response includes active_changes and worktrees populated
- The response includes peer_sessions: [] with a warning field describing the failure
- The response is not classified as an error

---

### WIP visibility exposes unreadable projection metadata without hiding healthy state

**ID:** `rq-wipPoisonIsolation01` | **Priority:** **[MUST]**

adv_wip_state MUST preserve healthy active-change, worktree, and peer-session results when one worktree-owning change change projection cannot be queried. Per-change projection poison or query failures from the worktree source MUST be surfaced as human-readable warnings and as structured unreadable_projections metadata optimized for automation and agent triage. The metadata MUST include source, changeId, change projectionId, recoveryReason, evidenceSummary, and message when poison evidence is available. The tool remains read-only and MUST NOT perform destructive recovery.

**Tags:** `coordination`, `wip`, `unavailable-projection`, `automation`

#### Scenarios

**unreadable worktree change projection does not hide healthy WIP** (`rq-wipPoisonIsolation01.1`)

**Given:**
- One change change projection returns healthy worktree records
- A second change change projection query fails with unavailable-projection evidence

**When:** adv_wip_state is called

**Then:**
- The healthy worktree remains in worktrees
- The response includes a warnings entry for the worktree source
- The response includes unreadable_projections with source="worktrees", changeId, change projectionId, recoveryReason, evidenceSummary, and message

**Poison metadata is read-only triage data** (`rq-wipPoisonIsolation01.2`)

**Given:**
- unreadable_projections contains a change projection with TMPRL1100, NonDeterministic, Nondeterminism, Change projectionTaskFailedCauseNonDeterministicError, No command scheduled, or Change projectionExecutionUpdateAccepted evidence

**When:** adv_wip_state returns the response

**Then:**
- No terminate, reset, reseed, archive, or delete action is performed
- Operators can use the metadata to choose a separate audited recovery path

---

### Portfolio-balance cross-reference uses bounded projection lookup lookup

**ID:** `rq-backlogCoord05` | **Priority:** **[MUST]**

/adv-triage portfolio-balance reporting MUST correlate open GitHub issue numbers with active changes through queryActiveChangesByIssueNumbers or an equivalent bounded disk projection lookup lookup. It MUST NOT perform per-change state reads to annotate the issue pool. The retired adv_roadmap tool and its file/live reader modes MUST remain absent.

**Tags:** `coordination`, `performance`, `visibility`

#### Scenarios

**One bounded lookup covers the displayed issue pool** (`rq-backlogCoord05.1`)

**Given:**
- /adv-triage gathered up to 100 open issue numbers

**When:** It builds change-to-issue portfolio annotations

**Then:**
- A single bounded projection lookup lookup covers the pool
- No per-change getState loop is used

**Large issue pools remain bounded** (`rq-backlogCoord05.2`)

**Given:**
- More than 100 open issue numbers

**When:** The lookup runs

**Then:**
- Inputs are chunked at a bounded size
- Results merge into one issue-number map

**projection lookup outage is explicit** (`rq-backlogCoord05.3`)

**Given:**
- GitHub issue data is available
- disk projection lookup is unavailable

**When:** Portfolio balance renders

**Then:**
- Change annotation is marked unavailable
- Issue data remains visible
- No per-change fallback is attempted
- adv_roadmap remains absent

---

### Roadmap snapshot projection is retired

**ID:** `rq-backlogCoord07` | **Priority:** **[MUST]**

ROADMAP.md and .adv/roadmap-snapshot.json are retired projections. /adv-triage MUST NOT generate, refresh, echo, commit, or push either artifact. Portfolio-balance reads use current typed ADV state plus current GitHub issue/project data; no snapshot TTL contract remains.

**Tags:** `coordination`, `freshness`, `ttl`

#### Scenarios

**Triage does not write roadmap artifacts** (`rq-backlogCoord07.1`)

**Given:**
- /adv-triage completes successfully

**When:** Its output and filesystem effects are inspected

**Then:**
- ROADMAP.md is not generated or modified
- .adv/roadmap-snapshot.json is not generated or modified
- No roadmap commit/push prompt appears

**Portfolio balance uses current typed sources** (`rq-backlogCoord07.2`)

**Given:**
- Active changes, Epics, and open GitHub issues exist

**When:** /adv-triage builds its balance report

**Then:**
- Typed ADV reads supply change and Epic state
- Current GitHub reads supply issue state
- No roadmap snapshot freshness metadata is consulted

---

### Change Origin Linkage Matrix, Legacy Roadmap Read Compatibility, and Disk Seed State

**ID:** `rq-backlogCoord08` | **Priority:** **[MUST]**

adv_change_create MUST validate origin linkage before writing a change projection. The roadmap origin kind is readable legacy provenance only and MUST be rejected for new writes with a typed retirement error pointing to triage. Triage accepts optional positive origin_issue_number and optional non-blank source artifact; discovery accepts source artifact but rejects issue number; adhoc and omitted kind reject linkage fields. Valid issue metadata seeds the disk projection and AdvBacklogIssueNumber claim data atomically with change creation.

**Tags:** `coordination`, `origin`, `claims`, `projection fields`

#### Scenarios

**Roadmap origin is readable legacy only** (`rq-backlogCoord08.1`)

**Given:**
- Archived or legacy state contains origin.kind = 'roadmap'
- A new create or repair request sets origin_kind = 'roadmap'

**When:** The state is read or the mutation is validated

**Then:**
- Legacy state remains readable
- The new mutation fails with ORIGIN_KIND_ROADMAP_RETIRED
- The response points to origin_kind 'triage' for issue-linked changes

**Triage origin accepts optional issue and source artifact** (`rq-backlogCoord08.2`)

**Given:**
- A create or repair request uses origin_kind 'triage'

**When:** Positive origin_issue_number or non-blank origin_source_artifact is provided

**Then:**
- The linkage fields are accepted
- Accepted values seed the change projection

**Discovery rejects issue and accepts source artifact** (`rq-backlogCoord08.3`)

**Given:**
- origin_kind is 'discovery'

**When:** Linkage fields are validated

**Then:**
- origin_issue_number is rejected
- A non-blank source artifact is accepted

**Adhoc and omitted origin reject linkage fields** (`rq-backlogCoord08.4`)

**Given:**
- origin_kind is 'adhoc' or omitted

**When:** Linkage fields are provided

**Then:**
- Validation fails before projection creation
- The disallowed field is named

**Seeded issue metadata drives projection fields** (`rq-backlogCoord08.5`)

**Given:**
- A valid triage origin includes origin.issue_number

**When:** The change projection is created

**Then:**
- AdvBacklogIssueNumber is populated from the typed origin projection
- No late unverified patch supplies the value

---

### Triage source cleanup before issue creation and bug priority assignment

**ID:** `rq-backlogCoord09` | **Priority:** **[MUST]**

/adv-triage MUST run source cleanup validation after structural match/gap analysis and before new issue creation or bug priority assignment. Cleanup validation covers represented and unrepresented ADV changes, GitHub issues/project items, and local sources gathered by /adv-triage. Each non-relevant cleanup candidate MUST include source, stable ref, classification, evidence, proposed action, and approval group. Heuristics such as title similarity or agent inference are advisory only and MUST NOT close, complete, cancel, remove, suppress, merge-note, deprioritize, or otherwise mutate items without structural evidence and explicit approval batched by source/reason. Legacy agenda duplicate/superseded/should-merge candidates approved for cleanup MUST complete with a note referencing the survivor/source. Bug priority assignment MUST NOT run until cleanup validation has completed for the candidate pool. User questions during bug priority assignment gather context only and MUST NOT ask the user to confirm or choose a priority; the agent assigns priority autonomously within a bounded question budget.

**Tags:** `triage`, `cleanup`, `backlog`, `human-authority`, `p33`

#### Scenarios

**Cleanup validation precedes issue creation and bug priority assignment** (`rq-backlogCoord09.1`)

**Given:**
- /adv-triage has gathered sources and built represented[] plus unrepresented[] match results

**When:** /adv-triage prepares Phase 4 bug priority loop

**Then:**
- Source cleanup validation has run before any new GH issue creation prompt
- Source cleanup validation has run before any bug priority assignment

**Cleanup candidates carry evidence and action shape** (`rq-backlogCoord09.2`)

**Given:**
- A source item, represented issue, active ADV change, or legacy agenda item is stale, already addressed, duplicate, superseded, should-merge, or unclear

**When:** cleanup validation classifies the candidate

**Then:**
- The report includes source and stable ref
- The report includes classification, evidence, proposed action, and approval group
- Unclear items are surfaced instead of silently suppressed

**Heuristic cleanup findings are advisory only** (`rq-backlogCoord09.3`)

**Given:**
- Title similarity, token overlap, or agent inference flags a cleanup candidate

**When:** No structural evidence and no explicit user approval exists

**Then:**
- /adv-triage does not close, complete, cancel, remove, suppress, merge-note, or deprioritize the item
- The candidate remains surfaced for user confirmation or clarification

**Bug priority assignment is bounded-autonomous** (`rq-backlogCoord09.4`)

**Given:**
- A bug lacks a priority:* label after cleanup validation

**When:** /adv-triage assigns priority

**Then:**
- The agent asks at most 2 context-gathering questions per bug
- If context remains insufficient, priority defaults to medium and a context_insufficient label is applied
- The user is never asked to confirm or choose the priority

**Legacy agenda superseded or merge candidates complete with survivor note** (`rq-backlogCoord09.5`)

**Given:**
- A legacy agenda item is approved as duplicate/superseded or should-merge

**When:** /adv-triage applies cleanup

**Then:**
- The legacy agenda item is completed rather than silently deleted
- The completion note references the survivor/source

---

### Triage Portfolio Balance Represents Unlinked Nonterminal Changes

**ID:** `rq-backlogCoord10` | **Priority:** **[MUST]**

`/adv-triage` portfolio-balance reporting MUST represent nonterminal ADV changes that carry no linked GitHub issue, so defect work tracked only as an ADV change remains visible. Membership in that set MUST be determined structurally from typed change state and MUST NOT be decided by title similarity, title prefix inference, or agent inference. A defect ranking hint MAY influence ordering within the set, MUST render its evidence source, and MUST NOT filter, suppress, close, deprioritize, or authorize any mutation. `origin.kind` is the primary hint source; title prefix is secondary and weak. Existing constraints remain in force: `priority:*` labels stay GitHub-issue-scoped and MUST NOT be written to an ADV change, and the bounded projection lookup lookup rules of rq-backlogCoord05 continue to apply.

**Tags:** `triage`, `backlog`, `portfolio`, `p33`, `structural-membership`

#### Scenarios

**Unlinked changes are represented** (`rq-backlogCoord10.1`)

**Given:**
- Nonterminal ADV changes exist with no linked GitHub issue

**When:** `/adv-triage` renders portfolio balance

**Then:**
- Those changes appear in the report
- They are not excluded by the absence of an issue link

**Membership is structural** (`rq-backlogCoord10.2`)

**Given:**
- The unlinked-change pool is assembled

**When:** Membership is determined

**Then:**
- Eligibility derives from typed change state only
- No title similarity, title prefix, or agent inference decides whether a change appears

**Defect hint is advisory and sourced** (`rq-backlogCoord10.3`)

**Given:**
- A change carries a defect ranking hint

**When:** The row renders

**Then:**
- The hint displays its evidence source
- The hint affects ordering only
- The hint does not filter, suppress, close, deprioritize, or authorize a mutation

**Priority label scope unchanged** (`rq-backlogCoord10.4`)

**Given:**
- Unlinked changes appear in the portfolio report

**When:** The bug priority loop runs

**Then:**
- priority:* labels are written only to GitHub bug issues
- No priority:* label or parallel priority field is written to an ADV change

---

### Planning and WIP Collision Detection for Linked Ops Work

**ID:** `rq-opsFollowWip01` | **Priority:** **[MUST]**

Planning, WIP, and collision checks MUST surface active linked ops/enabler work from structural change projection state or projection lookup-backed discovery, not from agenda text search. adv_wip_state and related planning readbacks MUST include active ops_followup_links and their status when queried in the context of a source/parent change. Collision detection MUST treat an active blocking ops_followup_link as an in-flight dependency.

**Tags:** `coordination`, `wip`, `ops-follow-up`, `collision`, `planning`, `visibility`

#### Scenarios

**WIP state includes active ops follow-ups** (`rq-opsFollowWip01.1`)

**Given:**
- A parent change has active ops_followup_links with status running

**When:** adv_wip_state is queried for the project

**Then:**
- The response includes an ops_follow_ups section
- Each entry contains link ID, target, relationship, and status

**Planning collision uses structural state** (`rq-opsFollowWip01.2`)

**Given:**
- /adv-prep evaluates a change whose parent has a blocks link that is not complete

**When:** The readiness/collision check runs

**Then:**
- The blocker is surfaced from ops_followup_links
- No agenda text search is used as the correctness authority

**Cross-project ops link is discoverable** (`rq-opsFollowWip01.3`)

**Given:**
- A parent in project A links to a child follow-up in project B

**When:** A product-scoped WIP query runs

**Then:**
- The query resolves the target through the product state plane
- The status is surfaced in the WIP view

---
