# Advance Epics

> **Version:** 1.14.0
> **Updated:** 2026-08-04

## Purpose

Capability: Epic entity and workflow contracts for ADV initiative planning. Epics are durable containers that group related ADV changes and lightweight shell entries, replacing project-level ROADMAP.md as the primary ADV planning surface for initiative-level work while keeping Epic membership optional, order advisory, retrofit-capable, and product-scope aware.

## Requirements

### Epic Record Is a Typed, Structural Initiative Container

**ID:** `rq-epicEntity01` | **Priority:** **[MUST]**

An Epic MUST be represented by a typed record containing a stable ID, title, narrative context, ordered roadmap entries, a compact status/progress summary, creation/update timestamps, and optional repo/product scope metadata. Correctness-critical Epic state MUST be structural and typed, not prose-only roadmap text. The Epic record MUST NOT depend on project-level ROADMAP.md for its existence or validation.

**Tags:** `epics`, `schema`, `data-model`

#### Scenarios

**Valid Epic record parses successfully** (`rq-epicEntity01.1`)

**Given:**
- A caller provides an Epic record with all required typed fields

**When:** The record is validated against the Epic schema

**Then:**
- Validation succeeds
- Title, narrative, entries, progress summary, and timestamps are preserved

**Epic record rejects missing title** (`rq-epicEntity01.2`)

**Given:**
- An Epic record is missing the title field

**When:** The record is validated against the Epic schema

**Then:**
- Validation fails with a clear error

---

### Epic Roadmap Supports Linked Changes and Shell Entries

**ID:** `rq-epicEntries01` | **Priority:** **[MUST]**

An Epic's ordered entries MUST support exactly two kinds: `change` entries that reference one ADV change and `shell` entries that represent future work. Change entries MUST remain backward-compatible with legacy same-project `change_id` rows and MUST support a project-aware `change_ref` carrying change ID, project ID, optional repo ID, and optional target path. Every shell entry MUST have a title and a rough success/AC hint; when a shell is imported from a repo backlog item via `backlog_ref`, these fields MAY be derived from the backlog item. Shell entries imported from the repo backlog MUST record `imported_from: { backlog_id, imported_at }` provenance and are one-way bound to the backlog item. Shell entries MUST NOT be required to complete full ADV proposal/discovery before they can exist or be promoted. A change entry MAY carry promotion provenance when it originated from a shell.

**Tags:** `epics`, `entries`, `shell`, `change`, `backlog`

#### Scenarios

**Shell entry requires title and success hint** (`rq-epicEntries01.1`)

**Given:**
- An Epic entry with kind 'shell' is provided

**When:** The entry is validated

**Then:**
- Validation succeeds when title and success_hint are present
- Validation fails when either field is missing

**Change entry requires change ID** (`rq-epicEntries01.2`)

**Given:**
- An Epic entry with kind 'change' is provided

**When:** The entry is validated

**Then:**
- Validation succeeds when legacy change_id is present
- Validation succeeds when change_ref includes change_id and project_id
- Validation fails when neither change_id nor change_ref is present

**Project-aware change entry carries audit fields** (`rq-epicEntries01.3`)

**Given:**
- An Epic change entry uses change_ref

**When:** The entry is validated

**Then:**
- Validation requires title, membership_status, linked_at, linked_by, and link_evidence
- Validation preserves repo/project identity

**Shell imported from backlog carries one-way provenance** (`rq-epicEntries01.4`)

**Given:**
- A shell entry created with backlog_ref

**When:** The entry is validated

**Then:**
- Validation succeeds when title and success_hint are present or derived
- `imported_from.backlog_id` and `imported_from.imported_at` are preserved
- Subsequent backlog edits do not update the shell

---

### Epic Creation Command Is Goal-First and Overlap-Aware

**ID:** `rq-epicCreateCommand01` | **Priority:** **[MUST]**

The `/adv-epic` command MUST guide users through creating or updating Epics with an explicit ultimate goal before mutation. Before creating a new Epic, the command MUST scan related open work through typed Epic/change/backlog reads and surface plausible overlap neutrally. If plausible overlap exists, the command MUST ask the user to choose update/clarify existing, create new, or stop before calling `adv_epic_create`. Initial shell or change entries MUST remain optional and any Epic mutation MUST use typed Epic tools rather than direct ADV state edits.

**Tags:** `epics`, `command`, `goal`, `overlap`

#### Scenarios

**Command requires ultimate goal before creation** (`rq-epicCreateCommand01.1`)

**Given:**
- A user invokes `/adv-epic` to create a new Epic

**When:** The command prepares an Epic creation plan

**Then:**
- The plan includes an explicit ultimate goal
- The command obtains final user confirmation before mutation
- The Epic narrative preserves the confirmed goal

**Overlap requires user choice before duplicate creation** (`rq-epicCreateCommand01.2`)

**Given:**
- The related-work scan finds one or more plausible overlapping open Epics

**When:** The command presents the overlap evidence

**Then:**
- The evidence is presented neutrally
- The user is asked to choose update/clarify existing, create new, or stop
- The command does not call `adv_epic_create` for a plausible duplicate until the user chooses create new

**Initial entries remain optional** (`rq-epicCreateCommand01.3`)

**Given:**
- A user has confirmed an Epic title, ultimate goal, and narrative but has no initial child work

**When:** The command creates the Epic

**Then:**
- The Epic may be created with zero initial roadmap entries
- Shell and linked-change additions remain available through typed Epic tools

---

### Epic Coordination Command Is Read-First and Approval-Gated

**ID:** `rq-epicCoordinateCommand01` | **Priority:** **[MUST]**

The `/adv-coordinate` command MUST inventory active Epics through typed reads before proposing intent-bearing durable mutations. It MUST report ownership-boundary, narrative accuracy, cross-Epic dependency, advisory sequencing, capstone placement, and membership-health findings while distinguishing evidence-backed facts from judgment calls. Epic order findings MUST remain advisory and MUST NOT block gates, tasks, promotion, or change progress. Narrative updates, reorders, retargeting, removal, and competing-authority resolution MUST use typed Epic tools and require explicit user approval. Missing or stale matching derived membership MUST converge directly under rq-epicMembershipConvergence01 and MUST NOT require separate operator approval or repair-tool selection. The command MUST NOT introduce mandatory Epic membership, auto-enrollment, Jira-like planning primitives, direct ADV state edits, or CLI mutation verbs.

**Tags:** `epics`, `command`, `coordination`, `approval`

#### Scenarios

**Coordination report reads before intent mutation** (`rq-epicCoordinateCommand01.1`)

**Given:**
- One or more active Epics exist

**When:** `/adv-coordinate` prepares a coordination report

**Then:**
- Epics are inventoried through typed Epic reads before intent-bearing mutation is proposed
- The report covers alignment, narrative accuracy, dependencies, sequencing, capstone placement, and membership health
- Evidence-backed facts are separated from judgment calls

**Order findings remain advisory** (`rq-epicCoordinateCommand01.2`)

**Given:**
- A sequencing inversion is detected

**When:** The coordination report recommends a reorder

**Then:**
- The reorder is presented as advisory
- No gate, task, promotion, or change progress is blocked solely due to order

**Intent-bearing actions require approval while derived convergence is direct** (`rq-epicCoordinateCommand01.3`)

**Given:**
- Narrative edits, reorders, retargeting, removal, competing authority, or missing matching derived projection is observed

**When:** The state is handled

**Then:**
- Intent-bearing mutations require explicit user approval and typed Epic tools
- Missing or stale matching derived membership converges directly under rq-epicMembershipConvergence01
- No dedicated membership-repair tool is required

**Coordination adds no new planning primitive** (`rq-epicCoordinateCommand01.4`)

