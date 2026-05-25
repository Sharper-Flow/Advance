# Archive: Extend completed workflow recovery

**Change ID:** extendCompletedWorkflow
**Archived:** 2026-05-22T04:17:04.331Z
**Created:** 2026-05-22T03:54:40.551Z

## Tasks Completed

- ✅ Extend adv_change_archive recovery branch to detect completed-workflow errors (isWorkflowCompletedError) and route to saveRecoveredChangeStatus; test the new path.
  > Centralized workflow-completed error detection in recovery-classification, reused it from Temporal change ops, broadened archive recoveryEvidence validation to accept completed-workflow evidence, and extended adv_change_archive status-transition recovery to disk-project archived status when save fails with WorkflowNotFoundError/workflow already completed. Added regression tests for completed recovery, no implicit recovery without recoveryMode, and preserved poisoned-description recovery.

## Specs Modified


## Wisdom Accumulated

- **[pattern]** When a recovery path handles both poisoned and terminal/completed workflows, centralize error/evidence classification in `temporal/recovery-classification.ts` and keep tool recovery gated by explicit recoveryMode + precise evidence. Do not depend on poisoned describe probes for completed workflows; classify the thrown save/signal error directly.
