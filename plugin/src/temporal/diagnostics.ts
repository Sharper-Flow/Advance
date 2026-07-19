import { collectErrorText } from "./error-text";
import {
  extractGrpcStatus,
  isReconnectableError,
  TemporalQueryTimeoutError,
} from "./retry-wrapper";

export type TemporalWorkflowFailureClass =
  | "reachable"
  | "no_poller"
  | "query_failed_or_not_registered"
  | "query_rejected"
  | "not_found"
  | "deadline"
  | "resource_exhaustion"
  | "permission"
  | "poisoned_history"
  | "unknown";

export type TemporalServiceFailureClass =
  | "healthy"
  | "stsl_uninitialized"
  | "server_unreachable"
  | "server_not_serviceable"
  | "shared_channel_incident";

export interface TemporalServiceContext {
  stslInitialized: boolean;
  serverReachable: boolean;
  serverServiceable: boolean;
}

export interface TemporalGrpcCause {
  code?: number;
  statusName?: string;
  details?: string;
}

export interface TemporalWorkflowDiagnostic {
  reachable: boolean;
  class: TemporalWorkflowFailureClass;
  cause?: TemporalGrpcCause;
  evidence?: string;
}

export interface TemporalServiceDiagnostic {
  stslInitialized: boolean;
  serverReachable: boolean;
  serverServiceable: boolean;
  sharedChannelIncident: boolean;
  reconnectEligible: boolean;
  class: TemporalServiceFailureClass;
  evidence?: string;
}

export interface TemporalFailureDiagnostics {
  service: TemporalServiceDiagnostic;
  workflow: TemporalWorkflowDiagnostic;
}

const MAX_CAUSE_DEPTH = 16;

const NO_POLLER_RE =
  /no poller|no workers are currently polling|workflow task is not scheduled yet/i;

const QUERY_NOT_REGISTERED_RE =
  /not registered|QueryNotRegistered|QueryHandlerNotRegistered/i;

const QUERY_REJECTED_RE = /query rejected|QueryRejected/i;

const POISONED_HISTORY_RE =
  /TMPRL1100|Nondeterminism error|No command scheduled for event/i;

const COMPLETED_OR_NOT_FOUND_RE =
  /workflow execution already completed|already completed|workflow is not running|cannot signal a completed|not found|NOT_FOUND|WorkflowNotFoundError/i;

const DEADLINE_RE = /deadline exceeded|timeout/i;

const RESOURCE_EXHAUSTED_RE = /resource exhausted|RESOURCE_EXHAUSTED/i;

const PERMISSION_RE = /permission denied|PERMISSION_DENIED/i;

const GENERIC_QUERY_FAILURE_RE = /Failed to query Workflow|query Workflow/i;

function isGrpcServiceErrorShape(
  v: unknown,
): v is { code: number; details: string; metadata: object } {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.code === "number" &&
    typeof o.details === "string" &&
    typeof o.metadata === "object" &&
    o.metadata !== null
  );
}

function extractGrpcServiceError(
  error: unknown,
): { code: number; details: string; metadata: object } | undefined {
  const seen = new Set<unknown>();
  let current: unknown = error;
  let depth = 0;
  while (
    current &&
    typeof current === "object" &&
    !seen.has(current) &&
    depth < MAX_CAUSE_DEPTH
  ) {
    seen.add(current);
    if (isGrpcServiceErrorShape(current)) return current;
    current = (current as { cause?: unknown }).cause;
    depth++;
  }
  return undefined;
}

function grpcStatusName(code: number): string | undefined {
  const names: Record<number, string> = {
    0: "OK",
    1: "CANCELLED",
    2: "UNKNOWN",
    3: "INVALID_ARGUMENT",
    4: "DEADLINE_EXCEEDED",
    5: "NOT_FOUND",
    6: "ALREADY_EXISTS",
    7: "PERMISSION_DENIED",
    8: "RESOURCE_EXHAUSTED",
    9: "FAILED_PRECONDITION",
    10: "ABORTED",
    11: "OUT_OF_RANGE",
    12: "UNIMPLEMENTED",
    13: "INTERNAL",
    14: "UNAVAILABLE",
    15: "DATA_LOSS",
    16: "UNAUTHENTICATED",
  };
  return names[code];
}

export function extractTemporalGrpcCause(
  error: unknown,
): TemporalGrpcCause | undefined {
  const cause = extractGrpcServiceError(error);
  if (!cause) return undefined;
  return {
    code: cause.code,
    statusName: grpcStatusName(cause.code),
    details: cause.details,
  };
}

