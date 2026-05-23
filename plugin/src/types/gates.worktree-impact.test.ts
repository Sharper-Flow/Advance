import { describe, expect, test } from "vitest";

import {
  GATE_DEFS,
  GATE_ORDER,
  GATE_WORKTREE_IMPACT,
  isMetadataOnlyGate,
  isWorktreeMutationGate,
  type GateId,
} from "./gates";

describe("gate worktree-impact classification", () => {
  test("classifies every canonical gate exactly once", () => {
    expect(Object.keys(GATE_WORKTREE_IMPACT).sort()).toEqual(
      GATE_ORDER.toSorted(),
    );
    expect(Object.keys(GATE_WORKTREE_IMPACT).sort()).toEqual(
      GATE_DEFS.map((gate) => gate.id).toSorted(),
    );
  });

  test("marks proposal, discovery, and design as metadata-only gates", () => {
    const metadataGates: GateId[] = ["proposal", "discovery", "design"];

    expect(metadataGates.every(isMetadataOnlyGate)).toBe(true);
    expect(metadataGates.every((gate) => !isWorktreeMutationGate(gate))).toBe(
      true,
    );
  });

  test("marks planning, execution, acceptance, and release as worktree-mutating gates", () => {
    const mutationGates: GateId[] = [
      "planning",
      "execution",
      "acceptance",
      "release",
    ];

    expect(mutationGates.every(isWorktreeMutationGate)).toBe(true);
    expect(mutationGates.every((gate) => !isMetadataOnlyGate(gate))).toBe(true);
  });
});