**Given:**
- The `/adv-coordinate` command is implemented

**When:** Command assets and CLI surfaces are inspected

**Then:**
- Epic membership remains optional and no change is auto-enrolled
- Jira-like assignments, estimates, sprints, boards, and ownership workflows are absent
- No CLI mutation verb is introduced for coordination
- The command does not instruct agents to directly read or edit ADV state files

---

### Epic Coordination Uses Current Repository Evidence Before Alignment Conclusions

**ID:** `rq-epicCoordinateRepoFreshness01` | **Priority:** **[MUST]**

The `/adv-coordinate` command MUST establish and report repository freshness before making alignment, sequencing, overlap, cancellation, supersession, narrative, reorder, retarget, or no-action conclusions that depend on current repository state. The command MUST collect bounded repository evidence such as current branch, HEAD SHA, default branch/upstream relation, remote freshness, ahead/behind state, dirty or uncommitted work risk, and recent commit or diff evidence when available. A bounded remote-ref refresh such as `git fetch --prune` MAY be used for freshness discovery, but the command MUST NOT merge, rebase, checkout, reset, clean, stash, or mutate product code. When repository freshness cannot be established, findings MUST be marked `freshness_limited` and the report MUST avoid evidence-backed conclusions that depend on missing repo state. The coordination report MUST compare Epic entries and linked change artifacts against current repository evidence before proposing durable actions, and MUST classify findings as `repo_backed_fact`, `adv_backed_fact`, `judgment_call`, or `freshness_limited`. Heuristics MAY rank likely overlap, but MUST NOT authorize mutation; approved durable actions still require typed ADV/Epic tools and explicit user approval.

**Tags:** `epics`, `command`, `coordination`, `repository`, `freshness`

#### Scenarios

**Repository freshness is reported before coordination conclusions** (`rq-epicCoordinateRepoFreshness01.1`)

**Given:**
- One or more active Epics exist

**When:** `/adv-coordinate` prepares alignment, sequencing, or overlap findings

**Then:**
- The report includes current repository freshness evidence before those findings
- The report includes current branch, HEAD SHA, default branch or upstream relation, ahead/behind state, and dirty or uncommitted work risk when available
- The report includes recent commit or diff evidence when it is used to justify an overlap or no-action conclusion

**Freshness-limited repository state blocks evidence-backed claims** (`rq-epicCoordinateRepoFreshness01.2`)

**Given:**
- Remote freshness, default branch relation, or local repository evidence cannot be established

**When:** `/adv-coordinate` prepares its report

**Then:**
- Affected findings are marked `freshness_limited`
- The report avoids evidence-backed conclusions that depend on missing repo state
- The limitation is surfaced as a coordination risk rather than silently trusting ADV plan state

**Overlap findings compare plans with current repository evidence** (`rq-epicCoordinateRepoFreshness01.3`)

**Given:**
- Active Epic entries or linked changes may overlap recent repository changes

**When:** `/adv-coordinate` recommends cancel, supersede, narrative update, reorder, retarget, or no-action outcomes

**Then:**
- The recommendation cites typed ADV evidence, current repository evidence, or both
- The finding is classified as `repo_backed_fact`, `adv_backed_fact`, `judgment_call`, or `freshness_limited`
- Heuristic overlap is presented as a judgment call and does not authorize mutation

**Repository freshness discovery does not mutate product code or bypass approval** (`rq-epicCoordinateRepoFreshness01.4`)

**Given:**
- `/adv-coordinate` attempts to establish current repository evidence

**When:** Repository freshness discovery runs

**Then:**
- A bounded remote-ref refresh such as `git fetch --prune` may be used
- The command does not merge, rebase, checkout, reset, clean, stash, or mutate product code
- Any durable ADV or Epic mutation still requires explicit user approval and typed tools

---

### Epic Coordination Inventories Participating Projects Before Epic-Dependent Alignment

**ID:** `rq-epicCoordinateProjectInventory01` | **Priority:** **[MUST]**

The `/adv-coordinate` command MUST inventory every participating project's in-flight changes using typed `adv_change_list` with complete pagination before Epic-dependent alignment. The command MUST describe typed `scope: "product"` and explicit `target_path` for cross-project reads and MUST NOT infer target paths. When expected product context is unavailable, cross-project conclusions MUST be classified as `freshness_limited` or `judgment_call`, never `adv_backed_fact`. The no-active-Epics condition MUST follow complete project-change reporting, and the coordination report MUST include Projects scanned, Changes by project, Epics scanned, and entries scanned. Optional Epic membership, advisory Epic order, existing approval-gated mutations, and repository freshness requirements MUST be preserved.

**Tags:** `epics`, `command`, `coordination`, `project-inventory`, `cross-project`

#### Scenarios

**Project inventory precedes Epic-dependent alignment** (`rq-epicCoordinateProjectInventory01.1`)

**Given:**
- One or more participating projects contain in-flight changes

**When:** `/adv-coordinate` prepares alignment, sequencing, or overlap findings

**Then:**
- Every participating project's in-flight changes are inventoried via typed adv_change_list with complete pagination
- Project inventory completes before Epic-dependent alignment is analyzed
- The report includes Projects scanned and Changes by project

**Cross-project reads use explicit target_path and product scope** (`rq-epicCoordinateProjectInventory01.2`)

**Given:**
- The coordination report needs cross-project evidence

**When:** `/adv-coordinate` reads changes or Epics outside the current project

**Then:**
- Typed scope: "product" and explicit target_path are described
- Target paths are not inferred from context
- Missing product context causes cross-project conclusions to be freshness_limited or judgment_call

**No-active-Epics condition follows complete project-change reporting** (`rq-epicCoordinateProjectInventory01.3`)

**Given:**
- Project inventory completes with zero active Epics

**When:** `/adv-coordinate` reports its findings

**Then:**
- The report includes Projects scanned, Changes by project, Epics scanned, and entries scanned
- The no-active-Epics message follows complete project-change reporting
- Coordination stops without proposing Epic mutations

**Project inventory preserves existing coordination constraints** (`rq-epicCoordinateProjectInventory01.4`)

**Given:**
- The `/adv-coordinate` command is implemented

**When:** Command assets and behavior are inspected

**Then:**
- Epic membership remains optional and order remains advisory
- Existing approval-gated mutations and repository freshness requirements are preserved
- No new runtime tool, CLI mutation verb, or direct ADV-state filesystem access is introduced

---

### Epic Coordination Analyzes All Nonterminal Changes Regardless of Epic Membership

**ID:** `rq-epicCoordinateChangeCoverage01` | **Priority:** **[MUST]**

The `/adv-coordinate` command MUST analyze every nonterminal in-flight change from its project inventory regardless of Epic membership. Change-scoped analysis — including repository-overlap comparison, advisory sequencing, and refactor-coverage classification — MUST NOT be gated on the presence of active Epics. Epic-dependent phases MAY still short-circuit when no active Epics exist, but that short-circuit MUST NOT suppress change-scoped analysis. Inventory reads MUST follow `hasMore` and `resumeHint` until the in-flight population is exhausted; a single `adv_change_list` call MUST NOT be treated as complete. Existing coordination boundaries MUST be preserved: no task creation, no gate completion, no Epic auto-enrollment, advisory Epic order, approval-gated durable Epic actions, and change closure remaining routed to `/adv-cleanup`.

**Tags:** `epics`, `command`, `coordination`, `change-coverage`, `p33`

#### Scenarios

**Change analysis runs without active Epics** (`rq-epicCoordinateChangeCoverage01.1`)

**Given:**
- A project has nonterminal in-flight changes
- The project has zero active Epics

**When:** `/adv-coordinate` runs

