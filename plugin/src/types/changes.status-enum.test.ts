/**
 * ChangeStatusSchema reachable-state tests (AC4 of fixChangeStatusHonesty).
 *
 * The stored status enum must only hold *reachable* states. Open changes are
 * `draft`; open-claim authority lives in `AdvLifecycleState="open" AND
 * ExecutionStatus="Running"` (C1), not in the enum. `active` and `pending`
 * were historically stored but no code path writes them anymore — after the
 * load normalizer (storage/json.ts) maps them to `draft` at read time (C4),
 * the enum itself narrows to the reachable set.
 */

import { describe, expect, test } from "vitest";
import { ChangeStatusSchema } from "./changes";

describe("ChangeStatusSchema reachable states", () => {
  test.each(["draft", "archived", "closed"])(
    "accepts reachable status %s",
    (status) => {
      expect(ChangeStatusSchema.parse(status)).toBe(status);
    },
  );

  test.each(["active", "pending"])(
    "rejects legacy open status %s",
    (status) => {
      expect(() => ChangeStatusSchema.parse(status)).toThrow();
    },
  );

  test("rejects genuine garbage", () => {
    expect(() => ChangeStatusSchema.parse("nonsense")).toThrow();
    expect(() => ChangeStatusSchema.parse("")).toThrow();
    expect(() => ChangeStatusSchema.parse(42)).toThrow();
  });

  test("enum options are exactly the reachable set", () => {
    expect([...ChangeStatusSchema.options].sort()).toEqual(
      ["archived", "closed", "draft"].sort(),
    );
  });
});
