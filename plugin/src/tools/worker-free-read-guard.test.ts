/**
 * Structural worker-free guard for routine host-tool read paths (AC5).
 *
 * Designated routine reads must not import or invoke workflow handle/query
 * constructs as a prerequisite to rendering base read facts. Mutation handlers
 * and the CLI status table are intentionally out of scope: they retain their
 * own separate safety tests.
 */

import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");

interface ReadHandlerBoundary {
  tool: string;
  file: string;
  startMarker: string;
  endMarker: string;
}

/**
 * Boundaries of routine host-tool read handlers inside mixed read+mutation
 * modules. Scoping to the handler block lets mutation handlers keep using
 * workflow queries/signals while the routine read path stays worker-free.
 */
const ROUTINE_READ_HANDLERS: ReadHandlerBoundary[] = [
  {
    tool: "adv_change_list",
    file: "plugin/src/tools/change.ts",
    startMarker: "adv_change_list: {",
    endMarker: "adv_change_show: {",
  },
  {
    tool: "adv_change_show",
    file: "plugin/src/tools/change.ts",
    startMarker: "adv_change_show: {",
    endMarker: "adv_change_create: {",
  },
  {
    tool: "adv_gate_status",
    file: "plugin/src/tools/gate.ts",
    startMarker: "adv_gate_status: {",
    endMarker: "adv_gate_complete: {",
  },
  {
    tool: "adv_epic_list",
    file: "plugin/src/tools/epic.ts",
    startMarker: "adv_epic_list: {",
    endMarker: "adv_epic_update: {",
  },
  {
    tool: "adv_epic_show",
    file: "plugin/src/tools/epic.ts",
    startMarker: "adv_epic_show: {",
    endMarker: "adv_epic_list: {",
  },
];

/**
 * Tokens that construct or invoke a per-change workflow handle/query. These
 * are the constructs that would make a routine read depend on a live worker.
 */
const WORKFLOW_QUERY_FORBIDDEN = [
  "getChangeHandle(",
  ".query(",
  "querySignal(",
  "fireSignal(",
  "fireSignalAndRefresh(",
  "waitForGateCompletion(",
  "workflow.getHandle(",
  "client.workflow.getHandle(",
  "CHANGE_WORKFLOW_QUERY_NAMES",
];

function extractHandlerSource(boundary: ReadHandlerBoundary): string {
  const source = readFileSync(resolve(REPO_ROOT, boundary.file), "utf8");
  const start = source.indexOf(boundary.startMarker);
  if (start < 0) {
    throw new Error(
      `Start marker ${boundary.startMarker} not found in ${boundary.file}`,
    );
  }
  const end = source.indexOf(
    boundary.endMarker,
    start + boundary.startMarker.length,
  );
  if (end < 0) {
    throw new Error(
      `End marker ${boundary.endMarker} not found in ${boundary.file} after ${boundary.startMarker}`,
    );
  }
  return source.slice(start, end);
}

function findForbiddenTokens(source: string): string[] {
  return WORKFLOW_QUERY_FORBIDDEN.filter((token) => source.includes(token));
}

describe("worker-free structural guard for routine host-tool reads", () => {
  test.each(ROUTINE_READ_HANDLERS)(
    "$tool handler block contains no workflow handle/query constructs",
    (boundary) => {
      const block = extractHandlerSource(boundary);
      const found = findForbiddenTokens(block);
      expect(found).toEqual([]);
    },
  );

  test("guard catches workflow-query constructs in a fixture", () => {
    const fixture = `
      adv_fixture: {
        execute: async () => {
          const handle = getChangeHandle(client, projectId, changeId);
          return handle.query(getStateQuery);
        },
      },
      adv_next: {
    `;
    const found = findForbiddenTokens(fixture);
    expect(found).toEqual(
      expect.arrayContaining(["getChangeHandle(", ".query("]),
    );
  });

  test("guard boundaries exist and are non-empty", () => {
    for (const boundary of ROUTINE_READ_HANDLERS) {
      const block = extractHandlerSource(boundary);
      expect(block.length).toBeGreaterThan(0);
      expect(block).toContain("execute:");
    }
  });
});