**Then:**
- The refactor coverage audit executes
- Evidence-backed drift candidates are reported with their dry-run referral
- The no-active-Epics message applies only to Epic-dependent findings

**Unlinked changes receive the same scrutiny** (`rq-epicCoordinateChangeCoverage01.2`)

**Given:**
- A project contains both Epic-linked and Epic-unlinked nonterminal changes

**When:** Repository-overlap and sequencing analysis run

**Then:**
- Epic-unlinked changes are compared against current repository evidence on the same terms as linked changes
- Findings carry the same repo_backed_fact, adv_backed_fact, judgment_call, or freshness_limited labels

**Existing boundaries preserved** (`rq-epicCoordinateChangeCoverage01.3`)

**Given:**
- Coordination analyzes Epic-unlinked changes

**When:** The coordination report is produced

**Then:**
- No task is created and no gate is completed
- No change is auto-enrolled into an Epic
- Change closure remains routed to /adv-cleanup

**Inventory pagination is honoured** (`rq-epicCoordinateChangeCoverage01.4`)

**Given:**
- The in-flight change population exceeds one page

**When:** Coordination builds its project inventory

**Then:**
- hasMore and resumeHint are followed until the population is exhausted
- A single adv_change_list call is not treated as complete

---

### Shell Promotion Replaces the Shell Row with Exactly One Linked Change

**ID:** `rq-epicPromotion01` | **Priority:** **[MUST]**

Promoting a shell entry MUST create or link exactly one ADV change, then replace the shell row in the Epic with a `change` row. The new change row MUST carry promotion provenance that preserves the original shell title and success hint. Promotion MUST be idempotent: retrying promotion of the same shell MUST return the already-linked change without creating duplicate rows.

**Tags:** `epics`, `promotion`, `shell`, `idempotency`

#### Scenarios

**Promotion replaces shell with linked change row** (`rq-epicPromotion01.1`)

**Given:**
- An Epic contains a shell entry

**When:** The shell is promoted

**Then:**
- The shell row is removed from the Epic entries
- Exactly one 'change' row appears in its place
- The change row carries the shell's title and success hint as promotion provenance

**Duplicate promotion returns existing change** (`rq-epicPromotion01.2`)

**Given:**
- A shell has already been promoted to a linked change

**When:** Promotion is retried for the same shell entry ID

**Then:**
- No new change is created
- No additional Epic row is added
- The existing linked change ID is returned

---

### Epic Order Is Advisory and Must Not Hard-Block Later Entries

**ID:** `rq-epicOrderAdvisory01` | **Priority:** **[MUST]**

Epic entry order MUST affect display and next-work recommendations only. Starting or resuming a later Epic entry MAY warn about earlier incomplete entries, but MUST NOT block gates, tasks, or promotion solely because of order. The advisory-order contract MUST be preserved in v1.

**Tags:** `epics`, `order`, `advisory`, `blocking`

#### Scenarios

**Later entry can be started while earlier entry is incomplete** (`rq-epicOrderAdvisory01.1`)

**Given:**
- An Epic has two entries where the first is incomplete

**When:** An agent starts work on the second entry

**Then:**
- The start or resume succeeds
- A warning about earlier incomplete work MAY be surfaced
- No hard gate or task blockage is introduced solely due to order

---

### Advisory Rank Must Not Render Epic-Unlinked Changes Unreachable

**ID:** `rq-epicAdvisoryRankReachability01` | **Priority:** **[MUST]**

Advisory rank MUST NOT render an Epic-unlinked change unreachable as recommended next work. A change lacking Epic membership MUST NOT receive an unconditional maximum-rank penalty that places it behind every Epic-linked change irrespective of its own signals. Relative order among Epic-linked entries MUST be preserved. Rank remains advisory and MUST NOT block gates, tasks, promotion, or change progress. This requirement preserves optional Epic membership under rq-epicOptionalMembership01 by preventing membership absence from acquiring gating authority over visibility.

**Tags:** `epics`, `next-work`, `advisory-order`, `projection`, `optional-membership`

#### Scenarios

**Unlinked change is reachable alongside linked work** (`rq-epicAdvisoryRankReachability01.1`)

**Given:**
- A project has at least one Epic-linked nonterminal change
- The same project has at least one Epic-unlinked nonterminal change

**When:** The resume projection is built

**Then:**
- The Epic-unlinked change can appear in ordered_next on its own signals
- The Epic-unlinked change is not assigned an unconditional maximum-rank penalty

**Epic order stays advisory** (`rq-epicAdvisoryRankReachability01.2`)

**Given:**
- Epic-linked entries carry an explicit order

**When:** Advisory rank is computed

**Then:**
- Relative order among Epic-linked entries is preserved
- No gate, task, promotion, or change progress is blocked by rank

---

### Default Epic View Surfaces Compact Terminal History

**ID:** `rq-epicCompactHistory01` | **Priority:** **[SHOULD]**

The default Epic view MUST show next active and future work prominently and MUST include compact rows for archived or closed child changes. Full historical detail MUST remain available through an explicit view or context fetch, not inflate the default hot-path response.

**Tags:** `epics`, `history`, `ui`, `bounding`

#### Scenarios

**Default view distinguishes active and terminal entries** (`rq-epicCompactHistory01.1`)

**Given:**
- An Epic has active, future, archived, and closed entries

**When:** The default Epic view is rendered

**Then:**
- Active and future entries are clearly visible
- Archived/closed entries are shown as compact history
- Response size and detail remain bounded

---

### Change Surfaces Show Compact Epic Membership Context

**ID:** `rq-epicChangeContext01` | **Priority:** **[MUST]**

When a change belongs to an Epic, change show/status/resume surfaces MUST surface compact Epic membership context including Epic ID, entry ID, order, title, linked timestamp, owner Epic project ID when known, repo ID when known, and projection source when known. The context MUST be additive and MUST NOT replace or obscure the change's own gates, tasks, or artifacts. Changes without Epic membership MUST render identically to the pre-Epic flow.

**Tags:** `epics`, `change`, `context`, `membership`

#### Scenarios

**Epic child change shows compact context** (`rq-epicChangeContext01.1`)

**Given:**
- A change has an epic_membership projection

**When:** The change is shown or resumed

**Then:**
- Epic ID, entry ID, order, title, and extended project/repo metadata are surfaced when present
- The change's own status and tasks remain primary

**Non-Epic changes remain unchanged** (`rq-epicChangeContext01.2`)

**Given:**
- A change has no epic_membership

**When:** The change is shown or resumed

**Then:**
- No Epic context is rendered
- Existing fields and behavior are unchanged

---

### Epic Show Projects Advisory Fast-Follow Lineage from Child fast_follow_of

**ID:** `rq-epicFastFollowLineage01` | **Priority:** **[MUST]**

When an Epic entry references a child change that carries typed `fast_follow_of` metadata, `adv_epic_show` MUST render a bounded, additive `fast_follow_lineage` projection on that entry containing the source change ID, the source task ID when known (derived from `followup_ref.report_key` task scope, else null), a `non_blocking_advisory` classification, and the fast-follow `linked_at` timestamp. The projection MUST be advisory-only: it MUST NOT create Epic task ownership, MUST NOT introduce a dependency enum, MUST NOT change task readiness behavior, MUST NOT alter Epic order, and MUST NOT affect release or gate eligibility. Shell entries and entries whose child change has no `fast_follow_of` (or cannot be loaded) MUST render without the lineage field. The projection MUST be bounded by the number of change entries in the rendered Epic view and MUST cache per-child-change reads within a single render call. Operational work continues to flow through typed `ops_followup_links`; this projection is reserved for non-operational advisory fast-follow children.

