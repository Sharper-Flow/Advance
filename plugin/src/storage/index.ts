/**
 * Storage Module Exports
 */

export {
  createStore,
  type Store,
  type ReadStore,
  type CommandStore,
  type ReadSnapshot,
  ReadSnapshotSchema,
  type SearchResult,
} from "./store";
export {
  loadProjectConfig,
  saveProjectConfig,
  loadSpec,
  saveSpec,
  loadAllSpecs,
  loadChange,
  saveChange,
  loadAllChanges,
  createChangeScaffold,
  getProjectPaths,
  resolveChangeId,
  type ProjectPaths,
} from "./json";
export {
  commitChangeProjection,
  PROJECTION_COMMIT_MAX_AUDIT_ENTRIES,
  type ProjectionCommitAuthority,
  type ProjectionCommitOutcome,
  type ProjectionCommitVerifyContext,
  type ProjectionCommitVerifyResult,
  type CommitChangeProjectionOptions,
} from "./change-projection-transaction";
export {
  ResidueClassSchema,
  StoreResidueRecordSchema,
  StoreResidueCountersSchema,
  StoreResidueScanSchema,
  runStoreResidueScan,
  type ResidueClass,
  type StoreResidueRecord,
  type StoreResidueCounters,
  type StoreResidueScan,
  type StoreResidueScanOptions,
} from "./store-residue-scan";
export {
  ReconcileActionSchema,
  ReconcilePlanRecordSchema,
  ReconcilePlanSchema,
  ReconcileReceiptSchema,
  ReconcileRunReportSchema,
  buildReconcilePlan,
  createReconcilePlan,
  canonicalizeReconcilePlan,
  type ReconcileAction,
  type ReconcilePlanRecord,
  type ReconcilePlan,
  type ReconcileReceipt,
  type ReconcileRunReport,
} from "./reconcile-plan";
export {
  RECONCILE_AUDIT_FILENAME,
  ReconcileAuditEventSchema,
  appendReconcileAudit,
  getReconcileAuditPath,
  type ReconcileAuditEvent,
  type ReconcileAuditInput,
  type ReconcileAuditResult,
} from "./reconcile-audit";
export {
  deriveRunStatus,
  rebuildProgressFromReceipts,
  readReconcileReceipts,
  writeReconcileProgress,
  writeReconcileReceipt,
  writeReconcileRunReport,
  type DerivedRunStatus,
  type ReconcileProgress,
} from "./reconcile-report";
export {
  ACTION_EXECUTORS,
  RECONCILE_BATCH_SIZE,
  ReconcilePartialFailureError,
  ReconcileRefusalError,
  executeRecordAction,
  probeWorkerLock,
  notImplementedExecutor,
  runReconcileApply,
  reconcileExitCode,
  saveEpicOptimistic,
  type ActionContext,
  type ActionExecutor,
  type ActionOutcome,
  type ReconcileApplyDeps,
  type ReconcileErrorClass,
  type RunReconcileApplyOptions,
} from "./reconcile-apply";
export {
  normalizeEnumMappingExecutor,
  quarantineRecordExecutor,
  type SchemaDriftActionOutcome,
} from "./reconcile-action-schema-drift";
export {
  rebuildSummaryShardExecutor,
  rebuildFromChangesExecutor,
  rebuildSummaryBatchExecutor,
  rebuildSummaryIndexBatch,
  type SummaryActionOutcome,
  type SummaryRebuildEvidence,
  type SummaryActionName,
} from "./reconcile-action-summary";
export {
  advanceLegacyToCanonicalExecutor,
  reportOnlyExecutor,
} from "./reconcile-action-legacy-envelope";
export {
  migrateRecordExecutor,
  migrateArtifactMetadataExecutor,
  classifyTerminalNoopExecutor,
  setMarkerAutoExecutor,
  setMarkerLegacyExecutor,
  normalizeWorktreeMarkerExecutor,
} from "./reconcile-action-artifact-metadata";
export {
  EpicReconstructionProvenanceSchema,
  buildReconstructedEpic,
  verifyEpicReconstructionConvergence,
  reconstructFromChildFragmentsExecutor,
  formallyLostReportExecutor,
  clearDanglingMembershipExecutor,
} from "./reconcile-action-epic-recovery";
export {
  RECONCILE_NOISE_ALLOWLIST,
  normalizeAndRestoreExecutor,
  remainQuarantinedReportedExecutor,
  quarantineToTrashExecutor,
} from "./reconcile-action-quarantine";
export {
  ReconcileProofWhitelistEntrySchema,
  ReconcileCompletionProofSchema,
  runUnboundedProjectionDivergenceScan,
  computeReconcileCompletionProof,
  runReconcileCompletionProof,
} from "./reconcile-proof";
