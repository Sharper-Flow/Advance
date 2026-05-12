import { describe, expect, test } from "vitest";

import { classifySuspectWorkerLock } from "./temporal-ops";

const notServiceable = { status: "not_serviceable" } as const;

function healthWithLock(schemaVersion: 1 | 2) {
  return {
    worker_lock: {
      holder_pid: 1234,
      schema_version: schemaVersion,
    },
  } as any;
}

describe("classifySuspectWorkerLock", () => {
  test("keeps v1 not-serviceable lock classified as live legacy suspect", () => {
    expect(
      classifySuspectWorkerLock({
        health: healthWithLock(1),
        queueServiceability: notServiceable as any,
      }),
    ).toBe("suspect_live_legacy_lock");
  });

  test("classifies v2 not-serviceable lock as live unserviceable suspect", () => {
    expect(
      classifySuspectWorkerLock({
        health: healthWithLock(2),
        queueServiceability: notServiceable as any,
      }),
    ).toBe("suspect_live_unserviceable_lock");
  });

  test("does not classify healthy v2 lock as suspect", () => {
    expect(
      classifySuspectWorkerLock({
        health: healthWithLock(2),
        queueServiceability: { status: "serviceable" } as any,
      }),
    ).toBeUndefined();
  });

  test("does not classify absent lock as suspect", () => {
    expect(
      classifySuspectWorkerLock({
        health: { worker_lock: null } as any,
        queueServiceability: notServiceable as any,
      }),
    ).toBeUndefined();
  });
});