export function classifyTemporalWorkflowFailure(
  error: unknown,
): TemporalWorkflowDiagnostic {
  if (error === null || error === undefined) {
    return { reachable: true, class: "reachable" };
  }

  const cause = extractTemporalGrpcCause(error);
  const code = cause?.code ?? extractGrpcStatus(error);
  const text = collectErrorText(error);

  if (
    error instanceof TemporalQueryTimeoutError ||
    (error instanceof Error && error.name === "TemporalQueryTimeout")
  ) {
    return { reachable: false, class: "deadline", cause, evidence: text };
  }

  if (code === 4) {
    return { reachable: false, class: "deadline", cause, evidence: text };
  }
  if (code === 5) {
    return { reachable: false, class: "not_found", cause, evidence: text };
  }
  if (code === 7) {
    return { reachable: false, class: "permission", cause, evidence: text };
  }
  if (code === 8) {
    return {
      reachable: false,
      class: "resource_exhaustion",
      cause,
      evidence: text,
    };
  }

  if (POISONED_HISTORY_RE.test(text)) {
    return {
      reachable: false,
      class: "poisoned_history",
      cause,
      evidence: text,
    };
  }

  if (NO_POLLER_RE.test(text)) {
    return { reachable: false, class: "no_poller", cause, evidence: text };
  }

  if (QUERY_NOT_REGISTERED_RE.test(text)) {
    return {
      reachable: false,
      class: "query_failed_or_not_registered",
      cause,
      evidence: text,
    };
  }

  if (QUERY_REJECTED_RE.test(text)) {
    return { reachable: false, class: "query_rejected", cause, evidence: text };
  }

  if (COMPLETED_OR_NOT_FOUND_RE.test(text)) {
    return { reachable: false, class: "not_found", cause, evidence: text };
  }

  if (DEADLINE_RE.test(text)) {
    return { reachable: false, class: "deadline", cause, evidence: text };
  }

  if (RESOURCE_EXHAUSTED_RE.test(text)) {
    return {
      reachable: false,
      class: "resource_exhaustion",
      cause,
      evidence: text,
    };
  }

  if (PERMISSION_RE.test(text)) {
    return { reachable: false, class: "permission", cause, evidence: text };
  }

  if (GENERIC_QUERY_FAILURE_RE.test(text)) {
    return { reachable: false, class: "unknown", cause, evidence: text };
  }

  return { reachable: false, class: "unknown", cause, evidence: text };
}

export function classifyTemporalServiceFailure(
  error: unknown,
  context: TemporalServiceContext,
): TemporalServiceDiagnostic {
  const sharedChannelIncident = isReconnectableError(error);
  const evidence = error instanceof Error ? error.message : String(error ?? "");

  if (!context.stslInitialized) {
    return {
      stslInitialized: false,
      serverReachable: context.serverReachable,
      serverServiceable: context.serverServiceable,
      sharedChannelIncident: false,
      reconnectEligible: false,
      class: "stsl_uninitialized",
      evidence,
    };
  }

  if (!context.serverReachable) {
    return {
      stslInitialized: true,
      serverReachable: false,
      serverServiceable: context.serverServiceable,
      sharedChannelIncident,
      reconnectEligible: false,
      class: "server_unreachable",
      evidence,
    };
  }

  if (sharedChannelIncident) {
    return {
      stslInitialized: true,
      serverReachable: true,
      serverServiceable: context.serverServiceable,
      sharedChannelIncident: true,
      reconnectEligible: true,
      class: "shared_channel_incident",
      evidence,
    };
  }

  if (!context.serverServiceable) {
    return {
      stslInitialized: true,
      serverReachable: true,
      serverServiceable: false,
      sharedChannelIncident: false,
      reconnectEligible: false,
      class: "server_not_serviceable",
      evidence,
    };
  }

  return {
    stslInitialized: true,
    serverReachable: true,
    serverServiceable: true,
    sharedChannelIncident: false,
    reconnectEligible: false,
    class: "healthy",
    evidence,
  };
}

export function classifyTemporalFailure(
  error: unknown,
  context: TemporalServiceContext,
): TemporalFailureDiagnostics {
  return {
    service: classifyTemporalServiceFailure(error, context),
    workflow: classifyTemporalWorkflowFailure(error),
  };
}

export function isWorkflowMutationIneligible(
  workflow: TemporalWorkflowDiagnostic,
): boolean {
  return (
    !workflow.reachable &&
    workflow.class !== "not_found" &&
    workflow.class !== "poisoned_history"
  );
}
