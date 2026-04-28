/**
 * Status / Doom-Loop Detection Tests
 *
 * Tests for TRANSIENT error-class skip, getDoomLoopInfo enrichment,
 * and getEffectiveDoomLoopInfo persistence merging.
 */

import { describe, test, expect, beforeEach } from "vitest";
import {
  trackRetry,
  clearRetry,
  getDoomLoopInfo,
  getEffectiveDoomLoopInfo,
} from "./status";

describe("trackRetry", () => {
  beforeEach(() => {
    clearRetry("tk-test");
    clearRetry("tk-transient");
    clearRetry("tk-semantic");
    clearRetry("tk-default");
    clearRetry("tk-doom");
  });

  test("TRANSIENT errorClass does NOT increment doom-loop attempts", () => {
    trackRetry("tk-transient", "lock contention", "TRANSIENT");
    trackRetry("tk-transient", "lock contention again", "TRANSIENT");
    trackRetry("tk-transient", "still locked", "TRANSIENT");

    const info = getDoomLoopInfo("tk-transient");
    expect(info.attempts).toBe(0);
    expect(info.transientAttempts).toBe(3);
    expect(info.inDoomLoop).toBe(false);
  });

  test("SEMANTIC errorClass DOES increment doom-loop attempts and triggers at 3", () => {
    trackRetry("tk-semantic", "first error", "SEMANTIC");
    trackRetry("tk-semantic", "second error", "SEMANTIC");

    const infoBefore = getDoomLoopInfo("tk-semantic");
    expect(infoBefore.attempts).toBe(2);
    expect(infoBefore.inDoomLoop).toBe(false);

    // Third SEMANTIC retry triggers doom loop
    const triggered = trackRetry("tk-semantic", "third error", "SEMANTIC");
    expect(triggered).toBe(true);

    const infoAfter = getDoomLoopInfo("tk-semantic");
    expect(infoAfter.attempts).toBe(3);
    expect(infoAfter.inDoomLoop).toBe(true);
  });

  test("trackRetry without errorClass defaults to SEMANTIC (conservative)", () => {
    trackRetry("tk-default", "some error");
    trackRetry("tk-default", "another error");

    const info = getDoomLoopInfo("tk-default");
    expect(info.attempts).toBe(2);
    expect(info.transientAttempts).toBe(0);
  });
});

describe("getDoomLoopInfo", () => {
  beforeEach(() => {
    clearRetry("tk-info");
  });

  test("returns transientAttempts count", () => {
    trackRetry("tk-info", "transient 1", "TRANSIENT");
    trackRetry("tk-info", "semantic 1", "SEMANTIC");
    trackRetry("tk-info", "transient 2", "TRANSIENT");

    const info = getDoomLoopInfo("tk-info");
    expect(info.attempts).toBe(1);
    expect(info.transientAttempts).toBe(2);
    expect(info.lastError).toBe("transient 2");
  });

  test("returns zeroed info when no tracker exists", () => {
    const info = getDoomLoopInfo("tk-nonexistent");
    expect(info.inDoomLoop).toBe(false);
    expect(info.attempts).toBe(0);
    expect(info.transientAttempts).toBe(0);
    expect(info.lastError).toBeNull();
  });
});

describe("getEffectiveDoomLoopInfo", () => {
  beforeEach(() => {
    clearRetry("tk-eff");
    clearRetry("tk-eff-transient");
    clearRetry("tk-eff-missing");
    clearRetry("tk-eff-mixed");
  });

  test("with persisted error_class='TRANSIENT' excludes from doom-loop count", () => {
    const info = getEffectiveDoomLoopInfo("tk-eff-transient", {
      retry_count: 5,
      error_class: "TRANSIENT",
    });
    expect(info.attempts).toBe(0); // excluded
    expect(info.transientAttempts).toBe(5);
    expect(info.inDoomLoop).toBe(false);
  });

  test("with missing error_class treats as SEMANTIC", () => {
    const info = getEffectiveDoomLoopInfo("tk-eff-missing", {
      retry_count: 2,
    });
    expect(info.attempts).toBe(2);
    expect(info.transientAttempts).toBe(0);
    expect(info.inDoomLoop).toBe(false);
  });

  test("prefers live tracker when it has more attempts than persisted", () => {
    trackRetry("tk-eff", "live error 1", "SEMANTIC");
    trackRetry("tk-eff", "live error 2", "SEMANTIC");

    const info = getEffectiveDoomLoopInfo("tk-eff", {
      retry_count: 1,
      error_class: "SEMANTIC",
    });
    expect(info.attempts).toBe(2); // live wins
    expect(info.inDoomLoop).toBe(false);
  });

  test("uses persisted data when it exceeds live tracker", () => {
    trackRetry("tk-eff-mixed", "live error", "SEMANTIC");

    const info = getEffectiveDoomLoopInfo("tk-eff-mixed", {
      retry_count: 4,
      error_class: "SEMANTIC",
    });
    expect(info.attempts).toBe(4);
    expect(info.inDoomLoop).toBe(true); // 4 >= 3 threshold
  });

  test("uses attempts array length when retry_count is missing", () => {
    const info = getEffectiveDoomLoopInfo("tk-eff-array", {
      attempts: [{}, {}, {}],
      error_class: "SEMANTIC",
    });
    expect(info.attempts).toBe(3);
    expect(info.inDoomLoop).toBe(true);
  });

  test("carries lastError from persisted when persisted dominates", () => {
    const info = getEffectiveDoomLoopInfo("tk-eff-no-live", {
      retry_count: 2,
      last_error: "persisted error message",
      error_class: "SEMANTIC",
    });
    expect(info.attempts).toBe(2);
    expect(info.lastError).toBe("persisted error message");
  });
});
