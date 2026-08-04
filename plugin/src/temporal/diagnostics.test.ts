import { describe, expect, test } from "vitest";
import {
  classifyTemporalFailure,
  classifyTemporalServiceFailure,
  classifyTemporalWorkflowFailure,
  isWorkflowMutationIneligible,
  type TemporalServiceContext,
} from "./diagnostics";
import { GRPC_NOT_FOUND, TemporalQueryTimeoutError } from "./retry-wrapper";

/**
 * Build a validated @temporalio/client ServiceError-shaped error: a wrapper
 * whose `cause` carries a @grpc/grpc-js ServiceError shape (numeric `code` +
 * string `details` + record-like `metadata`). Mirrors how the SDK's
 * `rethrowGrpcError` nests the raw gRPC error as `ServiceError.cause`.
 */
function grpcError(code: number, message = "grpc failure"): Error {
  const cause = Object.assign(new Error(message), {
    code,
    details: message,
    metadata: {},
  });
  return Object.assign(new Error(`ServiceError: ${message}`), { cause });
}

const healthyCtx: TemporalServiceContext = {
  stslInitialized: true,
  serverReachable: true,
  serverServiceable: true,
};

describe("classifyTemporalWorkflowFailure", () => {
  test("no-poller", () => {
    const d = classifyTemporalWorkflowFailure(
      new Error("no poller is available for this workflow query"),
    );
    expect(d.class).toBe("no_poller");
    expect(d.reachable).toBe(false);
  });

  test("query_failed_or_not_registered", () => {
    const d = classifyTemporalWorkflowFailure(
      new Error("Query type 'changeStateQuery' not registered"),
    );
    expect(d.class).toBe("query_failed_or_not_registered");
    expect(d.reachable).toBe(false);
  });

  test("query_rejected", () => {
    const d = classifyTemporalWorkflowFailure(
      new Error("QueryRejectedError: query was rejected by the workflow"),
    );
    expect(d.class).toBe("query_rejected");
    expect(d.reachable).toBe(false);
  });

  test("not_found by gRPC NOT_FOUND code", () => {
    const d = classifyTemporalWorkflowFailure(grpcError(5, "not found"));
    expect(d.class).toBe("not_found");
    expect(d.reachable).toBe(false);
  });

  test("not_found by WorkflowNotFoundError name", () => {
    const e = new Error("workflow not found");
    e.name = "WorkflowNotFoundError";
    const d = classifyTemporalWorkflowFailure(e);
    expect(d.class).toBe("not_found");
  });

  test("not_found by completed workflow message", () => {
    const d = classifyTemporalWorkflowFailure(
      new Error("Cannot signal a completed workflow handle"),
    );
    expect(d.class).toBe("not_found");
  });

  test("deadline by TemporalQueryTimeoutError", () => {
    const d = classifyTemporalWorkflowFailure(
      new TemporalQueryTimeoutError(5_000),
    );
    expect(d.class).toBe("deadline");
    expect(d.reachable).toBe(false);
  });

  test("deadline by gRPC DEADLINE_EXCEEDED code", () => {
    const d = classifyTemporalWorkflowFailure(grpcError(4));
    expect(d.class).toBe("deadline");
  });

  test("resource_exhaustion by gRPC RESOURCE_EXHAUSTED code", () => {
    const d = classifyTemporalWorkflowFailure(grpcError(8));
    expect(d.class).toBe("resource_exhaustion");
  });

  test("permission by message", () => {
    const d = classifyTemporalWorkflowFailure(new Error("permission denied"));
    expect(d.class).toBe("permission");
  });

  test("permission by gRPC PERMISSION_DENIED code", () => {
    const d = classifyTemporalWorkflowFailure(grpcError(7));
    expect(d.class).toBe("permission");
  });

  test("poisoned_history by TMPRL1100 nondeterminism", () => {
    const d = classifyTemporalWorkflowFailure(
      new Error(
        "[TMPRL1100] Nondeterminism error: No command scheduled for event HistoryEvent(id: 231)",
      ),
    );
    expect(d.class).toBe("poisoned_history");
    expect(d.reachable).toBe(false);
  });

  test("unknown wrapper for generic Failed to query Workflow", () => {
    const d = classifyTemporalWorkflowFailure(
      new Error("Failed to query Workflow"),
    );
    expect(d.class).toBe("unknown");
    expect(d.reachable).toBe(false);
  });

  test("reachable when no error is provided", () => {
    const d = classifyTemporalWorkflowFailure(undefined);
    expect(d.class).toBe("reachable");
    expect(d.reachable).toBe(true);
  });

  test("extracts nested gRPC cause", () => {
    const d = classifyTemporalWorkflowFailure(
      grpcError(GRPC_NOT_FOUND, "workflow absent"),
    );
    expect(d.cause).toEqual({
      code: GRPC_NOT_FOUND,
      statusName: "NOT_FOUND",
      details: "workflow absent",
    });
  });
});

