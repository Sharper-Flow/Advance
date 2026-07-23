import { describe, it, expect } from "vitest";
import {
  DiskProjectionPersistError,
  assertDurablePersist,
  type DiskPersistOutcome,
} from "./disk-persist";

// AC1 / AC5 / AC7 anchor: the pure durability gate that turns a classified
// disk-persist outcome into a durable-mutation success/failure decision.
// RED reproduces the defect contract at the seam: a failed (swallowed) disk
// write must NOT be treated as success — it must surface a typed error.
describe("assertDurablePersist (durability gate)", () => {
  it("throws DiskProjectionPersistError on a failed disk write (AC1/AC5)", () => {
    const cause = new Error("EACCES: permission denied");
    const outcome: DiskPersistOutcome = { kind: "failed", error: cause };
    expect(() => assertDurablePersist("myChange", outcome)).toThrow(
      DiskProjectionPersistError,
    );
  });

  it("carries changeId + cause and encodes ambiguous no-blind-retry semantics (AC7)", () => {
    const cause = new Error("ENOSPC: no space left on device");
    let thrown: DiskProjectionPersistError | undefined;
    try {
      assertDurablePersist("chg-1", { kind: "failed", error: cause });
    } catch (e) {
      thrown = e as DiskProjectionPersistError;
    }
    expect(thrown).toBeInstanceOf(DiskProjectionPersistError);
    expect(thrown?.changeId).toBe("chg-1");
    expect(thrown?.cause).toBe(cause);
    // AC7: the Temporal signal was acknowledged (mutation may be durable in
    // history) but the disk projection failed; caller must NOT blind-retry.
    expect(thrown?.message).toMatch(/may be durable in temporal/i);
    expect(thrown?.message).toMatch(/disk projection/i);
    expect(thrown?.message).toMatch(/do not blind-retry/i);
  });

  it("does not throw when the disk write persisted (success ⇒ durable, AC2)", () => {
    expect(() =>
      assertDurablePersist("chg-2", { kind: "persisted" }),
    ).not.toThrow();
  });

  it("does not throw when the write is intentionally skipped (archived)", () => {
    expect(() =>
      assertDurablePersist("chg-3", { kind: "skipped", reason: "archived" }),
    ).not.toThrow();
  });
});
