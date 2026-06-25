/**
 * Tests for the shared process-liveness probe (rq-worktreeLeaseLiveness01).
 */

import { describe, expect, it } from "vitest";
import { isProcessAlive } from "./process-liveness";

function killThrowing(
  code: string,
): (pid: number, signal: number | string) => void {
  return () => {
    const err = new Error(code) as NodeJS.ErrnoException;
    err.code = code;
    throw err;
  };
}

describe("isProcessAlive (rq-worktreeLeaseLiveness01)", () => {
  it("returns true when the signal-0 probe succeeds", () => {
    expect(isProcessAlive(1234, () => {})).toBe(true);
  });

  it("returns false only on ESRCH (process is gone)", () => {
    expect(isProcessAlive(1234, killThrowing("ESRCH"))).toBe(false);
  });

  it("treats EPERM as alive (fail-safe — live peer not signalable by this user)", () => {
    expect(isProcessAlive(1234, killThrowing("EPERM"))).toBe(true);
  });

  it("treats unknown probe errors as alive (fail-safe)", () => {
    expect(isProcessAlive(1234, killThrowing("EINVAL"))).toBe(true);
  });

  it("reports the current process as alive via the real probe", () => {
    expect(isProcessAlive(process.pid)).toBe(true);
  });
});