**Tags:** `epics`, `fast-follow`, `lineage`, `projection`, `advisory`

#### Scenarios

**Epic change entry renders fast-follow lineage when child has fast_follow_of** (`rq-epicFastFollowLineage01.1`)

**Given:**
- An Epic entry references a child change with typed fast_follow_of metadata
- The fast_follow_of carries parent_change_id, linked_at, and an optional followup_ref

**When:** adv_epic_show renders the Epic

**Then:**
- The entry includes fast_follow_lineage with source_change_id equal to parent_change_id
- fast_follow_lineage.classification is 'non_blocking_advisory'
- fast_follow_lineage.linked_at matches the child fast_follow_of.linked_at
- fast_follow_lineage.source_task_id equals the task id embedded in followup_ref.report_key when the report scope is task-level, otherwise null

**Entries without fast_follow_of render unchanged** (`rq-epicFastFollowLineage01.2`)

**Given:**
- An Epic entry references a child change without fast_follow_of
- Or the child change fails to load

**When:** adv_epic_show renders the Epic

**Then:**
- The entry renders without a fast_follow_lineage field
- Existing entry fields, order, and member_status are unchanged
- adv_epic_show still returns success

**Lineage projection is bounded and additive** (`rq-epicFastFollowLineage01.3`)

**Given:**
- An Epic has both shell and change entries, with at least one fast-follow child

**When:** adv_epic_show renders the Epic

**Then:**
- Shell entries never receive a fast_follow_lineage field
- Per-render store reads are bounded by unique child change_id values
- No Epic entry order, progress, or release/gate behavior is altered by the projection

---

### ADV Next-Work Selection Can Operate from Epics

**ID:** `rq-epicNextWork01` | **Priority:** **[SHOULD]**

ADV next-work selection and planning surfaces MUST be able to use Epics as a source of recommended next work without requiring a project-level ROADMAP.md. The recommendation MUST respect Epic order as advisory and MUST surface warnings rather than block when earlier entries are incomplete.

**Tags:** `epics`, `next-work`, `roadmap`

#### Scenarios

**Next work can be chosen from an Epic** (`rq-epicNextWork01.1`)

**Given:**
- An Epic has active and future entries

**When:** ADV next-work selection queries available work

**Then:**
- Epic entries are considered as candidates
- A recommended next entry is surfaced without requiring ROADMAP.md

---

### Epic Membership Remains Optional and Non-Epic Changes Stay Valid

**ID:** `rq-epicOptionalMembership01` | **Priority:** **[MUST]**

Epic membership MUST be optional for all ADV changes. Existing non-Epic changes, changes created outside Epics, and changes whose Epic is later archived MUST remain valid and continue through the normal gate/task flow. The change schema MUST treat epic_membership as an optional additive projection.

**Tags:** `epics`, `membership`, `optional`, `compatibility`

#### Scenarios

**Legacy change without Epic membership parses cleanly** (`rq-epicOptionalMembership01.1`)

**Given:**
- A change record created before Epics exists

**When:** The change is parsed by the current schema

**Then:**
- Validation succeeds
- epic_membership is undefined
- All existing fields are preserved

**Malformed epic_membership is rejected** (`rq-epicOptionalMembership01.2`)

**Given:**
- A change record contains an epic_membership object missing required fields

**When:** The change is parsed

**Then:**
- Validation fails with a clear schema error

---

### One Epic Per Change in V1

**ID:** `rq-epicOnePerChange01` | **Priority:** **[MUST]**

In v1, each ADV change MAY belong to zero or one Epic. The change schema MUST represent epic_membership as a single optional object, not an array. Product/multi-project Epics MUST still preserve this one-Epic-per-change invariant by storing one compact membership projection on each linked child change.

**Tags:** `epics`, `membership`, `v1`, `scope`

#### Scenarios

**Single Epic membership is valid** (`rq-epicOnePerChange01.1`)

**Given:**
- A change record has one epic_membership object

**When:** The change is parsed

**Then:**
- Validation succeeds
- epic_id is accessible

---

### Retroactive Membership Is Audited, Movable, and Repairable

**ID:** `rq-epicMembershipRepair01` | **Priority:** **[MUST]**

Existing ADV changes MAY be linked into an Epic after creation, unlinked, moved between Epics, removed from a stale parent entry, or retargeted from a stale parent entry through typed tools only. Link, unlink, move, and repair operations MUST require audit evidence, MUST preserve `fast_follow_of` as creation lineage, and MUST update the child change's compact `epic_membership` projection when the child project is reachable. Cross-project membership mutations MUST follow target-path trust rules. Partial failures MUST surface deterministic membership status such as `projection_pending`, `projection_stale`, or `target_unreachable`, with explicit repair paths for projection sync, parent-only removal, and audited retarget.

**Tags:** `epics`, `membership`, `repair`, `audit`, `cross-project`

#### Scenarios

**Existing change links with child projection** (`rq-epicMembershipRepair01.1`)

**Given:**
- An existing ADV change has no Epic membership

**When:** The change is linked to an Epic with audit evidence

**Then:**
- The Epic records a project-aware change entry
- The child change receives exactly one `epic_membership` projection
- `fast_follow_of` is not created or changed

**Move preserves one-Epic invariant** (`rq-epicMembershipRepair01.2`)

**Given:**
- A child change belongs to one Epic

**When:** The change is moved to another Epic with audit evidence

**Then:**
- The source Epic no longer appears as the active membership
- The destination Epic owns the child projection
- No second simultaneous Epic membership is created

**Unreachable target remains recoverable** (`rq-epicMembershipRepair01.3`)

**Given:**
- An Epic entry references a target project that cannot be reached

**When:** Membership is shown or repaired

**Then:**
- The Epic remains readable
- The member reports `target_unreachable` or another typed repair status
- A repair operation can dry-run before mutating state

**Missing child entry can be removed from parent only** (`rq-epicMembershipRepair01.4`)

**Given:**
- An Epic entry references a missing child workflow

**When:** An operator runs audited parent-only stale-entry removal

**Then:**
- The parent Epic entry is removed through a typed Epic mutation
- The missing child workflow is not loaded or mutated
- Blank or omitted audit evidence is rejected

**Missing child entry can be retargeted to reachable child** (`rq-epicMembershipRepair01.5`)

**Given:**
- An Epic parent entry references missing child A
- Reachable child B is supplied with audit evidence

**When:** An operator runs audited stale-entry retarget

**Then:**
- The parent Epic entry is atomically retargeted to child B
- Entry ID, order, and title are preserved where possible
- Child B receives or refreshes the compact `epic_membership` projection when reachable

**Retarget refuses conflicting child membership** (`rq-epicMembershipRepair01.6`)

**Given:**
- The proposed target child already belongs to a different Epic or entry

**When:** An operator attempts stale-entry retarget

**Then:**
- The repair returns a typed membership mismatch
- The parent Epic entry is not mutated
- No second simultaneous Epic membership is created

---

### Epic Product Scope Is Derived from Typed Scope Breadth

**ID:** `rq-epicScopeDerivation01` | **Priority:** **[MUST]**

Every Epic MUST be product-capable through typed scope metadata. User-facing local/product-spanning classification MUST be derived from the Epic scope repo/project list: one scoped repo renders as local/repo-scoped, multiple scoped repos/projects render as product-spanning, and missing scope renders as legacy/unscoped. `epic_scope.kind` MAY be preserved for backward compatibility but MUST NOT be the correctness authority for classification.

**Tags:** `epics`, `scope`, `product`, `compatibility`

#### Scenarios

**Single-repo scope renders local** (`rq-epicScopeDerivation01.1`)

**Given:**
- An Epic scope contains exactly one repo entry
- The legacy kind field says `product`

**When:** The Epic is rendered or classified

