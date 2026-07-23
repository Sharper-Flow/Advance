/**
 * Work-graph edge validation tests.
 *
 * Pins: self-edge rejection, duplicate ref rejection, unresolved target
 * rejection, cycle rejection (closed path), valid edge acceptance, batch
 * validation ordering.
 *
 * AC2, AC3, AC13 reproduction tests.
 * rq-workGraphTypes01 (addDependencyAwareResume) — Phase C
 */
import { describe, test, expect } from "vitest";
import { validateEdgeAdd, nodeRefKey } from "./work-graph-validation";
import type { WorkNodeRef } from "../types/work-graph";

const PID = "bdf259aa162ae192af5b18899ccdc653b085528d";

function changeRef(id: string): WorkNodeRef {
  return { kind: "change", project_id: PID, change_id: id };
}

function shellRef(epicId: string, entryId: string): WorkNodeRef {
  return { kind: "epic_entry", epic_id: epicId, entry_id: entryId };
}

/** Build a simple deps getter from a map. */
function depsGetter(
  deps: Record<string, WorkNodeRef[]>,
): (key: string) => WorkNodeRef[] {
  return (key) => deps[key] ?? [];
}

/** Build resolvableNodeKeys from a set of refs. */
function resolvable(...refs: WorkNodeRef[]): Set<string> {
  return new Set(refs.map(nodeRefKey));
}

describe("validateEdgeAdd — self-edge rejection (AC3)", () => {
  test("self-edge → INVALID_WORK_NODE_REF reason:self_edge", () => {
    const a = changeRef("addA");
    const error = validateEdgeAdd(a, [a], resolvable(a), depsGetter({}));
    expect(error).toEqual({
      code: "INVALID_WORK_NODE_REF",
      reason: "self_edge",
      ref: a,
    });
  });

  test("self-edge in batch with valid edges → self-edge error wins (first check)", () => {
    const a = changeRef("addA");
    const b = changeRef("addB");
    const error = validateEdgeAdd(a, [b, a], resolvable(a, b), depsGetter({}));
    expect(error!.code).toBe("INVALID_WORK_NODE_REF");
    expect(error!.reason).toBe("self_edge");
  });
});

describe("validateEdgeAdd — duplicate ref rejection (AC3)", () => {
  test("duplicate within batch → INVALID_WORK_NODE_REF reason:duplicate_ref", () => {
    const a = changeRef("addA");
    const b = changeRef("addB");
    const error = validateEdgeAdd(a, [b, b], resolvable(a, b), depsGetter({}));
    expect(error).toEqual({
      code: "INVALID_WORK_NODE_REF",
      reason: "duplicate_ref",
      ref: b,
    });
  });

  test("duplicate against existing deps → INVALID_WORK_NODE_REF reason:duplicate_ref", () => {
    const a = changeRef("addA");
    const b = changeRef("addB");
    const existing = { [nodeRefKey(a)]: [b] };
    const error = validateEdgeAdd(
      a,
      [b],
      resolvable(a, b),
      depsGetter(existing),
    );
    expect(error!.code).toBe("INVALID_WORK_NODE_REF");
    expect(error!.reason).toBe("duplicate_ref");
  });
});

describe("validateEdgeAdd — unresolved target rejection (AC3)", () => {
  test("edge to non-existent node → UNRESOLVED_DEPENDENCY", () => {
    const a = changeRef("addA");
    const ghost = changeRef("addGhost");
    const error = validateEdgeAdd(
      a,
      [ghost],
      resolvable(a), // ghost NOT in resolvable set
      depsGetter({}),
    );
    expect(error).toEqual({
      code: "UNRESOLVED_DEPENDENCY",
      ref: ghost,
    });
  });

  test("epic_entry ref to non-existent entry → UNRESOLVED_DEPENDENCY", () => {
    const a = changeRef("addA");
    const ghostShell = shellRef("epicX", "sh-ghost");
    const error = validateEdgeAdd(
      a,
      [ghostShell],
      resolvable(a),
      depsGetter({}),
    );
    expect(error!.code).toBe("UNRESOLVED_DEPENDENCY");
  });
});

