/**
 * portfolioState tests (rq-createPortfolioLine01 / AC4).
 *
 * adv_change_create surfaces bounded portfolio state: non-terminal count +
 * never-terminal share + a soft nudge above threshold. The read is
 * deadline-capped and MUST degrade to an explicit { available: false } marker
 * on failure or timeout — creation is never blocked by the portfolio read.
 */

import { describe, expect, it } from "vitest";

import { derivePortfolioState, readPortfolioState } from "./portfolio-state";

describe("derivePortfolioState", () => {
  it("counts non-terminal changes and computes never-terminal share", () => {
    const state = derivePortfolioState([
      { status: "draft" },
      { status: "draft" },
      { status: "archived" },
      { status: "closed" },
    ]);

    expect(state.available).toBe(true);
    expect(state.open_count).toBe(2);
    expect(state.never_terminal_share).toBe(0.5);
    expect(state.nudge).toBeUndefined();
  });

  it("honors lifecycleState when present", () => {
    const state = derivePortfolioState([
      { status: "draft", lifecycleState: "open" },
      { status: "archived", lifecycleState: "archived" },
    ]);

    expect(state.open_count).toBe(1);
    expect(state.never_terminal_share).toBe(0.5);
  });

  it("emits the nudge only above both thresholds (soft warning)", () => {
    // Above share threshold but too few open changes → no nudge (tiny
    // portfolios would nudge constantly otherwise).
    const tiny = derivePortfolioState([
      { status: "draft" },
      { status: "draft" },
      { status: "archived" },
    ]);
    expect(tiny.nudge).toBeUndefined();

    const crowded = derivePortfolioState(
      Array.from({ length: 8 }, () => ({ status: "draft" })),
    );
    expect(crowded.open_count).toBe(8);
    expect(crowded.never_terminal_share).toBe(1);
    expect(crowded.nudge).toContain("adv_backlog_add");
  });

  it("treats an empty portfolio as zero share with no nudge", () => {
    const state = derivePortfolioState([]);
    expect(state.available).toBe(true);
    expect(state.open_count).toBe(0);
    expect(state.never_terminal_share).toBe(0);
    expect(state.nudge).toBeUndefined();
  });
});

describe("readPortfolioState", () => {
  it("returns stats when the store read completes", async () => {
    const store = {
      changes: {
        list: async () => ({ changes: [{ status: "draft" }] }),
      },
    };

    const state = await readPortfolioState(store);
    expect(state.available).toBe(true);
    expect(state.open_count).toBe(1);
  });

  it("prefers listSummary when the store provides it", async () => {
    let summaryCalled = false;
    const store = {
      changes: {
        listSummary: async () => {
          summaryCalled = true;
          return { changes: [{ status: "draft" }, { status: "archived" }] };
        },
        list: async () => {
          throw new Error("list must not be called when listSummary exists");
        },
      },
    };

    const state = await readPortfolioState(store);
    expect(summaryCalled).toBe(true);
    expect(state.open_count).toBe(1);
  });

  it("degrades to an explicit unavailable marker when the read throws", async () => {
    const store = {
      changes: {
        list: async () => {
          throw new Error("Temporal operation exceeded 8000ms timeout");
        },
      },
    };

    const state = await readPortfolioState(store);
    expect(state).toEqual({ available: false });
  });

  it("degrades to an explicit unavailable marker when the read exceeds its deadline", async () => {
    const store = {
      changes: {
        list: async () =>
          new Promise(() => {
            // Never resolves — simulates a hung Temporal read.
          }),
      },
    };

    const state = await readPortfolioState(store, 25);
    expect(state).toEqual({ available: false });
  });
});
