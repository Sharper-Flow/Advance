# Agreement

## Objectives
1. Restore the existing typed ops-follow-up promotion path to the canonical runtime surface.
2. Keep the ops run evidence model and child-link authority unchanged.
3. Prevent another registry subtraction from silently removing the tool.

## Success Criteria
- **SC1:** `adv_followup_promote` appears in the canonical registry, catalog, and orchestrator invoke surface.
- **SC2:** A valid dry-run invocation reaches the existing handler and returns a promotion preview instead of `TOOL_NOT_FOUND`.

## Acceptance Criteria
- **AC1:** The public tool inventory contains `adv_followup_promote` exactly once.
- **AC2:** `TOOL_ROLE_POLICY` classifies `adv_followup_promote` as orchestrator-owned.
- **AC3:** Registry parity and role-policy tests fail if the follow-up group is removed.
- **AC4:** A valid manual-source dry run returns `success: true`, `dryRun: true`, and a bounded `would_create` projection.
- **AC5:** No retired Epic or backlog tool returns to the public registry.

## Constraints
- Keep the existing follow-up handler and profile model authoritative.
- Preserve target-path trust checks and idempotent promotion behavior.
- Keep the fix scoped to registry wiring, policy, and regression tests.

## Avoidances
- No direct state-file mutation.
- No self-referential ops profile.
- No duplicate promotion mechanism.
- No durable spec-law change.