**Then:**
- The derived scope label is local or repo-scoped
- The legacy kind field is not used as the classification authority

**Multi-repo scope renders product-spanning** (`rq-epicScopeDerivation01.2`)

**Given:**
- An Epic scope contains two repo/project entries

**When:** The Epic is rendered or classified

**Then:**
- The derived scope label is product-spanning
- Owner project and repo_project_id metadata are preserved

**Missing scope remains legacy-readable** (`rq-epicScopeDerivation01.3`)

**Given:**
- A legacy Epic has no epic_scope

**When:** The Epic is parsed or shown

**Then:**
- Validation succeeds
- The derived scope label is legacy/unscoped
- The Epic can be backfilled through typed scope mutation

---

### Existing Active Epics Support Audited Scope Mutation

**ID:** `rq-epicMutableScope01` | **Priority:** **[MUST]**

An active Epic's typed scope metadata MUST be mutable after creation through a typed, audited, optimistic-concurrency mutation path. Scope mutation MUST require audit evidence and an expected version, MUST reject stale writes without changing scope, and MUST NOT silently orphan linked child-change entries when repos/projects are removed. Dry-run preview SHOULD report the derived scope label and removal impact before mutation.

**Tags:** `epics`, `scope`, `mutation`, `audit`, `concurrency`

#### Scenarios

**Active Epic expands scope** (`rq-epicMutableScope01.1`)

**Given:**
- An active Epic has one scoped repo
- The caller supplies a current expected version and audit evidence

**When:** A typed scope update adds a second repo/project entry

**Then:**
- The Epic scope contains both repos
- The Epic version increments
- The derived scope label becomes product-spanning

**Stale scope update is rejected** (`rq-epicMutableScope01.2`)

**Given:**
- An active Epic has version 3

**When:** A scope update is submitted with expected version 2

**Then:**
- A typed stale-version conflict is returned
- The existing scope is unchanged

**Scope removal cannot orphan children silently** (`rq-epicMutableScope01.3`)

**Given:**
- An Epic has a linked child entry for repo A

**When:** A scope update removes repo A

**Then:**
- The update is rejected, requires explicit disposition, or surfaces typed repair status
- No child epic_membership projection is silently detached

---

### Active Duplicate Epics Can Merge into One Survivor

**ID:** `rq-epicMerge01` | **Priority:** **[MUST]**

Active duplicate Epics MAY be merged into one survivor Epic through a typed, audited, plan-first mutation path. Merge planning MUST surface unique entries, conflicts, target-project confirmations, and terminal-source rejection before mutation. Execution MUST preserve the one-owning-Epic-per-change invariant, MUST update reachable child epic_membership projections to the survivor, MUST require explicit conflict disposition instead of heuristic dedupe, and MUST leave the source Epic readable with a survivor pointer and no active next-work. Completed, archived, or already-merged source Epics MUST NOT be merged into active survivors; they may be referenced as historical context only.

**Tags:** `epics`, `merge`, `membership`, `audit`, `cross-project`

#### Scenarios

**Unique entries move to survivor** (`rq-epicMerge01.1`)

**Given:**
- Two active Epics contain unique linked changes
- The caller supplies audit evidence and current versions

**When:** The source Epic is merged into the survivor

**Then:**
- Unique entries appear on the survivor
- Reachable child epic_membership projections point to the survivor
- No child change has two owning Epic memberships

**Conflicting entries require disposition** (`rq-epicMerge01.2`)

**Given:**
- The source and survivor Epics contain similar shell entries or duplicate child changes

**When:** A merge is executed without conflict resolution

**Then:**
- The merge is rejected with typed conflict details
- No heuristic title-based dedupe is applied
- No source entries are silently dropped

**Merged source remains readable but inactive** (`rq-epicMerge01.3`)

**Given:**
- A source Epic has been successfully merged into a survivor

**When:** The source Epic is shown or considered for next work

**Then:**
- The source Epic exposes a merged_into survivor pointer with audit evidence
- The source Epic has no active next-work recommendation
- The source Epic remains queryable for history

**Terminal sources are historical references only** (`rq-epicMerge01.4`)

**Given:**
- A source Epic is completed, archived, or already merged

**When:** A caller attempts to merge it into an active survivor

**Then:**
- The merge mutation is rejected
- The source may be referenced as historical context only

---

### Archive Synchronizes Epic Child Terminal State

**ID:** `rq-epicArchiveSync01` | **Priority:** **[MUST]**

When an ADV change with `epic_membership` is archived, the archive/release flow MUST load the parent Epic, project the child change's terminal state onto the linked Epic entry after release proof, verify the terminal Epic entry/projection state, and surface Epic evidence in the archive report. Already-archived child changes whose Epic entries remain active MUST be repairable/backfillable from canonical child/archive state through `adv_epic_show`, which performs automatic bounded direct convergence (rq-epicMembershipConvergence01); direct ADV state edits are forbidden. Changes without Epic membership MUST continue through the normal archive flow. Epic order MUST remain advisory and MUST NOT block archive solely because earlier entries are incomplete.

**Tags:** `epics`, `archive`, `release`, `membership`

#### Scenarios

**Epic child archive records terminal summary** (`rq-epicArchiveSync01.1`)

**Given:**
- A change has an `epic_membership` projection
- The archive flow has obtained valid release proof for the child change

**When:** The change is marked archived

**Then:**
- The parent Epic entry receives a terminal summary or equivalent typed terminal-history state
- The archived child appears in compact Epic history rather than active next work
- The archive report includes Epic verification evidence

**Stale projection uses typed repair path** (`rq-epicArchiveSync01.2`)

**Given:**
- An archived child change has an Epic entry whose membership projection is stale, pending, or target-unreachable

**When:** Archive verification inspects the parent Epic

**Then:**
- The flow uses `adv_epic_show` to trigger automatic bounded direct convergence
- No direct ADV state files are read or edited
- Unresolved repair status is surfaced in archive evidence

**Retroactive repair backfills archived child progress** (`rq-epicArchiveSync01.3`)

**Given:**
- An Epic entry remains active even though the linked child change is already `archived` or `closed`

**When:** `adv_epic_show` runs with canonical child/archive evidence and performs automatic convergence

**Then:**
- The existing Epic entry receives terminal summary state
- Epic progress recomputes completed entries and next entry from terminal summaries
- The convergence result reports terminal projection evidence

**Non-Epic archive remains unchanged** (`rq-epicArchiveSync01.4`)

**Given:**
- A change has no `epic_membership` projection

**When:** The change is archived

**Then:**
- No Epic lookup or mutation is required
- The normal archive proof and report behavior remain valid
- The report may record `Epic: n/a`

**Earlier incomplete Epic entries do not block archive by order** (`rq-epicArchiveSync01.5`)

**Given:**
- A child change belongs to an Epic
- An earlier Epic entry is incomplete

**When:** The child change archive flow verifies Epic context

**Then:**
- The earlier incomplete entry may be reported as advisory context
- The archive is not blocked solely by Epic order
- Phase 9 release proof remains the archive authority

---

### Product Epics Carry Repo and Project Scope Metadata

**ID:** `rq-epicProductScope01` | **Priority:** **[MUST]**

An Epic MAY be scoped to a single repo or to a product spanning multiple repositories/projects. Product Epic scope metadata MUST include the owner ADV project ID and a typed repo list containing repo ID, repo project ID, role, required flag, and optional path. Product Epics MUST NOT require duplicate repo-local Epics for one initiative.

**Tags:** `epics`, `product`, `scope`, `cross-project`

#### Scenarios

**Product scope spans multiple repos** (`rq-epicProductScope01.1`)

**Given:**
- An Epic scope includes two configured repositories

