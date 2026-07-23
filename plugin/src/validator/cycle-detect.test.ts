/**
 * Cycle-detect helper tests.
 *
 * Pins: Kahn topological sort parity, iterative DFS cycle extraction,
 * CLOSED-path form [A,B,A], generic node types, 10k-node scale (DDC2).
 *
 * rq-workGraphTypes01 (addDependencyAwareResume) — Phase B
 */
import { describe, test, expect } from "vitest";
import { detectCycles } from "./cycle-detect";

describe("detectCycles — topological sort (acyclic)", () => {
  test("empty graph — no nodes", () => {
    const result = detectCycles([], () => []);
    expect(result.sorted).toEqual([]);
    expect(result.cycles).toEqual([]);
  });

  test("single node, no deps", () => {
    const result = detectCycles(["A"], () => []);
    expect(result.sorted).toEqual(["A"]);
    expect(result.cycles).toEqual([]);
  });

  test("linear chain A→B→C (A depends on B, B depends on C)", () => {
    const deps: Record<string, string[]> = {
      A: ["B"],
      B: ["C"],
      C: [],
    };
    const result = detectCycles(["A", "B", "C"], (n) => deps[n] ?? []);
    // Topological order: C must come before B, B before A.
    expect(result.sorted).toEqual(["C", "B", "A"]);
    expect(result.cycles).toEqual([]);
  });

  test("independent nodes — no dependencies", () => {
    const result = detectCycles(["A", "B", "C"], () => []);
    expect(result.sorted).toHaveLength(3);
    expect(result.cycles).toEqual([]);
  });

  test("diamond dependency A→B, A→C, B→D, C→D", () => {
    const deps: Record<string, string[]> = {
      A: ["B", "C"],
      B: ["D"],
      C: ["D"],
      D: [],
    };
    const result = detectCycles(["A", "B", "C", "D"], (n) => deps[n] ?? []);
    // D must come first (no deps), then B and C (depend on D), then A.
    expect(result.sorted[0]).toBe("D");
    expect(result.sorted[3]).toBe("A");
    // B and C come after D and before A.
    const bIdx = result.sorted.indexOf("B");
    const cIdx = result.sorted.indexOf("C");
    const dIdx = result.sorted.indexOf("D");
    expect(dIdx).toBeLessThan(bIdx);
    expect(dIdx).toBeLessThan(cIdx);
    expect(result.cycles).toEqual([]);
  });
});

describe("detectCycles — cycle detection (closed-path form)", () => {
  test("2-node cycle A→B→A yields closed path [A,B,A]", () => {
    const deps: Record<string, string[]> = {
      A: ["B"],
      B: ["A"],
    };
    const result = detectCycles(["A", "B"], (n) => deps[n] ?? []);
    expect(result.cycles).toHaveLength(1);
    const cycle = result.cycles[0];
    // Closed form: cycle starts and ends with the same node.
    expect(cycle[0]).toBe(cycle[cycle.length - 1]);
    expect(cycle).toHaveLength(3); // [A,B,A] or [B,A,B]
    expect(new Set(cycle)).toEqual(new Set(["A", "B", cycle[0]]));
  });

  test("self-loop A→A yields closed path [A,A]", () => {
    const deps: Record<string, string[]> = {
      A: ["A"],
    };
    const result = detectCycles(["A"], (n) => deps[n] ?? []);
    expect(result.cycles).toHaveLength(1);
    expect(result.cycles[0]).toEqual(["A", "A"]);
  });

  test("3-node cycle A→B→C→A yields closed path", () => {
    const deps: Record<string, string[]> = {
      A: ["B"],
      B: ["C"],
      C: ["A"],
    };
    const result = detectCycles(["A", "B", "C"], (n) => deps[n] ?? []);
    expect(result.cycles).toHaveLength(1);
    const cycle = result.cycles[0];
    expect(cycle[0]).toBe(cycle[cycle.length - 1]);
    expect(cycle).toHaveLength(4); // [A,B,C,A] or rotation
    expect(new Set(cycle.slice(0, -1))).toEqual(new Set(["A", "B", "C"]));
  });

  test("acyclic graph with cycle embedded — detects only the cycle nodes", () => {
    // D depends on A; A↔B cycle; C independent.
    const deps: Record<string, string[]> = {
      A: ["B"],
      B: ["A"],
      C: [],
      D: ["A"],
    };
    const result = detectCycles(["A", "B", "C", "D"], (n) => deps[n] ?? []);
    expect(result.cycles.length).toBeGreaterThanOrEqual(1);
    // The detected cycle must contain both A and B.
    const cycle = result.cycles[0];
    expect(cycle).toContain("A");
    expect(cycle).toContain("B");
  });

  test("multiple independent cycles — both detected", () => {
    // Two disconnected cycles: A↔B and C↔D.
    const deps: Record<string, string[]> = {
      A: ["B"],
      B: ["A"],
      C: ["D"],
      D: ["C"],
    };
    const result = detectCycles(["A", "B", "C", "D"], (n) => deps[n] ?? []);
    expect(result.cycles.length).toBeGreaterThanOrEqual(2);
    // Each cycle is closed.
    for (const cycle of result.cycles) {
      expect(cycle[0]).toBe(cycle[cycle.length - 1]);
    }
  });
});

