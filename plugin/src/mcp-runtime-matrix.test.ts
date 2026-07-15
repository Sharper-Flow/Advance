import { describe, expect, test } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  catalogExpression,
  directExpression,
  isIdentifierSafe,
  loadLiveEvidence,
  loadMatrixFixture,
  resolveInvocation,
  type LiveEvidenceFixture,
  type MatrixFixture,
} from "./mcp-runtime-matrix";
import {
  CONCRETE_MCP_SPELLING,
  countContractOccurrences,
  effectiveAgentPrompts,
  EXTERNAL_MCP_PREFIXES,
  MCP_ACTIVE_SURFACE_CONTRACT,
} from "./prompt-corpus";

const fixture = loadMatrixFixture();

function rowById(rows: MatrixFixture["rows"], id: string) {
  const row = rows.find((candidate) => candidate.id === id);
  if (!row) throw new Error(`fixture missing mandatory row ${id}`);
  return row;
}

/** Expected expression for a row's representative (first) case. */
function representativeExpression(f: MatrixFixture, rowId: string): string {
  const row = rowById(f.rows, rowId);
  const first = row.cases[0]!;
  return first.expect.expression ?? "";
}

describe("MCP invocation runtime matrix", () => {
  test("every mandatory row is present with at least one case (no applicability escape)", () => {
    expect(fixture.mandatoryRowIds).toEqual([
      "codemode-primary",
      "codemode-spawned-researcher",
      "direct-primary",
      "codemode-no-mcp",
      "exact-path-forms",
    ]);
    expect(fixture.rows.map((row) => row.id).sort()).toEqual(
      [...fixture.mandatoryRowIds].sort(),
    );
    for (const row of fixture.rows) {
      expect(
        row.cases.length,
        `row ${row.id} exercises no surface`,
      ).toBeGreaterThan(0);
      expect(row.discoveryEvidence.length).toBeGreaterThan(0);
    }
  });

  test("each row routes through the active surface with byte-exact invocation", () => {
    for (const row of fixture.rows) {
      for (const matrixCase of row.cases) {
        const resolution = resolveInvocation(
          matrixCase.surface,
          matrixCase.capability,
        );
        expect(
          resolution.mode,
          `${row.id}/${matrixCase.label}: wrong routing mode`,
        ).toBe(matrixCase.expect.mode);
        if (matrixCase.expect.mode === "unavailable") {
          expect(resolution.mode).toBe("unavailable");
          // The unavailable row attempts no nonexistent callable.
          expect("expression" in resolution).toBe(false);
        } else {
          expect(
            resolution.mode === "unavailable" ? null : resolution.expression,
            `${row.id}/${matrixCase.label}: invocation drifted from exposed path`,
          ).toBe(matrixCase.expect.expression);
        }
      }
    }
  });

  test("unavailable resolution never fabricates a callable and carries a reason", () => {
    const resolution = resolveInvocation(
      { executeExposed: false, catalog: [], directCallables: [] },
      { namespace: "context7", name: "resolve-library-id" },
    );
    expect(resolution.mode).toBe("unavailable");
    if (resolution.mode === "unavailable") {
      expect(resolution.reason).toMatch(/unavailable/i);
      expect(resolution.reason).toContain("context7/resolve-library-id");
    }
    // The contract itself instructs reporting absent capabilities.
    expect(MCP_ACTIVE_SURFACE_CONTRACT).toContain(
      "report an absent capability as unavailable",
    );
  });

  test("punctuated names keep their exact spelling in every form (no normalization)", () => {
    const punctuated = { namespace: "context7", name: "resolve-library-id" };
    const catalog = catalogExpression(punctuated);
    const direct = directExpression(punctuated);

    // Catalog: bracket form; hyphenated segment quoted, never dotted.
    expect(catalog).toBe('tools.context7["resolve-library-id"]');
    expect(catalog).not.toContain("tools.context7.resolve-library-id");
    // Direct: exact exposed spelling with the hyphen preserved.
    expect(direct).toBe("context7_resolve-library-id");
    // No normalized variant anywhere.
    for (const expression of [catalog, direct]) {
      expect(expression).not.toContain("resolve_library_id");
      expect(expression).toContain("resolve-library-id");
    }
    expect(isIdentifierSafe("resolve-library-id")).toBe(false);
    expect(isIdentifierSafe("search_semantic")).toBe(true);
  });

  test("identifier-safe names use dot form in the catalog and exact direct spelling", () => {
    const safe = { namespace: "lgrep", name: "search_semantic" };
    expect(catalogExpression(safe)).toBe("tools.lgrep.search_semantic");
    expect(directExpression(safe)).toBe("lgrep_search_semantic");
  });

  test("fixture discovery evidence matches the recorded runtime observations", () => {
    const evidence = fixture.rows.map((row) => row.discoveryEvidence);
    expect(evidence).toContain(
      'CodeMode primary used tools.context7["resolve-library-id"] successfully.',
    );
    expect(evidence).toContain(
      'CodeMode spawned researcher used tools.context7["resolve-library-id"] successfully.',
    );
    expect(evidence).toContain(
      "Direct mode used context7_resolve-library-id successfully after explicitly unsetting inherited CodeMode state.",
    );
    expect(
      evidence.some((entry) =>
        entry.includes("No-MCP configuration exposed no execute"),
      ),
    ).toBe(true);
  });

  test("matrix rows bind to the real corpus: adv and adv-researcher are MCP-capable contract carriers", () => {
    const effective = effectiveAgentPrompts();
    for (const name of ["adv", "adv-researcher"]) {
      const prompt = effective.find((candidate) => candidate.name === name);
      expect(prompt, `effective prompt ${name} missing`).toBeDefined();
      expect(prompt!.mcpCapable, `${name} must grant external MCP`).toBe(true);
      expect(
        prompt!.mcpGrants.some(
          (grant) => grant.key === "context7_*" && grant.allowed,
        ),
        `${name} must grant context7 (representative lookup capability)`,
      ).toBe(true);
      expect(countContractOccurrences(prompt!.text)).toBe(1);
    }
    // Representatives come from real external MCP providers.
    expect(EXTERNAL_MCP_PREFIXES).toContain("context7");
    expect(EXTERNAL_MCP_PREFIXES).toContain("lgrep");
  });

  test("fixture direct spellings are the same concrete spellings corpus prose scans forbid", () => {
    for (const row of fixture.rows) {
      for (const matrixCase of row.cases) {
        const direct = directExpression(matrixCase.capability);
        CONCRETE_MCP_SPELLING.lastIndex = 0;
        expect(
          CONCRETE_MCP_SPELLING.test(direct),
          `${direct} is not recognized as an external MCP spelling`,
        ).toBe(true);
      }
    }
  });
});

