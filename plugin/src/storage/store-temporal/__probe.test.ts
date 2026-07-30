import { describe, expect, it, vi } from "vitest";
import { runTemporalQuery } from "./shared";
import { createTemporalReadDeadline } from "../../temporal/retry-wrapper";

describe("probe", () => {
  it("runTemporalQuery with fake timers", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const deadline = createTemporalReadDeadline(1000);
    const op = async () => {
      await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 300));
      return "ok";
    };
    const pending = runTemporalQuery(op, { deadline });
    await vi.advanceTimersByTimeAsync(500);
    const result = await pending;
    expect(result).toBe("ok");
    vi.useRealTimers();
  });
});
