import * as wf from "@temporalio/workflow";
import type { ChangeWorkflowState } from "./contracts";
import { bucketCtxFromState, deriveBucket } from "../utils/buckets";

// NOTE: Temporal dev server hard-caps custom search attributes at 3 per
// `KeywordList` type per namespace. Keep KeywordList entries to ≤ 3:
// `AdvAffectedProjects`, `AdvWorktreeBranches`, `AdvWorktreePaths`.
// `AdvAffectedPaths` was previously listed here but had no production
// visibility query. Removed to fit within the Temporal dev-server limit.
// If a path-level filter is needed in the future, encode it as a single
// `Keyword` (joined value) or replace one of the other KeywordLists.
export const ADV_SEARCH_ATTRIBUTES = {
  AdvChangeId: "Keyword",
  AdvChangeStatus: "Keyword",
  AdvChangeTitle: "Keyword",
  AdvAffectedProjects: "KeywordList",
  AdvCurrentGate: "Keyword",
  AdvCurrentBucket: "Keyword",
  AdvLastSignalAt: "Datetime",
  AdvCreatedAt: "Datetime",
  AdvWorktreeBranches: "KeywordList",
  AdvWorktreePaths: "KeywordList",
} as const;

const SEARCH_ATTRIBUTE_TYPE_CODE = {
  Text: 1,
  Keyword: 2,
  Bool: 5,
  Datetime: 6,
  KeywordList: 7,
} as const;

export type AdvSearchAttributeType =
  (typeof ADV_SEARCH_ATTRIBUTES)[keyof typeof ADV_SEARCH_ATTRIBUTES];

export interface RequiredAdvSearchAttribute {
  name: keyof typeof ADV_SEARCH_ATTRIBUTES;
  type: AdvSearchAttributeType;
  typeCode: number;
}

export interface AdvSearchAttributeRegistrationResult {
  ok: boolean;
  created: RequiredAdvSearchAttribute[];
  skipped: RequiredAdvSearchAttribute[];
  refused: Array<{
    name: string;
    expected: AdvSearchAttributeType;
    expectedCode: number;
    actualCode: number | null;
  }>;
  error?: string;
}

interface SearchAttributeOperatorService {
  listSearchAttributes?: (req: { namespace: string }) => Promise<unknown>;
  addSearchAttributes?: (req: {
    namespace: string;
    searchAttributes: Record<string, number>;
  }) => Promise<unknown>;
}

export interface SearchAttributeConnectionLike {
  operatorService?: SearchAttributeOperatorService;
}

export function requiredAdvSearchAttributes(): RequiredAdvSearchAttribute[] {
  return Object.entries(ADV_SEARCH_ATTRIBUTES).map(([name, type]) => ({
    name: name as keyof typeof ADV_SEARCH_ATTRIBUTES,
    type,
    typeCode: SEARCH_ATTRIBUTE_TYPE_CODE[type],
  }));
}

function extractCustomAttributes(response: unknown): Record<string, unknown> {
  if (!response || typeof response !== "object") return {};
  const record = response as Record<string, unknown>;
  for (const key of [
    "customAttributes",
    "customSearchAttributes",
    "searchAttributes",
  ]) {
    const candidate = record[key];
    if (candidate && typeof candidate === "object") {
      return candidate as Record<string, unknown>;
    }
  }
  return {};
}

function extractIndexedValueType(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const code = record.indexedValueType ?? record.type;
  return typeof code === "number" ? code : null;
}

export async function ensureAdvSearchAttributes(
  connection: SearchAttributeConnectionLike,
  namespace: string,
): Promise<AdvSearchAttributeRegistrationResult> {
  const required = requiredAdvSearchAttributes();
  const operatorService = connection.operatorService;
  if (
    !operatorService?.listSearchAttributes ||
    !operatorService.addSearchAttributes
  ) {
    return {
      ok: false,
      created: [],
      skipped: [],
      refused: [],
      error: "OperatorService search-attribute APIs unavailable",
    };
  }

  const listed = await operatorService.listSearchAttributes({ namespace });
  const customAttributes = extractCustomAttributes(listed);
  const skipped: RequiredAdvSearchAttribute[] = [];
  const missing: RequiredAdvSearchAttribute[] = [];
  const refused: AdvSearchAttributeRegistrationResult["refused"] = [];

  for (const attr of required) {
    if (!(attr.name in customAttributes)) {
      missing.push(attr);
      continue;
    }

    const actualCode = extractIndexedValueType(customAttributes[attr.name]);
    if (actualCode === attr.typeCode) {
      skipped.push(attr);
    } else {
      refused.push({
        name: attr.name,
        expected: attr.type,
        expectedCode: attr.typeCode,
        actualCode,
      });
    }
  }

  if (refused.length > 0) return { ok: false, created: [], skipped, refused };
  if (missing.length === 0) return { ok: true, created: [], skipped, refused };

  const searchAttributes = Object.fromEntries(
    missing.map((attr) => [attr.name, attr.typeCode]),
  );
  await operatorService.addSearchAttributes({ namespace, searchAttributes });
  return { ok: true, created: missing, skipped, refused };
}

function currentGate(state: ChangeWorkflowState): string {
  for (const [gateId, gate] of Object.entries(state.gates)) {
    if (gate.status !== "done") return gateId;
  }
  return "done";
}

function dateValue(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function buildChangeSearchAttributes(
  state: ChangeWorkflowState,
  options: { nowMs?: number } = {},
): Record<string, unknown[]> {
  const nowMs =
    options.nowMs ?? Date.parse(state.lastSignalAt ?? state.createdAt);
  const attrs: Record<string, unknown[]> = {
    AdvChangeId: [state.changeId],
    AdvChangeStatus: [state.status],
    AdvChangeTitle: [state.title],
    AdvCurrentGate: [currentGate(state)],
    AdvCurrentBucket: [deriveBucket(bucketCtxFromState(state, nowMs))],
  };

  const affectedProjects =
    state.affectedProjects && state.affectedProjects.length > 0
      ? state.affectedProjects
      : state.projectId
        ? [state.projectId]
        : [];
  if (affectedProjects.length > 0) attrs.AdvAffectedProjects = affectedProjects;

  const activeWorktrees = Object.values(state.worktrees ?? {}).filter(
    (worktree) => worktree.status !== "deleted",
  );
  const worktreeBranches = activeWorktrees
    .map((worktree) => worktree.branch)
    .filter((branch): branch is string => branch.trim().length > 0)
    .sort((a, b) => a.localeCompare(b));
  const worktreePaths = activeWorktrees
    .map((worktree) => worktree.path)
    .filter((path): path is string => Boolean(path?.trim()))
    .sort((a, b) => a.localeCompare(b));
  if (worktreeBranches.length > 0) attrs.AdvWorktreeBranches = worktreeBranches;
  if (worktreePaths.length > 0) attrs.AdvWorktreePaths = worktreePaths;

  const lastSignalAt = dateValue(state.lastSignalAt);
  if (lastSignalAt) attrs.AdvLastSignalAt = [lastSignalAt];
  const createdAt = dateValue(state.createdAt);
  if (createdAt) attrs.AdvCreatedAt = [createdAt];

  return attrs;
}

export function applyAndUpsertSearchAttributes(
  state: ChangeWorkflowState,
): void {
  // Temporal's SDK type narrows custom search attributes more strictly than
  // the server wire contract exposed by OperatorService.addSearchAttributes.
  // Values are shaped per SDK runtime convention (attribute name -> value[]).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wf.upsertSearchAttributes(buildChangeSearchAttributes(state) as any);
}