describe("validateEdgeAdd — cycle rejection (AC2)", () => {
  test("2-node cycle A→B→A → DEPENDENCY_CYCLE with closed path", () => {
    const a = changeRef("addA");
    const b = changeRef("addB");
    // A already depends on B. Now B wants to depend on A.
    const existing = { [nodeRefKey(a)]: [b] };
    const error = validateEdgeAdd(
      b,
      [a],
      resolvable(a, b),
      depsGetter(existing),
    );
    expect(error!.code).toBe("DEPENDENCY_CYCLE");
    const cyclePath = (error as { cycle_path: WorkNodeRef[] }).cycle_path;
    expect(cyclePath[0]).toBe(cyclePath[cyclePath.length - 1]); // closed
    expect(cyclePath).toContainEqual(a);
    expect(cyclePath).toContainEqual(b);
  });

  test("3-node cycle A→B→C→A → DEPENDENCY_CYCLE with closed path", () => {
    const a = changeRef("addA");
    const b = changeRef("addB");
    const c = changeRef("addC");
    // A→B, B→C exist. Now C wants to depend on A.
    const existing = {
      [nodeRefKey(a)]: [b],
      [nodeRefKey(b)]: [c],
    };
    const error = validateEdgeAdd(
      c,
      [a],
      resolvable(a, b, c),
      depsGetter(existing),
    );
    expect(error!.code).toBe("DEPENDENCY_CYCLE");
    const cyclePath = (error as { cycle_path: WorkNodeRef[] }).cycle_path;
    expect(cyclePath[0]).toBe(cyclePath[cyclePath.length - 1]); // closed
    expect(cyclePath).toHaveLength(4); // [A,B,C,A]
  });

  test("no cycle with linear chain A→B→C → null (valid)", () => {
    const a = changeRef("addA");
    const b = changeRef("addB");
    const c = changeRef("addC");
    // A→B exists. Now A wants to also depend on C.
    const existing = { [nodeRefKey(a)]: [b] };
    const error = validateEdgeAdd(
      a,
      [c],
      resolvable(a, b, c),
      depsGetter(existing),
    );
    expect(error).toBeNull();
  });

  test("transitive cycle A→B→C→A detected when adding C→A", () => {
    const a = changeRef("addA");
    const b = changeRef("addB");
    const c = changeRef("addC");
    // A depends on B, B depends on C. Adding C→A closes the transitive cycle.
    const existing = {
      [nodeRefKey(a)]: [b],
      [nodeRefKey(b)]: [c],
    };
    const error = validateEdgeAdd(
      c,
      [a],
      resolvable(a, b, c),
      depsGetter(existing),
    );
    expect(error!.code).toBe("DEPENDENCY_CYCLE");
    const cyclePath = (error as { cycle_path: WorkNodeRef[] }).cycle_path;
    expect(cyclePath[0]).toBe(cyclePath[cyclePath.length - 1]); // closed
    expect(cyclePath).toContainEqual(a);
    expect(cyclePath).toContainEqual(b);
    expect(cyclePath).toContainEqual(c);
  });
});

describe("validateEdgeAdd — valid edges accepted", () => {
  test("single valid edge → null", () => {
    const a = changeRef("addA");
    const b = changeRef("addB");
    const error = validateEdgeAdd(a, [b], resolvable(a, b), depsGetter({}));
    expect(error).toBeNull();
  });

  test("multiple valid edges → null", () => {
    const a = changeRef("addA");
    const b = changeRef("addB");
    const c = changeRef("addC");
    const error = validateEdgeAdd(
      a,
      [b, c],
      resolvable(a, b, c),
      depsGetter({}),
    );
    expect(error).toBeNull();
  });

  test("empty edge list → null (no-op)", () => {
    const a = changeRef("addA");
    const error = validateEdgeAdd(a, [], resolvable(a), depsGetter({}));
    expect(error).toBeNull();
  });
});

describe("validateEdgeAdd — check ordering (AC3)", () => {
  test("self-edge checked before duplicate", () => {
    const a = changeRef("addA");
    // [a, a] — first is self-edge, second is duplicate. Self wins.
    const error = validateEdgeAdd(a, [a, a], resolvable(a), depsGetter({}));
    expect(error!.reason).toBe("self_edge");
  });

  test("duplicate checked before unresolved", () => {
    const a = changeRef("addA");
    const ghost = changeRef("addGhost");
    // [ghost, ghost] — duplicate + unresolved. Duplicate wins.
    const error = validateEdgeAdd(
      a,
      [ghost, ghost],
      resolvable(a),
      depsGetter({}),
    );
    expect(error!.code).toBe("INVALID_WORK_NODE_REF");
    expect(error!.reason).toBe("duplicate_ref");
  });

  test("unresolved checked before cycle", () => {
    const a = changeRef("addA");
    const ghost = changeRef("addGhost");
    // Ghost is unresolved AND would create a cycle — but unresolved wins.
    const existing = { [nodeRefKey(ghost)]: [a] };
    const error = validateEdgeAdd(
      a,
      [ghost],
      resolvable(a), // ghost NOT resolvable
      depsGetter(existing),
    );
    expect(error!.code).toBe("UNRESOLVED_DEPENDENCY");
  });
});
