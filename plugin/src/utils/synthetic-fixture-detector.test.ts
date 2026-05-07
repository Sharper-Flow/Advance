/**
 * Synthetic Fixture Detector Tests
 *
 * Pins the patterns that match ADV's automated validation/parity/latency/
 * roundtrip workflow IDs and summaries. These records leak ADV state when
 * tests don't clean up, so the patterns are guarded at both adv_change_create
 * and the storage save path.
 *
 * Spec ref: rq-synthstate01 (Synthetic Validation Draft Isolation)
 */

import { describe, test, expect } from "vitest";
import { isSyntheticValidationDraftPattern } from "./synthetic-fixture-detector";

describe("isSyntheticValidationDraftPattern", () => {
  describe("real change patterns (should NOT match)", () => {
    test("descriptive feature title", () => {
      expect(isSyntheticValidationDraftPattern("Add user authentication")).toBe(
        false,
      );
    });

    test("camelCase ID", () => {
      expect(isSyntheticValidationDraftPattern("addUserAuthentication")).toBe(
        false,
      );
    });

    test("name containing 'parity' but not the test pattern", () => {
      expect(
        isSyntheticValidationDraftPattern("addParityCheckMonitoring"),
      ).toBe(false);
    });

    test("name containing 'roundtrip' but not the test pattern", () => {
      expect(
        isSyntheticValidationDraftPattern("documentDataRoundtripContract"),
      ).toBe(false);
    });

    test("empty string", () => {
      expect(isSyntheticValidationDraftPattern("")).toBe(false);
    });

    test("whitespace-only", () => {
      expect(isSyntheticValidationDraftPattern("   ")).toBe(false);
    });
  });

  describe("roundtrip validation patterns", () => {
    test("plain changeRoundtrip", () => {
      expect(isSyntheticValidationDraftPattern("changeRoundtrip")).toBe(true);
    });

    test("changeRoundtrip with sequence number", () => {
      expect(isSyntheticValidationDraftPattern("changeRoundtrip54")).toBe(true);
    });

    test("space-separated 'change roundtrip'", () => {
      expect(isSyntheticValidationDraftPattern("change roundtrip")).toBe(true);
    });

    test("space-separated 'change roundtrip 7'", () => {
      expect(isSyntheticValidationDraftPattern("change roundtrip7")).toBe(true);
    });
  });

  describe("per-subsystem parity patterns", () => {
    test("plain gateParity", () => {
      expect(isSyntheticValidationDraftPattern("gateParity")).toBe(true);
    });

    test("gateParity with sequence number", () => {
      expect(isSyntheticValidationDraftPattern("gateParity42")).toBe(true);
    });

    test("taskParity / wisdomParity / reentryParity", () => {
      expect(isSyntheticValidationDraftPattern("taskParity")).toBe(true);
      expect(isSyntheticValidationDraftPattern("wisdomParity10")).toBe(true);
      expect(isSyntheticValidationDraftPattern("reentryParity")).toBe(true);
    });

    test("space-separated parity variants", () => {
      expect(isSyntheticValidationDraftPattern("task parity")).toBe(true);
      expect(isSyntheticValidationDraftPattern("gate parity 3")).toBe(false); // 'gate parity 3' has space before '3', not match — needs no-space
      expect(isSyntheticValidationDraftPattern("gate parity3")).toBe(true);
    });
  });

  describe("parity-prefix markers", () => {
    test("bracket-prefix [parity:legacy]", () => {
      expect(
        isSyntheticValidationDraftPattern("[parity:legacy] add feature"),
      ).toBe(true);
    });

    test("bracket-prefix [parity:temporal]", () => {
      expect(
        isSyntheticValidationDraftPattern(
          "[parity:temporal] gate parity check",
        ),
      ).toBe(true);
    });

    test("camelCase parityLegacy / parityTemporal", () => {
      expect(isSyntheticValidationDraftPattern("parityLegacy")).toBe(true);
      expect(isSyntheticValidationDraftPattern("parityTemporal")).toBe(true);
      expect(
        isSyntheticValidationDraftPattern("parityTemporalGateParity"),
      ).toBe(true);
      expect(
        isSyntheticValidationDraftPattern("parityTemporalChangeRoundtrip"),
      ).toBe(true);
    });
  });

  describe("latency benchmark patterns", () => {
    test("latencyLegacy", () => {
      expect(isSyntheticValidationDraftPattern("latencyLegacy")).toBe(true);
      expect(isSyntheticValidationDraftPattern("latencyLegacy20")).toBe(true);
    });

    test("space-separated 'latency legacy'", () => {
      expect(isSyntheticValidationDraftPattern("latency legacy")).toBe(true);
      expect(isSyntheticValidationDraftPattern("latencylegacy")).toBe(true);
    });
  });

  describe("harness cleanup artifacts", () => {
    test("cleanupParityHarnessLeak", () => {
      expect(
        isSyntheticValidationDraftPattern("cleanupParityHarnessLeak"),
      ).toBe(true);
      expect(
        isSyntheticValidationDraftPattern("cleanupParityHarnessLeak3"),
      ).toBe(true);
    });
  });

  describe("comparison protocol patterns", () => {
    test("userIntuitComparisonProtocol", () => {
      expect(
        isSyntheticValidationDraftPattern("userIntuitComparisonProtocol"),
      ).toBe(true);
      expect(
        isSyntheticValidationDraftPattern("userIntuitComparisonProtocol5"),
      ).toBe(true);
    });
  });

  describe("case insensitivity", () => {
    test("uppercase variants", () => {
      expect(isSyntheticValidationDraftPattern("CHANGEROUNDTRIP")).toBe(true);
      expect(isSyntheticValidationDraftPattern("GateParity")).toBe(true);
      expect(isSyntheticValidationDraftPattern("PARITYLEGACY")).toBe(true);
    });
  });
});
