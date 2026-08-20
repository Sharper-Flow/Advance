import type {
  MutationIntent,
  MutationOutcome,
} from "../tools/change-mutation-coordinator";
import type { Epic } from "../types";
import type {
  ReconcileAuditEvent,
  ReconcileAuditResult,
} from "./reconcile-audit";
import type { ReconcileAction, ReconcilePlanRecord } from "./reconcile-plan";
import type { ProjectPaths } from "./json";
import type { Store } from "./store-types";

export type ActionOutcome = {
  status: "mutated" | "skipped" | "failed";
  error_class?: string;
  residual?: string;
  before_bytes?: Uint8Array | string;
  after_bytes?: Uint8Array | string;
};

export interface EpicSaveResult {
  status: "saved" | "skipped";
  reason?: string;
  epic?: Epic;
}

export interface ActionContext {
  storePaths: ProjectPaths;
  localProjectId?: string | null;
  locksHeld: readonly string[];
  runId: string;
  writeBeforeState: (
    recordId: string,
    bytes: Uint8Array | string,
  ) => Promise<string>;
  auditWriter: (
    event: ReconcileAuditEvent,
  ) => Promise<ReconcileAuditResult | void>;
  coordinateChangeMutation: <T>(
    intent: MutationIntent,
  ) => Promise<MutationOutcome<T>>;
  saveEpicOptimistic: (
    epicId: string,
    nextEpic: Epic,
    expectedVersion?: number,
  ) => Promise<EpicSaveResult>;
  /** Locked Epic entry writer used by entry-recovery actions. */
  linkEpicChange?: Store["epics"]["linkChange"];
  /** Internal registry override used by tests and future executor modules. */
  executorRegistry?: Partial<Record<ReconcileAction["action"], ActionExecutor>>;
}

export type ActionExecutor = (
  record: ReconcilePlanRecord,
  action: ReconcileAction,
  ctx: ActionContext,
) => Promise<ActionOutcome>;
