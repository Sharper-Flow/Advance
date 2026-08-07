import { describe, expect, test } from "vitest";

import {
  CHANGE_LIST_DEFAULT_VALIDATION_CONCURRENCY,
  loadChangesInBatches,
} from "./store-disk";

describe("disk change-list hydration bounds", () => {
  test("default batch bound never exceeds four concurrent projection loads", async () => {
    let active = 0;
    let peak = 0;
    const ids = Array.from({ length: 20 }, (_, index) => String(index));

    const loaded = await loadChangesInBatches(
      ids,
      CHANGE_LIST_DEFAULT_VALIDATION_CONCURRENCY,
      async (id) => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 2));
        active -= 1;
        return id;
      },
    );

    expect(loaded).toEqual(ids);
    expect(peak).toBe(CHANGE_LIST_DEFAULT_VALIDATION_CONCURRENCY);
  });
});
