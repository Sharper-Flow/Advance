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
- AC1: Cross-project repair routes through target. [warrant: tool:adv_change_status_repair#target_path]
`,
      approvedAt: "2026-06-25T00:00:00.000Z",
      warrantLookup: { toolSurface: surface, specIds: new Set() },
    });
    expect(contract.items[0]?.warrants).toEqual([
      "tool:adv_change_status_repair#target_path",
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

  test("exposes Epic tool surface (adv_epic_create#epic_id)", () => {
    expect(surface.has("adv_epic_create")).toBe(true);
    expect(surface.get("adv_epic_create")?.has("epic_id")).toBe(true);
  });

  test("mint succeeds for an Epic tool warrant against the live surface", () => {
    const contract = buildContractFromAgreement({
      agreement: `## Acceptance Criteria
- AC1: Epic creation routes through epic_id. [warrant: tool:adv_epic_create#epic_id]
`,
      approvedAt: "2026-06-25T00:00:00.000Z",
      warrantLookup: { toolSurface: surface, specIds: new Set() },
    });
    expect(contract.items[0]?.warrants).toEqual([
      "tool:adv_epic_create#epic_id",
    ]);
  });

  test("exposes Epic owner routing args on adv_epic_link_change", () => {
    const args = surface.get("adv_epic_link_change");
    expect(args).toBeDefined();
    expect(args?.has("epic_owner_target_path")).toBe(true);
    expect(args?.has("epic_owner_target_confirmed")).toBe(true);
    expect(args?.has("epic_owner_confirmationEvidence")).toBe(true);
  });

  test("exposes Epic owner routing args on adv_epic_unlink_change", () => {
    const args = surface.get("adv_epic_unlink_change");
    expect(args).toBeDefined();
    expect(args?.has("epic_owner_target_path")).toBe(true);
    expect(args?.has("epic_owner_target_confirmed")).toBe(true);
    expect(args?.has("epic_owner_confirmationEvidence")).toBe(true);
  });

  test("exposes Epic owner routing args on adv_epic_move_change", () => {
    const args = surface.get("adv_epic_move_change");
    expect(args).toBeDefined();
    expect(args?.has("epic_owner_target_path")).toBe(true);
    expect(args?.has("epic_owner_target_confirmed")).toBe(true);
    expect(args?.has("epic_owner_confirmationEvidence")).toBe(true);
  });

  test("exposes Epic owner routing args on adv_epic_repair_membership", () => {
    const args = surface.get("adv_epic_repair_membership");
    expect(args).toBeDefined();
    expect(args?.has("epic_owner_target_path")).toBe(true);
    expect(args?.has("epic_owner_target_confirmed")).toBe(true);
    expect(args?.has("epic_owner_confirmationEvidence")).toBe(true);
  });

  test("exposes Epic owner routing args on adv_epic_create", () => {
    const args = surface.get("adv_epic_create");
    expect(args).toBeDefined();
    expect(args?.has("epic_owner_target_path")).toBe(true);
    expect(args?.has("epic_owner_target_confirmed")).toBe(true);
    expect(args?.has("epic_owner_confirmationEvidence")).toBe(true);
  });

  test("exposes Epic owner routing args on adv_epic_show", () => {
    const args = surface.get("adv_epic_show");
    expect(args).toBeDefined();
    expect(args?.has("epic_owner_target_path")).toBe(true);
    expect(args?.has("epic_owner_target_confirmed")).toBe(true);
    expect(args?.has("epic_owner_confirmationEvidence")).toBe(true);
  });

  test("exposes Epic owner routing args on adv_epic_list", () => {
    const args = surface.get("adv_epic_list");
    expect(args).toBeDefined();
    expect(args?.has("epic_owner_target_path")).toBe(true);
    expect(args?.has("epic_owner_target_confirmed")).toBe(true);
    expect(args?.has("epic_owner_confirmationEvidence")).toBe(true);
  });

  test("exposes Epic owner routing args on adv_epic_update", () => {
    const args = surface.get("adv_epic_update");
    expect(args).toBeDefined();
    expect(args?.has("epic_owner_target_path")).toBe(true);
    expect(args?.has("epic_owner_target_confirmed")).toBe(true);
    expect(args?.has("epic_owner_confirmationEvidence")).toBe(true);
  });

  test("exposes Epic owner routing args on adv_epic_reorder", () => {
    const args = surface.get("adv_epic_reorder");
    expect(args).toBeDefined();
    expect(args?.has("epic_owner_target_path")).toBe(true);
    expect(args?.has("epic_owner_target_confirmed")).toBe(true);
    expect(args?.has("epic_owner_confirmationEvidence")).toBe(true);
  });

  test("exposes Epic owner routing args on adv_epic_add_shell", () => {
    const args = surface.get("adv_epic_add_shell");
    expect(args).toBeDefined();
    expect(args?.has("epic_owner_target_path")).toBe(true);
    expect(args?.has("epic_owner_target_confirmed")).toBe(true);
    expect(args?.has("epic_owner_confirmationEvidence")).toBe(true);
  });

  test("exposes Epic owner routing args on adv_epic_promote_shell", () => {
    const args = surface.get("adv_epic_promote_shell");
    expect(args).toBeDefined();
    expect(args?.has("epic_owner_target_path")).toBe(true);
    expect(args?.has("epic_owner_target_confirmed")).toBe(true);
    expect(args?.has("epic_owner_confirmationEvidence")).toBe(true);
  });
});