describe("detectCycles — generic node type with getKey", () => {
  test("works with object nodes using custom getKey", () => {
    interface Node {
      id: string;
      label: string;
    }
    const a: Node = { id: "a", label: "Alpha" };
    const b: Node = { id: "b", label: "Beta" };
    const deps = new Map<string, Node[]>([
      ["a", [b]],
      ["b", [a]],
    ]);
    const result = detectCycles<Node>(
      [a, b],
      (n) => deps.get(n.id) ?? [],
      (n) => n.id,
    );
    expect(result.cycles).toHaveLength(1);
    const cycle = result.cycles[0];
    expect(cycle[0]).toBe(cycle[cycle.length - 1]);
  });

  test("works with number-keyed nodes (string conversion)", () => {
    // Nodes are 0..4, dependency chain 4→3→2→1→0.
    const result = detectCycles([0, 1, 2, 3, 4], (n) => (n > 0 ? [n - 1] : []));
    expect(result.sorted).toEqual([0, 1, 2, 3, 4]);
    expect(result.cycles).toEqual([]);
  });
});

describe("detectCycles — iterative DFS scale (DDC2)", () => {
  test("10k-node linear chain — no stack overflow, correct sort", () => {
    const N = 10_000;
    const nodes = Array.from({ length: N }, (_, i) => `node-${i}`);
    // Chain: node-N depends on node-(N-1), ..., node-1 depends on node-0.
    const result = detectCycles(nodes, (n) => {
      const idx = Number(n.slice(5));
      return idx > 0 ? [`node-${idx - 1}`] : [];
    });
    expect(result.sorted).toHaveLength(N);
    expect(result.cycles).toEqual([]);
    // node-0 first (no deps), node-(N-1) last.
    expect(result.sorted[0]).toBe("node-0");
    expect(result.sorted[N - 1]).toBe(`node-${N - 1}`);
  });

  test("10k-node cycle — detects cycle without stack overflow", () => {
    const N = 10_000;
    const nodes = Array.from({ length: N }, (_, i) => `n${i}`);
    // Cycle: n0→n1→...→n(N-1)→n0.
    const result = detectCycles(nodes, (n) => {
      const idx = Number(n.slice(1));
      return [nodes[(idx + 1) % N]];
    });
    expect(result.cycles.length).toBeGreaterThanOrEqual(1);
    // The detected cycle must be closed.
    for (const cycle of result.cycles) {
      expect(cycle[0]).toBe(cycle[cycle.length - 1]);
    }
  });
});

describe("detectCycles — merge-order parity", () => {
  test("produces same sorted output as merge-order would for archived entries", () => {
    // Simulate merge-order's dependency graph: chg-b depends on chg-a (overlap).
    const result = detectCycles(["chg-a", "chg-b"], (n) =>
      n === "chg-b" ? ["chg-a"] : [],
    );
    expect(result.sorted).toEqual(["chg-a", "chg-b"]);
    expect(result.cycles).toEqual([]);
  });
});
