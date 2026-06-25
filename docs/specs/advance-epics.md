# Advance Epics

> **Version:** 1.0.0
> **Updated:** 2026-06-24

## Purpose

Capability: Epic entity and workflow contracts for ADV initiative planning. Epics are durable containers that group related ADV changes and lightweight shell entries, replacing project-level ROADMAP.md as the primary ADV planning surface for initiative-level work while keeping Epic membership optional and order advisory.

## Requirements

### Epic Record Is a Typed, Structural Initiative Container

**ID:** `rq-epicEntity01` | **Priority:** **[MUST]**

An Epic MUST be represented by a typed record containing a stable ID, title, narrative context, ordered roadmap entries, a compact status/progress summary, and creation/update timestamps. Correctness-critical Epic state MUST be structural and typed, not prose-only roadmap text. The Epic record MUST NOT depend on project-level ROADMAP.md for its existence or validation.

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

An Epic's ordered entries MUST support exactly two kinds: `change` entries that reference one ADV change ID, and `shell` entries that represent future work. Every shell entry MUST have a title and a rough success/AC hint. Shell entries MUST NOT be required to complete full ADV proposal/discovery before they can exist or be promoted. A change entry MAY carry promotion provenance when it originated from a shell.

**Tags:** `epics`, `entries`, `shell`, `change`

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
- Validation succeeds when change_id is present
- Validation fails when change_id is missing

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

When a change belongs to an Epic, change show/status/resume surfaces MUST surface compact Epic membership context including Epic ID, entry ID, order, and title. The context MUST be additive and MUST NOT replace or obscure the change's own gates, tasks, or artifacts. Changes without Epic membership MUST render identically to the pre-Epic flow.

**Tags:** `epics`, `change`, `context`, `membership`

#### Scenarios

**Epic child change shows compact context** (`rq-epicChangeContext01.1`)

**Given:**
- A change has an epic_membership projection

**When:** The change is shown or resumed

**Then:**
- Epic ID, entry ID, order, and title are surfaced
- The change's own status and tasks remain primary

**Non-Epic changes remain unchanged** (`rq-epicChangeContext01.2`)

**Given:**
- A change has no epic_membership

**When:** The change is shown or resumed

**Then:**
- No Epic context is rendered
- Existing fields and behavior are unchanged

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

In v1, each ADV change MAY belong to zero or one Epic. The change schema MUST represent epic_membership as a single optional object, not an array. Cross-repo Epic membership is out of scope for v1 unless a later design explicitly proves it necessary and safe.

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

### Epic Visibility Index Respects Temporal Search-Attribute Constraints

**ID:** `rq-epicTemporalConstraints01` | **Priority:** **[MUST]**

The child-change Visibility index for Epic lookup MUST use a single-value `Keyword` search attribute, following the pattern of `AdvBacklogIssueNumber`, and MUST NOT exceed the existing custom `KeywordList` cap. Epic ID on child changes MUST be derived from the `epic_membership` projection.

**Tags:** `epics`, `temporal`, `visibility`, `constraints`

#### Scenarios

**Epic ID is indexed as single Keyword** (`rq-epicTemporalConstraints01.1`)

**Given:**
- A child change has epic_membership.epic_id

**When:** Search attributes are built

**Then:**
- AdvEpicId is set as a single-value Keyword
- No KeywordList attribute is used for Epic membership

---
