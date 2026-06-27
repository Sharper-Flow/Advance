import { describe, expect, test } from "vitest";
import { getToolSurface } from "./tool-registry";
import { buildContractFromAgreement } from "./validator/contract-mint";

/**
 * addAcWarrantGuard — live tool-surface integration (R1).
 *
 * Proves the warrant verifier resolves against the REAL assembled tool surface,
 * not a fixture: a real tool#arg resolves; the AC6-class warrant naming a
 * surface that does not exist fails the mint.
 */
describe("getToolSurface (live surface)", () => {
  const surface = getToolSurface();

  test("exposes a known real tool arg (adv_change_status_repair#target_path)", () => {
    expect(surface.get("adv_change_status_repair")?.has("target_path")).toBe(
      true,
    );
  });

  test("exposes design-concern recovery args for contract warrants", () => {
    const args = surface.get("adv_design_concern_disposition");
    expect(args).toBeDefined();
    expect(args?.has("target_path")).toBe(true);
    expect(args?.has("recoveryMode")).toBe(true);
    expect(args?.has("recoveryEvidence")).toBe(true);
    expect(args?.has("recoveryReason")).toBe(true);
  });

  test("does NOT expose adv_change_archive#target_path (the AC6 defect surface)", () => {
    expect(surface.has("adv_change_archive")).toBe(true);
    expect(surface.get("adv_change_archive")?.has("target_path")).toBe(false);
  });

  test("mint succeeds for a warrant resolving against the live surface (AC2)", () => {
    const contract = buildContractFromAgreement({
      agreement: `## Acceptance Criteria
- AC1: Cross-project repair routes through target. [warrant: tool:adv_change_status_repair#target_path]
`,
      approvedAt: "2026-06-25T00:00:00.000Z",
      warrantLookup: { toolSurface: surface, specIds: new Set() },
    });
    expect(contract.items[0]?.warrants).toEqual([
      "tool:adv_change_status_repair#target_path",
    ]);
  });

  test("mint fails for the AC6-class warrant against the live surface (AC1)", () => {
    expect(() =>
      buildContractFromAgreement({
        agreement: `## Acceptance Criteria
- AC1: Cross-project archive routes through target. [warrant: tool:adv_change_archive#target_path]
`,
        approvedAt: "2026-06-25T00:00:00.000Z",
        warrantLookup: { toolSurface: surface, specIds: new Set() },
      }),
    ).toThrow(/CONTRACT_UNRESOLVED_WARRANT/);
  });
});
