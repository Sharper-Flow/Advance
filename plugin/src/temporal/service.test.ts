import { beforeEach, describe, expect, it } from "vitest";

import {
  closeStsl,
  getService,
  getStslStats,
  initStsl,
  isStslInitialized,
  resetStsl,
} from "./service";

const TEST_PROJECT_ID = "a".repeat(40);

describe("disabled Temporal service compatibility", () => {
  beforeEach(() => {
    resetStsl();
  });

  it("initStsl returns a disabled bundle without initializing a service", async () => {
    const bundle = await initStsl(TEST_PROJECT_ID, {
      ADV_TEMPORAL_ADDRESS: "127.0.0.1:7233",
      ADV_TEMPORAL_NAMESPACE: "default",
    });

    expect(bundle).toEqual({});
    expect(getService()).toBeNull();
    expect(isStslInitialized()).toBe(false);
  });

  it("closeStsl remains a no-op when Temporal is disabled", async () => {
    await initStsl(TEST_PROJECT_ID);
    await closeStsl();

    expect(getService()).toBeNull();
    expect(isStslInitialized()).toBe(false);
    expect(getStslStats()).toMatchObject({
      newConnections: 0,
      reconnectCount: 0,
      reconnectFailureCount: 0,
      saVerification: null,
    });
  });
});
