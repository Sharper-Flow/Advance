/**
 * Pure ADV machine-wide census analyzer.
 *
 * Collection of filesystem and Temporal data lives in census-live.ts. This
 * module only classifies an already-collected inventory, making the diagnostic
 * deterministic and safe to exercise without touching the live namespace.
 */

import {
  SYNTHETIC_TEST_PROJECT_ID,
  SYNTHETIC_TEST_PROJECT_ID_PREFIX,
} from "../../plugin/src/cli/projection-boundary";

const CANONICAL_ID = /^[0-9a-f]{40}$/;
const SYNTHETIC_ID = new RegExp(
  `^${SYNTHETIC_TEST_PROJECT_ID_PREFIX}[0-9a-f]{24}$`,
);
const ADV_WORKFLOW_ID = /^adv\/(change|epic)\/([^/]+)\/([^/]+)$/;

/**
 * Resolve the machine-wide data-home root that holds `opencode/` and
 * `opencode-projects/`.
 *
 * Under the `oc` per-project shard wrapper, `XDG_DATA_HOME` is itself
 * `.../opencode-projects/<shardId>`. Scanning that path directly makes the
 * census session-scoped rather than machine-wide, which turns every OTHER
 * project's store into false "store does not exist" evidence. Mirrors
 * `defaultDataHomeRoot` in `plugin/src/tools/store-consolidate.ts`.
 */
export function resolveDataHomeRoot(dataHome: string): string {
  const normalized = dataHome.replace(/\/+$/, "");
  const segments = normalized.split("/");
  const leaf = segments[segments.length - 1] ?? "";
  const parent = segments[segments.length - 2] ?? "";
  if (parent === "opencode-projects" && leaf.length > 0) {
    return segments.slice(0, -2).join("/");
  }
  return normalized;
}

export type StorePosition =
  | { kind: "legacy" }
  | { kind: "shard"; shardId: string }
  | { kind: "other"; description: string };

export interface StoreInventoryEntry {
  entry: string;
  path: string;
  resolvedPath: string;
  position: StorePosition;
}

export type CensusWorkflowType = "changeWorkflow" | "epicWorkflow";

export interface WorkflowInventoryRow {
  workflowId: string;
  workflowType: CensusWorkflowType;
  executionStatus: string;
}

export type TemporalInventoryStatus =
  | { kind: "complete" }
  | { kind: "unavailable"; error: string };

export interface CensusInventory {
  stores: StoreInventoryEntry[];
  workflows: WorkflowInventoryRow[];
  archiveChangeIds: ReadonlySet<string>;
  storeInventoryComplete: boolean;
  temporal: TemporalInventoryStatus;
}

export type CensusDimensionName =
  | "malformed_identity"
  | "synthetic_fixture"
  | "pseudo_root"
  | "fixture_project_in_live_namespace"
  | "abandoned_running_workflow";

export interface CensusFinding {
  path?: string;
  workflow_id?: string;
  classification: CensusDimensionName;
  why: string;
  identity_classification?: "malformed_identity" | "synthetic_fixture";
}

export interface CensusDimension {
  count: number;
  items: CensusFinding[];
  omitted: number;
}

export interface CensusReport {
  schema_version: "census.v1";
  source: "census";
  clean: boolean;
  exit_code: 0 | 1;
  temporal: TemporalInventoryStatus;
  dimensions: Record<CensusDimensionName, CensusDimension>;
}

export interface AnalyzeCensusOptions {
  maxItems?: number;
}

function identityClassification(
  value: string,
): "malformed_identity" | "synthetic_fixture" | null {
  if (!CANONICAL_ID.test(value)) return "malformed_identity";
  if (value === SYNTHETIC_TEST_PROJECT_ID || SYNTHETIC_ID.test(value)) {
    return "synthetic_fixture";
  }
  return null;
}

function isPseudoRoot(store: StoreInventoryEntry): boolean {
  if (store.position.kind === "other") return true;
  return (
    store.position.kind === "shard" && store.position.shardId !== store.entry
  );
}

function emptyDimensions(): Record<CensusDimensionName, CensusDimension> {
  return {
    malformed_identity: { count: 0, items: [], omitted: 0 },
    synthetic_fixture: { count: 0, items: [], omitted: 0 },
    pseudo_root: { count: 0, items: [], omitted: 0 },
    fixture_project_in_live_namespace: { count: 0, items: [], omitted: 0 },
    abandoned_running_workflow: { count: 0, items: [], omitted: 0 },
  };
}

function addFinding(
  dimensions: Record<CensusDimensionName, CensusDimension>,
  dimension: CensusDimensionName,
  finding: CensusFinding,
): void {
  dimensions[dimension].count++;
  dimensions[dimension].items.push(finding);
}

