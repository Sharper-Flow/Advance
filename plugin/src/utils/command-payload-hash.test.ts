import { describe, expect, it } from "vitest";
import { canonicalCommandPayloadString, fnv1a32 } from "./digest";
import {
  computeHostCommandPayloadHash,
  sha256Hex,
} from "./command-payload-hash";

describe("host command payload hash", () => {
  it("uses a deterministic SHA-256 hash over the workflow-safe canonical payload", () => {
    const payload = {
      task: { id: "tmp-1", created_at: "2026-07-27T00:00:00.000Z" },
      addedAt: "2026-07-27T00:00:00.000Z",
    };
    const retry = {
      task: { id: "tmp-1", created_at: "2026-07-27T00:01:00.000Z" },
      addedAt: "2026-07-27T00:01:00.000Z",
    };

    expect(computeHostCommandPayloadHash(payload)).toMatch(/^[0-9a-f]{64}$/);
    expect(computeHostCommandPayloadHash(retry)).toBe(
      computeHostCommandPayloadHash(payload),
    );
  });

  it("does not inherit a known FNV-1a collision as an authoritative payload collision", () => {
    // These values collide under the old 32-bit FNV hash after canonical
    // serialization of { content }, but SHA-256 preserves their distinction.
    const first = { content: "collision-uzb76e-sqc8t" };
    const second = { content: "collision-1qo4fv2-z54dw5" };
    const firstCanonical = canonicalCommandPayloadString(first);
    const secondCanonical = canonicalCommandPayloadString(second);

    expect(fnv1a32(firstCanonical)).toBe(fnv1a32(secondCanonical));
    expect(computeHostCommandPayloadHash(first)).not.toBe(
      computeHostCommandPayloadHash(second),
    );
    expect(sha256Hex(firstCanonical)).toMatch(/^[0-9a-f]{64}$/);
  });
});
