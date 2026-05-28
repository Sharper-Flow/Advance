import { describe, expect, it } from "vitest";

import {
  describePayloadDigest,
  fnv1a32,
  SIGNAL_REJECTION_PAYLOAD_SAMPLE_CHARS,
  stableStringify,
} from "./digest";

describe("workflow-safe digest helpers", () => {
  it("serializes object keys deterministically", () => {
    const first = { b: 2, a: { d: 4, c: 3 } };
    const second = { a: { c: 3, d: 4 }, b: 2 };

    expect(stableStringify(first)).toBe(stableStringify(second));
    expect(stableStringify(first)).toBe('{"a":{"c":3,"d":4},"b":2}');
  });

  it("produces stable non-cryptographic FNV-1a digests", () => {
    expect(fnv1a32("hello")).toBe("4f9f2cab");
    expect(fnv1a32(stableStringify({ taskId: "tk-1" }))).toBe(
      fnv1a32(stableStringify({ taskId: "tk-1" })),
    );
  });

  it("summarizes payloads without retaining raw large payloads", () => {
    const digest = describePayloadDigest({
      text: "x".repeat(SIGNAL_REJECTION_PAYLOAD_SAMPLE_CHARS + 100),
    });

    expect(digest.payload_size).toBeGreaterThan(
      SIGNAL_REJECTION_PAYLOAD_SAMPLE_CHARS,
    );
    expect(digest.payload_sample).toHaveLength(
      SIGNAL_REJECTION_PAYLOAD_SAMPLE_CHARS,
    );
    expect(digest.payload_fnv1a).toMatch(/^[0-9a-f]{8}$/);
  });
});
