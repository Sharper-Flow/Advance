/**
 * Tests for generateSessionId (T16 / KD-11).
 */

import { describe, expect, it } from "vitest";
import { generateSessionId } from "./session-id";

describe("generateSessionId (T16)", () => {
  it("returns ids matching the format sess_<8 alphanumeric>", () => {
    for (let i = 0; i < 25; i++) {
      const id = generateSessionId();
      expect(id).toMatch(/^sess_[A-Za-z0-9_-]{8}$/);
    }
  });

  it("is unique over 1000 calls (no collisions at solo-dev scale)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      seen.add(generateSessionId());
    }
    expect(seen.size).toBe(1000);
  });

  it("contains no special chars beyond the nanoid URL-safe alphabet", () => {
    // nanoid alphabet: A-Z a-z 0-9 _ -
    for (let i = 0; i < 25; i++) {
      const id = generateSessionId();
      const rest = id.slice("sess_".length);
      expect(rest).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(rest.length).toBe(8);
    }
  });

  it("is a stable prefix (sess_) — pattern-matchable without internal-structure assumptions", () => {
    expect(generateSessionId().startsWith("sess_")).toBe(true);
  });
});
