import { describe, expect, test } from "bun:test";

import { SCAN_IGNORE_DIRS } from "./scan-ignore";
import { SCAN_IGNORE_DIRS as ARCH_SCAN_IGNORE_DIRS } from "./arch-scan/evaluator";
import { SCAN_IGNORE_DIRS as OPT_SCAN_IGNORE_DIRS } from "./opt-scan/evaluator";

describe("shared scan ignore directories", () => {
  test("contains test and mock directories", () => {
    expect(SCAN_IGNORE_DIRS.has("__tests__")).toBe(true);
    expect(SCAN_IGNORE_DIRS.has("__mocks__")).toBe(true);
  });

  test("is the declaration consumed by both scanners", () => {
    expect(ARCH_SCAN_IGNORE_DIRS).toBe(SCAN_IGNORE_DIRS);
    expect(OPT_SCAN_IGNORE_DIRS).toBe(SCAN_IGNORE_DIRS);
  });
});