**When:** The Epic is validated

**Then:**
- Validation succeeds
- Owner project ID and each repo_project_id are preserved
- No duplicate repo-local Epic is required

**Scope repo requires project identity** (`rq-epicProductScope01.2`)

**Given:**
- An Epic scope repo is missing repo_project_id

**When:** The scope is validated

**Then:**
- Validation fails with a clear schema error

---

### Epic Membership Tools Separate Owner Routing from Child target_path

**ID:** `rq-epicOwnerRouting01` | **Priority:** **[MUST]**

Epic membership mutation tools (adv_epic_link_change, adv_epic_unlink_change, adv_epic_move_change) MUST support explicit owner project routing separate from the child change target_path. The owner Epic MUST be resolved through an epic_owner_target_path parameter or the current project when omitted, and the child change MUST be resolved through target_path or the owner project when omitted. The supported routing matrix is: owner local + child local; owner local + child remote; owner remote + child same remote; owner remote + child different remote. Ambiguous or partial shapes—such as supplying only a child target_path when the Epic is not in the current project, or supplying an owner route without a distinct child route when the child is not in the owner project—MUST fail before durable mutation with typed OWNER_ROUTING_AMBIGUOUS or OWNER_ROUTING_REQUIRED errors. Existing child-only target_path behavior MUST remain valid when the Epic owner is the current project.

**Tags:** `epics`, `routing`, `cross-project`, `target_path`

#### Scenarios

**Same-project membership routing** (`rq-epicOwnerRouting01.1`)

**Given:**
- An Epic and child change both live in the current project

**When:** The membership tool is called with no routing parameters

**Then:**
- The tool resolves owner and child in the current project
- The operation succeeds

**Owner local and child remote** (`rq-epicOwnerRouting01.2`)

**Given:**
- An Epic lives in the current project
- A child change lives in another ADV project

**When:** The membership tool is called with target_path for the child project and no owner route

**Then:**
- The owner Epic resolves in the current project
- The child change resolves in the target project
- The operation succeeds

**Owner remote and child same remote** (`rq-epicOwnerRouting01.3`)

**Given:**
- An Epic and child change both live in the same remote ADV project

**When:** The membership tool is called with epic_owner_target_path and either the same target_path or a structural same-owner proof

**Then:**
- Both owner and child resolve in the remote project
- The operation succeeds

**Owner remote and child different remote** (`rq-epicOwnerRouting01.4`)

**Given:**
- An Epic lives in remote project A
- A child change lives in remote project C

**When:** The membership tool is called with epic_owner_target_path=A and target_path=C

**Then:**
- Owner resolves in project A
- Child resolves in project C
- Trust confirmation is enforced for each remote project
- The operation succeeds

**Ambiguous child-only routing fails before mutation** (`rq-epicOwnerRouting01.5`)

**Given:**
- A caller provides only target_path for a child project
- The Epic owner is not in the current project

**When:** The membership tool resolves the owner Epic

**Then:**
- The tool fails before durable mutation
- The error code is OWNER_ROUTING_AMBIGUOUS or OWNER_ROUTING_REQUIRED
- No remote Epic is mutated

**Partial owner-only routing fails when child is not locatable** (`rq-epicOwnerRouting01.6`)

**Given:**
- A caller provides only epic_owner_target_path
- The child change does not exist in the owner project

**When:** The membership tool resolves the child change

**Then:**
- The tool fails before durable mutation
- The error identifies the missing child route
- No Epic is mutated with an orphan entry

---

### V1 Does Not Clone Project-Management Workflows

**ID:** `rq-epicNoJiraClone01` | **Priority:** **[MUST]**

Advance Epics v1 MUST NOT add Jira-like assignments, estimates, boards, sprints, ownership workflows, or clone GitHub Projects. Epic ordering, next-work recommendation, and compact context are the only planning primitives added in v1.

**Tags:** `epics`, `v1`, `avoidance`, `scope`

#### Scenarios

**Epic schema rejects project-management fields** (`rq-epicNoJiraClone01.1`)

**Given:**
- A caller attempts to add assignee, estimate, sprint, or board fields to an Epic record

**When:** The record is validated

**Then:**
- Those fields are not recognized as required Epic structure

---

### Missing Epic and Stale Links Produce Deterministic Errors or Recoverable Warnings

**ID:** `rq-epicErrors01` | **Priority:** **[SHOULD]**

Operations referencing a missing Epic, a stale child change link, a duplicate promotion, or a concurrent reorder/promotion MUST produce deterministic errors or recoverable warnings. Failure modes MUST be typed so callers can distinguish not-found, conflict, and stale-state conditions and retry or reconcile safely.

**Tags:** `epics`, `errors`, `recovery`, `concurrency`

#### Scenarios

**Missing Epic returns not-found error** (`rq-epicErrors01.1`)

**Given:**
- A caller requests an Epic that does not exist

**When:** The lookup is performed

**Then:**
- A typed not-found error is returned

**Concurrent edit yields stale-version warning or conflict** (`rq-epicErrors01.2`)

**Given:**
- Two callers mutate the same Epic concurrently

**When:** The second mutation is applied against a stale version

**Then:**
- A typed conflict or stale-state response is returned

---

### Epic List CLI Is Read-Only, Worker-Free, and Fail-Closed

**ID:** `rq-epicCliList01` | **Priority:** **[MUST]**

The `adv epic list --json` CLI command MUST return live disk-backed Epic entries for the current project as stable JSON. Each Epic entry MUST include `id` and a present `startTime` field populated from the disk projection lookup change projection row's `startTime` as an ISO-8601 UTC string when valid; if a row unexpectedly lacks a valid timestamp, the entry MUST remain present with `startTime: null`. The command MUST use disk projection lookup enumeration of `epicChange projection` executions and project-scoped change projection ID prefix filtering, MUST NOT read ADV external state files, MUST NOT query or hydrate each Epic change projection, MUST NOT require a worker polling the project mutation path, and MUST fail closed with structured JSON error metadata instead of silently returning stale disk data. The Epic CLI namespace MUST remain read-only and MUST NOT expose mutation subcommands. The `startTime` field represents the disk change projection start timestamp and MUST NOT be labeled as child-change activity or mutable recency.

**Tags:** `epics`, `cli`, `visibility`, `read-only`

#### Scenarios

**Epic list returns live JSON entries with timestamps** (`rq-epicCliList01.1`)

**Given:**
- A git-backed project has Epic change projections visible to disk

**When:** `adv epic list --json` runs from the project

**Then:**
- The command exits 0
- The JSON payload includes `source: "disk"`, `live: true`, `stale: false`, `generated_at`, `project_id`, and `epics`
- Each Epic entry is an object containing `id` and a present `startTime` field
- A valid disk projection lookup row timestamp is emitted as an ISO-8601 UTC string
- An unexpectedly invalid or missing row timestamp is emitted as `startTime: null` without dropping the Epic row

**Epic list filters by current project prefix** (`rq-epicCliList01.2`)

**Given:**
- disk projection lookup returns Epic change projection IDs for multiple ADV projects

**When:** The Epic list CLI builds its payload

**Then:**
- Only change projection IDs under `adv/epic/{projectId}/` appear in `epics`
- Change projection IDs outside the current project prefix are excluded
- Empty Epic ID suffixes are ignored

**Epic list fails closed on unavailable live state** (`rq-epicCliList01.3`)

**Given:**
- disk connection or projection lookup listing fails, or the command is run outside a git project

**When:** `adv epic list --json` handles the failure

**Then:**
- The command exits non-zero
- The JSON payload includes `source: "disk"`, `live: false`, `stale: false`, `epics: []`, `error`, and `remediation`
- No disk-projected Epic rows are returned as a fallback

