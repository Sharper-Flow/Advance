# Per-Epic Workflow for Advance Initiative Planning

We chose a separate Temporal workflow per Epic instead of a project-level shared workflow or a singleton Epic orchestrator. Each Epic is a durable initiative container; child changes keep an optional `epic_membership` projection and are indexed via the single-value `AdvEpicId` Visibility keyword. This avoids resurrecting the retired project-level shared workflow pattern, keeps Epic lookup bounded to project + Epic ID, and lets non-Epic changes continue unchanged. Cross-repo Epic membership is out of scope for v1.

**Status:** accepted

**Considered options:**

- Project-level shared workflow — rejected because it revives a retired pattern and would serialize all Epic activity through one workflow.
- Singleton Epic orchestrator per project — rejected because it centralizes state and complicates concurrency/replay for a v1 feature.
- Per-Epic workflow with child-side membership projection — selected because it mirrors existing backlog claim patterns, respects the KeywordList cap, and preserves optional membership.

**Consequences:**

- Epic state is scoped to its own workflow; child changes are independently recoverable.
- `adv_epic_show` and child `epic_membership` projections are the primary Epic context surfaces.
- A future cross-repo Epic design must prove necessity and safety before extending this model.
