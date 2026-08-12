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

  test("exposes a known real tool arg (adv_change_create#target_path)", () => {
    expect(surface.get("adv_change_create")?.has("target_path")).toBe(true);
  });

  test("does not expose removed public recovery args on routine mutation tools", () => {
    const args = surface.get("adv_change_close");
    expect(args).toBeDefined();
    expect(args?.has("target_path")).toBe(true);
    expect(args?.has("recoveryMode")).toBe(false);
    expect(args?.has("recoveryEvidence")).toBe(false);
    expect(args?.has("recoveryReason")).toBe(false);
  });

  test("exposes adv_change_archive#target_path for cross-project archive", () => {
    expect(surface.has("adv_change_archive")).toBe(true);
    expect(surface.get("adv_change_archive")?.has("target_path")).toBe(true);
  });

  test("exposes adv_task_checkpoint#target_path for cross-project checkpoint", () => {
    expect(surface.has("adv_task_checkpoint")).toBe(true);
    expect(surface.get("adv_task_checkpoint")?.has("target_path")).toBe(true);
  });

  test("mint succeeds for a warrant resolving against the live surface (AC2)", () => {
    const contract = buildContractFromAgreement({
      agreement: `## Acceptance Criteria
- AC1: Cross-project work routes through target. [warrant: tool:adv_change_create#target_path]
`,
      approvedAt: "2026-06-25T00:00:00.000Z",
      warrantLookup: { toolSurface: surface, specIds: new Set() },
    });
    expect(contract.items[0]?.warrants).toEqual([
      "tool:adv_change_create#target_path",
    ]);
  });

  test("mint succeeds for cross-project archive warrant against the live surface", () => {
    const contract = buildContractFromAgreement({
      agreement: `## Acceptance Criteria
- AC1: Cross-project archive routes through target. [warrant: tool:adv_change_archive#target_path]
`,
      approvedAt: "2026-06-25T00:00:00.000Z",
      warrantLookup: { toolSurface: surface, specIds: new Set() },
    });
    expect(contract.items[0]?.warrants).toEqual([
      "tool:adv_change_archive#target_path",
    ]);
  });

  test("mint fails for a warrant naming a nonexistent tool arg on the live surface", () => {
    expect(() =>
      buildContractFromAgreement({
        agreement: `## Acceptance Criteria
- AC1: Cross-project archive routes through target. [warrant: tool:adv_change_archive#nonexistent_arg]
`,
        approvedAt: "2026-06-25T00:00:00.000Z",
        warrantLookup: { toolSurface: surface, specIds: new Set() },
      }),
    ).toThrow(/CONTRACT_UNRESOLVED_WARRANT/);
  });
});