**Epic CLI namespace remains read-only** (`rq-epicCliList01.4`)

**Given:**
- A caller invokes the `adv epic` CLI namespace

**When:** The CLI dispatches the nested command

**Then:**
- Only the read-only `list` operation is accepted
- Mutation verbs such as `create`, `update`, `delete`, and `archive` are not dispatched
- The list path does not query per-Epic change projection state

---

### Completed Epics Retire Through an Audited Typed Lifecycle Path

**ID:** `rq-epicRetirement01` | **Priority:** **[MUST]**

Completed Epics MUST be retired through a typed `adv_epic_retire` lifecycle path. Retirement MUST require `expected_version`, non-blank audit evidence, and a retiring actor, and MUST support `dryRun` without mutation. The retirement preflight MUST prove the Epic progress status is completed and every entry is terminal before any durable mutation. If active or future work remains, retirement MUST fail before mutation and MUST identify the blocking entries.

**Tags:** `epics`, `retirement`, `lifecycle`, `audit`

#### Scenarios

**Completed Epic retires with audit evidence and expected version** (`rq-epicRetirement01.1`)

**Given:**
- An Epic has completed progress
- Every Epic entry is terminal

**When:** A caller invokes adv_epic_retire with expected_version and audit evidence

**Then:**
- The version guard is checked before mutation
- The audit evidence and retiring actor are preserved
- The Epic is retired through the typed lifecycle path

**Active or future entries block retirement before mutation** (`rq-epicRetirement01.2`)

**Given:**
- An Epic has one or more active or future entries

**When:** A caller attempts to retire the Epic

**Then:**
- The operation fails before any durable mutation
- The response names the blocking entries
- No retirement projection or archive signal is written

**Dry-run reports eligibility without mutation** (`rq-epicRetirement01.3`)

**Given:**
- A caller requests retirement with dryRun enabled

**When:** The preflight completes

**Then:**
- The response reports current version, progress status, eligibility, blockers, and projected retired summary
- The Epic projection and retired summary remain unchanged

---

### Active Epic Lists Exclude Retired Epics Structurally

**ID:** `rq-epicRetiredListing01` | **Priority:** **[MUST]**

Default Epic listing surfaces MUST represent active Epics only and MUST exclude retired, merged, and completed-candidate Epics structurally, not by consumer-side inference. The `adv_epic_list` default and `adv epic list --json` MUST enumerate current disk-backed Epic projections scoped to the project and active status. Completed-but-unretired Epics MUST remain available through explicit operator candidate/dry-run surfaces, not default next-work lists. Missing or malformed status in a reachable legacy projection is machine-resolvable state: direct Epic access MUST normalize and verify the current typed status without requiring a dedicated repair mode. Conflicting or unreadable state MUST fail closed through the doctor/operator boundary. Default listing remains read-only and MUST NOT perform per-Epic mutation fan-out.

**Tags:** `epics`, `listing`, `cli`, `visibility`, `retirement`

#### Scenarios

**Default MCP list excludes retired Epics** (`rq-epicRetiredListing01.1`)

**Given:**
- The disk projection contains active and retired Epic entries

**When:** adv_epic_list runs with default arguments

**Then:**
- Only active Epic entries are listed
- Retired Epic entries are excluded by typed projection status

**CLI list remains active-only JSON** (`rq-epicRetiredListing01.2`)

**Given:**
- A caller runs adv epic list --json

**When:** The CLI reads the Epic projection

**Then:**
- The read is scoped to the current project and active typed status
- The payload is disk-backed and active-only by default

**Existing completed Epics report as dry-run candidates** (`rq-epicRetiredListing01.3`)

**Given:**
- One or more completed-but-unretired Epics exist

**When:** An operator requests the completed-Epic retirement dry-run report

**Then:**
- The report lists eligible candidates and blocked Epics with blocker details
- The dry-run does not retire or archive any Epic

**Compatible legacy index state converges directly** (`rq-epicRetiredListing01.4`)

**Given:**
- A reachable running Epic lacks compatible AdvEpicStatus indexing

**When:** ADV initialization or direct Epic access observes the missing compatible attribute

**Then:**
- The workflow upserts and verifies its current typed AdvEpicStatus
- No dedicated repair mode or operator evidence is required
- Wrong-type or conflicting state routes to typed doctor/operator handling

**Default list remains read-only** (`rq-epicRetiredListing01.5`)

**Given:**
- Legacy unindexed Epics may exist

**When:** The default active-only listing runs

**Then:**
- It does not perform per-Epic mutation fan-out
- It returns typed incomplete evidence when current index truth cannot be established

---

### Retired Epic History Remains Typed and Queryable By ID

**ID:** `rq-epicRetiredHistory01` | **Priority:** **[MUST]**

Retirement MUST preserve typed history access to retired Epics. The retirement path MUST persist a durable retired projection before the archive/completion signal is fired. `adv_epic_show` MUST first try the live workflow and then fall back to the retired projection when the workflow is completed or unavailable. The retained view MUST include title, narrative, entries, terminal summaries, source version, and retirement metadata, and MUST return deterministic typed errors when neither live state nor retired projection can be read.

**Tags:** `epics`, `retirement`, `history`, `projection`

#### Scenarios

**Retirement writes projection before workflow completion** (`rq-epicRetiredHistory01.1`)

**Given:**
- A completed Epic is eligible for retirement

**When:** The retirement operation executes

**Then:**
- A retired projection is persisted before the archive signal completes the workflow
- The projection records the source workflow ID, source version, retired_at, retired_by, and evidence

**Show reads retired Epic history by ID** (`rq-epicRetiredHistory01.2`)

**Given:**
- An Epic has been retired and its workflow is no longer queryable

**When:** A caller invokes adv_epic_show for that Epic ID

**Then:**
- The response is loaded from the retired projection
- The response includes title, narrative, entries, terminal summaries, and retirement metadata

**Missing live and retired state fails deterministically** (`rq-epicRetiredHistory01.3`)

**Given:**
- No live Epic workflow or retired projection exists for an Epic ID

**When:** A caller invokes adv_epic_show

**Then:**
- A typed not-found error is returned
- No ADV state files are read directly by agents

---

### Epic Projection Lookup Respects Bounded Field Constraints

**ID:** `rq-epicTemporalConstraints01` | **Priority:** **[MUST]**

The child-change projection lookup used for Epic lookup MUST use one bounded scalar Epic identifier derived from the `epic_membership` projection. It MUST NOT expand into an unbounded collection or infer Epic membership from titles or consumer-side heuristics.

**Tags:** `epics`, `disk`, `visibility`, `constraints`

#### Scenarios

**Epic ID is stored as one bounded scalar** (`rq-epicTemporalConstraints01.1`)

**Given:**
- A child change has epic_membership.epic_id

**When:** projection fields are built

**Then:**
- AdvEpicId is set as one bounded scalar projection field
- No unbounded collection field is used for Epic membership

---

### Direct Epic Link Projects Terminal Child State

**ID:** `rq-epicTerminalChildProjection01` | **Priority:** **[MUST]**

adv_epic_link_change MUST project the terminal state of an archived or closed child change onto the linked Epic entry in the same operation. When the child change is already terminal, the Epic entry MUST receive a `terminal_summary` with `status` and `completed_at`, the entry's `membership_status` MUST reflect `terminal`, and later `adv_epic_show` MUST display the entry in compact history without `repair-needed` or `projection-missing` status. Changes without Epic membership or non-terminal changes MUST follow normal link semantics.

**Tags:** `epics`, `link`, `terminal`, `projection`

#### Scenarios

**Archived child link projects terminal summary** (`rq-epicTerminalChildProjection01.1`)

