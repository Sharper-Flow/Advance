## Confirmed Problem

Archive-bundle mutation now succeeds after active state removal, but the general archive path still performs its next durable proof against the missing active projection. Legacy bundles with open or absent `lifecycleState` therefore finish release state but report command failure.

## Root Cause Analysis

Bundle dominance synthesizes terminal status without guaranteeing terminal lifecycle state. That bypasses the dedicated no-op reconciliation branch. The shared post-finalization proof call does not follow `releaseResult.recoveryMutation` back to `archiveResult.archivePath`, causing mutation-authority/proof-authority split.

## Success Signal

Given a legacy archive bundle with release pending, no active projection, and lifecycle state open or absent, retry returns success; bundle readback reports release and Phase 9 done; exact replay remains a no-op; no active projection is recreated.