import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { ADV_TOOL_NAMES } from "./tool-registry";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MATRIX_DOC = join(REPO_ROOT, "docs/tool-ownership.md");
const SPEC_JSON = join(REPO_ROOT, ".adv/specs/advance-meta/spec.json");

const CLASSES = ["orchestrator", "operator-only", "dual"] as const;

// rq-toolOwnership01.2: named operator-only maintenance set plus the
// extended approval-gated recovery family documented in the matrix.
const OPERATOR_ONLY_TOOLS = [
  "adv_archive_purge",
  "adv_archive_repair",
  "adv_store_cleanup",
  "adv_store_consolidate",
  "adv_snapshot_health",
  "adv_temporal_worker_restart",
  "adv_conformance",
  "adv_change_status_repair",
  "adv_change_repair_origin",
  "adv_change_workflow_terminate",
  "adv_temporal_register_search_attributes",
] as const;

// rq-toolOwnership01.3: read actions agent-reachable; mutation/refresh
// surfaces operator-owned.
const DUAL_TOOLS = [
  "adv_status",
  "adv_project_metadata",
  "adv_wip_state",
  "adv_session_list",
  "adv_session_show",
] as const;

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function requirement(id: string): {
  id: string;
  priority: string;
  body: string;
  scenarios: Array<{ id: string; when: string; then: string[] }>;
} {
  const spec = JSON.parse(read(SPEC_JSON));
  const req = spec.requirements.find((r: { id: string }) => r.id === id);
  expect(req, `${id} must exist`).toBeTruthy();
  return req;
}

// AC7/C5: each registered tool has an explicit ownership/reachability
// classification; maintenance tools stay operator-only and non-routine.
describe("tool ownership matrix assets (AC7/C5, rq-toolOwnership01)", () => {
  const matrixContent = read(MATRIX_DOC);
  const lines = matrixContent.split("\n");

  test("docs/tool-ownership.md exists, cites rq-toolOwnership01, and defines all three classes", () => {
    expect(matrixContent.length).toBeGreaterThan(0);
    expect(matrixContent).toContain("rq-toolOwnership01");
    expect(matrixContent).toContain("ADV_TOOL_NAMES");
    for (const cls of CLASSES) {
      expect(matrixContent).toContain(`\`${cls}\``);
    }
  });

  test("every ADV_TOOL_NAMES entry has a matrix row with a classification", () => {
    const missing: string[] = [];
    for (const tool of ADV_TOOL_NAMES) {
      const found = lines.some(
        (line) =>
          line.includes(tool) && CLASSES.some((cls) => line.includes(cls)),
      );
      if (!found) missing.push(tool);
    }
    expect(
      missing,
      `docs/tool-ownership.md missing classification rows for tools: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  test("operator-only maintenance and recovery tools are classified operator-only", () => {
    for (const tool of OPERATOR_ONLY_TOOLS) {
      const found = lines.some(
        (line) => line.includes(tool) && line.includes("operator-only"),
      );
      expect(found, `${tool} must have an operator-only matrix row`).toBe(true);
    }
  });

  test("dual tools are classified dual with read/mutate split", () => {
    for (const tool of DUAL_TOOLS) {
      const found = lines.some(
        (line) => line.includes(tool) && line.includes("dual"),
      );
      expect(found, `${tool} must have a dual matrix row`).toBe(true);
    }
    expect(matrixContent).toMatch(/Read:\s*agent;\s*mutate:\s*operator/);
  });

  test("rq-toolOwnership01 is a MUST naming the matrix doc, registry anchor, and operator-only posture", () => {
    const req = requirement("rq-toolOwnership01");
    expect(req.priority).toBe("must");
    expect(req.body).toContain("docs/tool-ownership.md");
    expect(req.body).toContain("ADV_TOOL_NAMES");
    expect(req.body).toContain("orchestrator");
    expect(req.body).toContain("operator-only");
    expect(req.body).toContain("dual");
    for (const tool of [
      "adv_archive_purge",
      "adv_archive_repair",
      "adv_store_cleanup",
      "adv_store_consolidate",
      "adv_snapshot_health#repair",
      "adv_temporal_worker_restart",
      "adv_conformance#override",
    ]) {
      expect(req.body).toContain(tool);
    }
    expect(req.body).toMatch(/never become routine autonomous agent actions/i);
  });

  test("rq-toolOwnership01 scenarios cover registry coverage, operator-only posture, and dual split", () => {
    const req = requirement("rq-toolOwnership01");
    const ids = req.scenarios.map((s) => s.id);
    for (const suffix of [".1", ".2", ".3"]) {
      expect(ids).toContain(`rq-toolOwnership01${suffix}`);
    }
    const allThen = req.scenarios.flatMap((s) => s.then).join("\n");
    expect(allThen).toContain("docs/tool-ownership.md");
    expect(allThen).toMatch(/fails CI/);
    expect(allThen).toMatch(/explicit operator instruction/);
    expect(allThen).toMatch(/[Rr]ead actions are agent-reachable/);
  });
});