**Given:**
- An ADV change has status archived
- The change is not yet linked to an Epic

**When:** adv_epic_link_change links the change to an Epic

**Then:**
- The Epic entry receives a terminal_summary with status archived and a completed_at timestamp
- The entry's membership_status is terminal
- The response indicates terminal_summary_projected: true

**Closed child link projects terminal summary** (`rq-epicTerminalChildProjection01.2`)

**Given:**
- An ADV change has status closed

**When:** adv_epic_link_change links the change to an Epic

**Then:**
- The Epic entry receives a terminal_summary with status closed and a completed_at timestamp
- The entry's membership_status is terminal

**Later Epic show does not flag repaired terminal entry** (`rq-epicTerminalChildProjection01.3`)

**Given:**
- A terminal child change has been linked to an Epic

**When:** adv_epic_show renders the Epic

**Then:**
- The entry appears in compact terminal history
- The entry does not show projection_missing, projection_stale, or repair-needed markers

---

### Epic Briefing Context Is Compact and Optional

**ID:** `rq-epicBriefingContext01` | **Priority:** **[MUST]**

When an ADV change has Epic membership, briefing packets MAY include a compact Epic context section. Epic membership MUST remain optional and advisory; packet rendering MUST NOT block on Epic order alone or require Epic membership for non-Epic changes. The Epic context section MUST include the Epic ID, title, and a compact membership status summary, and MUST NOT include the full Epic entry list or replace the authoritative Epic read surfaces.

**Tags:** `epics`, `briefing_packets`, `optional`, `compact`

#### Scenarios

**Non-Epic change renders a valid briefing packet** (`rq-epicBriefingContext01.1`)

**Given:**
- An ADV change has no Epic membership

**When:** A briefing packet is rendered

**Then:**
- The packet is valid
- No Epic context section is required
- Rendering does not fail due to missing Epic

**Epic change includes compact membership context** (`rq-epicBriefingContext01.2`)

**Given:**
- An ADV change is linked to an Epic

**When:** A briefing packet is rendered

**Then:**
- The packet MAY include a compact Epic context section
- The section includes Epic ID, title, and membership status
- The section does not dump the full Epic entry list

---

### Epic Operational-Work Planning Is Explicit, Typed, and Linked

**ID:** `rq-epicOpsPlanning01` | **Priority:** **[MUST]**

Epic creation and planning MUST include an explicit operational-work assessment that considers first deployment, migration/backfill, deployment configuration, monitoring, cleanup, and teardown. The assessment is contextual: an Epic with no operational need MUST record no follow-up, and operational need MUST NOT be inferred from Epic metadata alone. When required operational work is identified, planning MUST direct it to a typed, linked ops follow-up associated with the relevant delivery change through the existing `adv_followup_promote` / `ops_followup_links` path (`rq-opsFollowTrace01`); free-text agenda items, generic shell entries, or undocumented assumptions MUST NOT be the authoritative record for required operational work. Release-safety-critical operational work MUST use the `blocks` relationship so the existing release gate prevents release until the linked child work completes (`rq-opsFollowRelease01`, `rq-opsRunReleaseReadiness01`); release-first work such as post-release monitoring or cleanup MUST use an existing non-blocking relationship only with the surviving-obligation handoff semantics already defined for linked ops follow-ups (`rq-opsFollowRelease01`). This requirement adds planning traceability only: Epic order remains advisory and MUST NOT gate release, promotion, or tasks by itself; ADV records and governs operational state and MUST NOT perform deployment execution as an Epic gate; and this requirement MUST NOT introduce a new data model, validator, relationship enum, or gate-readiness rule beyond the ops-follow-up semantics it cites.

**Tags:** `epics`, `ops-follow-up`, `planning`, `release`, `traceability`

#### Scenarios

**First-deployment Epic directs a blocking typed ops follow-up** (`rq-epicOpsPlanning01.1`)

**Given:**
- An Epic introduces first-time infrastructure deployment or deployment configuration that must complete before release is safe

**When:** Epic planning performs the operational-work assessment

**Then:**
- Planning directs creation of a typed linked ops follow-up tied to the relevant delivery change via `adv_followup_promote`
- The follow-up uses the `blocks` relationship when release safety requires completion
- Authoritative provenance is recorded per `rq-opsFollowTrace01`, not as a generic shell entry or free-text agenda item

**Release-first monitoring or cleanup stays non-blocking with handoff** (`rq-epicOpsPlanning01.2`)

**Given:**
- An Epic identifies post-release monitoring or cleanup that does not gate release safety

**When:** Planning records the operational work as a linked ops follow-up

**Then:**
- The follow-up uses an existing non-blocking release-first relationship
- The existing surviving-obligation handoff semantics from `rq-opsFollowRelease01` apply
- Release is not blocked by the non-blocking follow-up once its handoff is recorded

**No operational need records no follow-up** (`rq-epicOpsPlanning01.3`)

**Given:**
- An Epic has no first deployment, migration, backfill, deployment configuration, monitoring, cleanup, or teardown need

**When:** Epic planning performs the operational-work assessment

**Then:**
- No ops follow-up is mandated or created
- Operational need is not inferred from Epic metadata alone
- The absence of operational work is a valid assessed outcome

**Operational planning does not execute, re-gate, or remodel** (`rq-epicOpsPlanning01.4`)

**Given:**
- An Epic has linked operational follow-ups and advisory ordering

**When:** Epic planning guidance is applied

**Then:**
- Epic order remains advisory and does not gate release, promotion, or tasks by itself
- ADV records and governs operational state without performing deployment execution as an Epic gate
- No new data model, validator, relationship enum, or gate-readiness rule is introduced beyond the cited ops-follow-up semantics

---

### Epic Membership Converges Without Repair Routing

**ID:** `rq-epicMembershipConvergence01` | **Priority:** **[MUST]**

Epic change entries are authoritative for membership and child epic_membership is a derived projection. Link, promotion, move, unlink, terminal projection, and Epic show MUST directly converge missing or stale matching child projections within bounded execution. A conflicting child projection MUST NOT be overwritten and MUST return a typed conflict. Temporary target unavailability MUST preserve pending intent on the existing Epic entry and retry on the next relevant access without requiring a dedicated membership-repair tool.

**Tags:** `epics`, `membership`, `projection`, `self-healing`, `idempotency`

#### Scenarios

**Missing child projection converges directly** (`rq-epicMembershipConvergence01.1`)

**Given:**
- An authoritative Epic entry references a child change
- The matching child epic_membership projection is absent

**When:** A supported link, promotion, or Epic show operation observes the state

**Then:**
- The child projection is written and verified against the Epic entry
- The operation returns healthy membership state
- No dedicated membership-repair tool is required

**Matching child clears stale owner status** (`rq-epicMembershipConvergence01.2`)

**Given:**
- The child projection exactly matches the authoritative Epic entry
- The Epic entry still reports pending or stale projection state

**When:** Epic membership is read or mutated

**Then:**
- The Epic entry is converged to applied or terminal state
- The response does not report projection_missing or recommend repair

**Conflicting child projection is preserved** (`rq-epicMembershipConvergence01.3`)

**Given:**
- A child projection points to a different Epic or entry

**When:** Automatic convergence evaluates the projection

**Then:**
- No child projection is overwritten
- A typed conflict identifies both authorities
- Operator intent is required before retargeting or removal

**Unavailable target retains retryable intent** (`rq-epicMembershipConvergence01.4`)

**Given:**
- An Epic entry contains desired child projection state
- The target project cannot be reached

**When:** Direct projection fails due to target unavailability

**Then:**
- Pending intent remains on the existing Epic entry
- Owner truth remains readable
- The next relevant access retries convergence without a background daemon

---