describe("MCP runtime matrix live evidence (supplemental)", () => {
  const live = loadLiveEvidence();

  function expectWellFormed(entry: LiveEvidenceFixture["rows"][number]) {
    expect(fixture.mandatoryRowIds).toContain(entry.rowId);
    expect(["pass", "fail", "skipped"]).toContain(entry.status);
    if (entry.evidenceExcerpt !== null) {
      expect(
        entry.evidenceExcerpt.length,
        `live excerpt for ${entry.rowId} exceeds bound`,
      ).toBeLessThanOrEqual(500);
    }
  }

  test("live evidence fixture, when present, is schema-coherent", () => {
    if (!live) return; // Supplemental: suite never depends on live runs.
    expect(live.generatedBy).toContain("mcp-runtime-probe");
    expect(live.generatedAt.length).toBeGreaterThan(0);
    for (const entry of live.rows) {
      expectWellFormed(entry);
      if (entry.status === "skipped") {
        expect(
          entry.reason,
          `skipped live row ${entry.rowId} needs a reason`,
        ).toBeTruthy();
      }
    }
  });

  test("only an absent live-evidence fixture is optional", () => {
    const directory = mkdtempSync(join(tmpdir(), "adv-mcp-live-evidence-"));
    const malformedPath = join(directory, "malformed.json");
    try {
      expect(loadLiveEvidence(join(directory, "missing.json"))).toBeNull();
      writeFileSync(malformedPath, "{");
      expect(() => loadLiveEvidence(malformedPath)).toThrow();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("passing live rows observed the exact exposed invocation", () => {
    if (!live) return;
    for (const entry of live.rows) {
      if (entry.status === "skipped") continue;
      // A committed fail is a real contract violation: surface it loudly.
      expect(
        entry.status,
        `live row ${entry.rowId} recorded a contract failure: ${entry.evidenceExcerpt}`,
      ).toBe("pass");

      const row = rowById(fixture.rows, entry.rowId);
      const allowed = row.cases
        .map((matrixCase) => matrixCase.expect.expression)
        .filter((expression): expression is string => Boolean(expression));

      if (entry.rowId === "codemode-no-mcp") {
        // No callable observed; the agent reported unavailability.
        expect(entry.observedInvocation).toBeNull();
        expect(entry.evidenceExcerpt ?? "").toMatch(
          /unavailable|not available/i,
        );
      } else if (entry.rowId === "exact-path-forms") {
        expect(allowed).toContain(entry.observedInvocation);
      } else {
        expect(entry.observedInvocation).toBe(
          representativeExpression(fixture, entry.rowId),
        );
      }
      expect(entry.command).toBeTruthy();
      expect(entry.ranAt).toBeTruthy();
    }
  });
});