function capDimensions(
  dimensions: Record<CensusDimensionName, CensusDimension>,
  maxItems: number,
): void {
  for (const dimension of Object.values(dimensions)) {
    if (dimension.items.length <= maxItems) continue;
    dimension.omitted = dimension.items.length - maxItems;
    dimension.items = dimension.items.slice(0, maxItems);
  }
}

function uniqueStores(stores: StoreInventoryEntry[]): StoreInventoryEntry[] {
  const seen = new Set<string>();
  return stores.filter((store) => {
    if (seen.has(store.resolvedPath)) return false;
    seen.add(store.resolvedPath);
    return true;
  });
}

function parseWorkflowProjectId(workflowId: string): {
  workflowType: CensusWorkflowType;
  projectId: string;
  itemId: string;
} | null {
  const match = ADV_WORKFLOW_ID.exec(workflowId);
  if (!match) return null;
  return {
    workflowType: match[1] === "change" ? "changeWorkflow" : "epicWorkflow",
    projectId: match[2],
    itemId: match[3],
  };
}

function workflowIdentityClass(
  workflowId: string,
): "malformed_identity" | "synthetic_fixture" | null {
  const parsed = parseWorkflowProjectId(workflowId);
  if (parsed) return identityClassification(parsed.projectId);
  return workflowId.startsWith("adv/") ? "malformed_identity" : null;
}

/** Analyze a collected inventory without filesystem, network, or Temporal calls. */
export function analyzeCensus(
  inventory: CensusInventory,
  options: AnalyzeCensusOptions = {},
): CensusReport {
  const dimensions = emptyDimensions();
  const stores = uniqueStores(inventory.stores);
  const knownStoreIds = new Set(stores.map((store) => store.entry));

  for (const store of stores) {
    const identity = identityClassification(store.entry);
    if (identity === "malformed_identity") {
      addFinding(dimensions, identity, {
        path: store.path,
        classification: identity,
        why: `Store entry name "${store.entry}" is not exactly 40 lowercase hexadecimal characters.`,
      });
    } else if (identity === "synthetic_fixture") {
      addFinding(dimensions, identity, {
        path: store.path,
        classification: identity,
        why: `Store entry name "${store.entry}" matches the canonical synthetic test-project identity.`,
      });
    }
    if (isPseudoRoot(store)) {
      const reason =
        store.position.kind === "shard"
          ? `Shard id ${store.position.shardId} does not match entry ${store.entry}.`
          : store.position.kind === "other"
            ? store.position.description
            : "Store is outside a canonical ADV root shape.";
      addFinding(dimensions, "pseudo_root", {
        path: store.path,
        classification: "pseudo_root",
        why: reason,
      });
    }
  }

  for (const row of inventory.workflows) {
    if (row.executionStatus !== "Running") continue;
    const parsed = parseWorkflowProjectId(row.workflowId);
    const identity = workflowIdentityClass(row.workflowId);
    if (identity) {
      addFinding(dimensions, "fixture_project_in_live_namespace", {
        workflow_id: row.workflowId,
        classification: "fixture_project_in_live_namespace",
        identity_classification: identity,
        why:
          identity === "synthetic_fixture"
            ? "Running ADV workflow encodes a synthetic fixture project identity."
            : "Running ADV workflow has a malformed or unparseable project identity.",
      });
    }

    if (
      !parsed ||
      row.workflowType !== "changeWorkflow" ||
      parsed.workflowType !== "changeWorkflow"
    ) {
      continue;
    }
    const archiveEvidence = inventory.archiveChangeIds.has(parsed.itemId);
    const missingStoreEvidence =
      CANONICAL_ID.test(parsed.projectId) &&
      inventory.storeInventoryComplete &&
      !knownStoreIds.has(parsed.projectId);
    if (archiveEvidence || missingStoreEvidence) {
      addFinding(dimensions, "abandoned_running_workflow", {
        workflow_id: row.workflowId,
        classification: "abandoned_running_workflow",
        why: archiveEvidence
          ? `Running change workflow has positive archive-bundle evidence for change ${parsed.itemId}.`
          : `Running change workflow has positive evidence that project store ${parsed.projectId} does not exist.`,
      });
    }
  }

  const maxItems = Math.max(0, Math.floor(options.maxItems ?? 100));
  capDimensions(dimensions, maxItems);
  const findings = Object.values(dimensions).some(
    (dimension) => dimension.count > 0,
  );
  const temporalClean = inventory.temporal.kind === "complete";
  return {
    schema_version: "census.v1",
    source: "census",
    clean: !findings && temporalClean,
    exit_code: !findings && temporalClean ? 0 : 1,
    temporal: inventory.temporal,
    dimensions,
  };
}