describe("classifyTemporalServiceFailure", () => {
  test("healthy service context with no error => healthy, not reconnect eligible", () => {
    const s = classifyTemporalServiceFailure(undefined, healthyCtx);
    expect(s.stslInitialized).toBe(true);
    expect(s.serverReachable).toBe(true);
    expect(s.serverServiceable).toBe(true);
    expect(s.class).toBe("healthy");
    expect(s.sharedChannelIncident).toBe(false);
    expect(s.reconnectEligible).toBe(false);
  });

  test("STSL uninitialized => not reconnect eligible regardless of error", () => {
    const s = classifyTemporalServiceFailure(
      new Error("Channel has been shut down"),
      {
        stslInitialized: false,
        serverReachable: true,
        serverServiceable: true,
      },
    );
    expect(s.class).toBe("stsl_uninitialized");
    expect(s.reconnectEligible).toBe(false);
  });

  test("server unreachable => not reconnect eligible", () => {
    const s = classifyTemporalServiceFailure(new Error("ECONNREFUSED"), {
      stslInitialized: true,
      serverReachable: false,
      serverServiceable: true,
    });
    expect(s.class).toBe("server_unreachable");
    expect(s.reconnectEligible).toBe(false);
  });

  test("server not serviceable without shared-channel incident => not reconnect eligible", () => {
    const s = classifyTemporalServiceFailure(
      new Error("Failed to query Workflow"),
      {
        stslInitialized: true,
        serverReachable: true,
        serverServiceable: false,
      },
    );
    expect(s.class).toBe("server_not_serviceable");
    expect(s.sharedChannelIncident).toBe(false);
    expect(s.reconnectEligible).toBe(false);
  });

  test("shared-channel incident with healthy service => reconnect eligible", () => {
    const s = classifyTemporalServiceFailure(
      new Error("Channel has been shut down"),
      healthyCtx,
    );
    expect(s.class).toBe("shared_channel_incident");
    expect(s.sharedChannelIncident).toBe(true);
    expect(s.reconnectEligible).toBe(true);
  });

  test("UNAVAILABLE gRPC code alone does not make reconnect eligible", () => {
    const s = classifyTemporalServiceFailure(grpcError(14), healthyCtx);
    expect(s.sharedChannelIncident).toBe(false);
    expect(s.reconnectEligible).toBe(false);
    expect(s.class).toBe("healthy");
  });

  test("transport text inside a saturation/availability code remains not reconnect eligible", () => {
    const s = classifyTemporalServiceFailure(
      grpcError(14, "Channel has been shut down"),
      healthyCtx,
    );
    expect(s.sharedChannelIncident).toBe(false);
    expect(s.reconnectEligible).toBe(false);
  });
});

describe("classifyTemporalFailure — two-axis independence", () => {
  test("service/workflow divergence: healthy service, workflow not found => zero reconnect", () => {
    const d = classifyTemporalFailure(grpcError(5, "not found"), healthyCtx);
    expect(d.service.class).toBe("healthy");
    expect(d.workflow.class).toBe("not_found");
    expect(d.service.reconnectEligible).toBe(false);
  });

  test("shared-channel incident + query failure => reconnect eligible, workflow unknown", () => {
    const d = classifyTemporalFailure(
      new Error("Channel has been shut down"),
      healthyCtx,
    );
    expect(d.service.class).toBe("shared_channel_incident");
    expect(d.service.sharedChannelIncident).toBe(true);
    expect(d.service.reconnectEligible).toBe(true);
    expect(d.workflow.class).toBe("unknown");
    expect(d.workflow.reachable).toBe(false);
  });

  test("workflow-local failure does not trigger reconnect", () => {
    for (const message of [
      "no poller is available for this workflow query",
      "Query type 'changeStateQuery' not registered",
      "Failed to query Workflow",
    ]) {
      const d = classifyTemporalFailure(new Error(message), healthyCtx);
      expect(d.service.reconnectEligible).toBe(false);
      expect(d.workflow.reachable).toBe(false);
    }
  });
});

describe("isWorkflowMutationIneligible", () => {
  test("SC4-listed classes are mutation ineligible", () => {
    for (const cls of [
      "no_poller",
      "query_failed_or_not_registered",
      "deadline",
      "unknown",
    ] as const) {
      expect(
        isWorkflowMutationIneligible({
          reachable: false,
          class: cls,
        }),
      ).toBe(true);
    }
  });

  test("query_rejected is also mutation ineligible", () => {
    expect(
      isWorkflowMutationIneligible({
        reachable: false,
        class: "query_rejected",
      }),
    ).toBe(true);
  });

  test("not_found and poisoned_history may authorize projection recovery", () => {
    expect(
      isWorkflowMutationIneligible({
        reachable: false,
        class: "not_found",
      }),
    ).toBe(false);
    expect(
      isWorkflowMutationIneligible({
        reachable: false,
        class: "poisoned_history",
      }),
    ).toBe(false);
  });

  test("reachable workflow is not mutation ineligible", () => {
    expect(
      isWorkflowMutationIneligible({
        reachable: true,
        class: "reachable",
      }),
    ).toBe(false);
  });
});
