import { describe, expect, it } from "vitest";
import {
  buildChangeWorkflowId,
  buildProjectTaskQueue,
  buildProjectWorkflowId,
  getTemporalAddress,
  getTemporalNamespace,
} from "./client";

describe("temporal client helpers", () => {
  it("builds project-scoped task queue names", () => {
    expect(buildProjectTaskQueue("abc123")).toBe("advance-abc123");
  });

  it("builds stable workflow IDs", () => {
    expect(buildChangeWorkflowId("proj1", "changeA")).toBe(
      "adv/change/proj1/changeA",
    );
    expect(buildProjectWorkflowId("proj1")).toBe("adv/project/proj1");
  });

  it("uses default address and namespace", () => {
    expect(getTemporalAddress({})).toBe("127.0.0.1:7233");
    expect(getTemporalNamespace({})).toBe("default");
  });

  it("honors env overrides", () => {
    expect(
      getTemporalAddress({
        ADV_TEMPORAL_ADDRESS: "10.0.0.2:9333",
        ADV_TEMPORAL_ALLOW_REMOTE: "true",
      }),
    ).toBe("10.0.0.2:9333");
    expect(getTemporalNamespace({ ADV_TEMPORAL_NAMESPACE: "adv-dev" })).toBe(
      "adv-dev",
    );
    expect(() =>
      getTemporalAddress({ ADV_TEMPORAL_ADDRESS: "10.0.0.2:9333" }),
    ).toThrow(/Refusing to use non-loopback/);
    expect(() =>
      getTemporalNamespace({ ADV_TEMPORAL_NAMESPACE: "../evil" }),
    ).toThrow(/Invalid Temporal namespace/);
  });
});
