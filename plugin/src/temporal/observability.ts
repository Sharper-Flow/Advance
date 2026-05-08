import { ADV_SEARCH_ATTRIBUTES } from "./search-attributes";

export { ADVANCE_TEMPORAL_SEARCH_ATTRIBUTES } from "./contracts";

// Numeric IndexedValueType codes from temporal/api/enums/v1/common.proto.
// Source: https://github.com/temporalio/api/blob/master/temporal/api/enums/v1/common.proto
//   INDEXED_VALUE_TYPE_KEYWORD = 2
//   INDEXED_VALUE_TYPE_BOOL    = 5
//   INDEXED_VALUE_TYPE_DATETIME = 6
//   INDEXED_VALUE_TYPE_KEYWORD_LIST = 7
// The Temporal operator service expects these exact numeric codes when
// registering search attributes via OperatorService.addSearchAttributes.
// Drift is caught by the "uses canonical Temporal IndexedValueType numeric
// codes" test in observability.test.ts.
const SEARCH_ATTRIBUTE_TYPE_CODE = {
  Keyword: 2,
  Bool: 5,
  Datetime: 6,
  KeywordList: 7,
} as const;

export type AdvSearchAttributeType = keyof typeof SEARCH_ATTRIBUTE_TYPE_CODE;

export interface RequiredAdvSearchAttribute {
  name: string;
  type: AdvSearchAttributeType;
  typeCode: number;
}

export interface WrongTypeAdvSearchAttribute {
  name: string;
  expected: AdvSearchAttributeType;
  expectedCode: number;
  actualCode: number | null;
}

export interface AdvSearchAttributeCheckResult {
  ok: boolean;
  verificationStatus: "verified" | "unverified";
  present: RequiredAdvSearchAttribute[];
  missing: RequiredAdvSearchAttribute[];
  wrongType: WrongTypeAdvSearchAttribute[];
  error?: string;
}

export interface AdvSearchAttributeRegistrationResult {
  ok: boolean;
  method: "operatorService.addSearchAttributes" | "unavailable";
  verificationStatus: "verified" | "unverified";
  created: RequiredAdvSearchAttribute[];
  skipped: RequiredAdvSearchAttribute[];
  refused: WrongTypeAdvSearchAttribute[];
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
    name,
    type,
    typeCode: SEARCH_ATTRIBUTE_TYPE_CODE[type],
  }));
}

function extractCustomAttributes(
  response: unknown,
): Record<string, unknown> | null {
  if (!response || typeof response !== "object") return null;
  const record = response as Record<string, unknown>;
  const candidates = [
    record.customAttributes,
    record.customSearchAttributes,
    record.searchAttributes,
  ];
  for (const candidate of candidates) {
    if (candidate && typeof candidate === "object") {
      return candidate as Record<string, unknown>;
    }
  }
  return null;
}

function extractIndexedValueType(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const code = record.indexedValueType ?? record.type;
  return typeof code === "number" ? code : null;
}

export async function checkAdvSearchAttributes(
  connection: SearchAttributeConnectionLike,
  namespace: string,
): Promise<AdvSearchAttributeCheckResult> {
  const required = requiredAdvSearchAttributes();
  const operatorService = connection.operatorService;
  if (!operatorService?.listSearchAttributes) {
    return {
      ok: false,
      verificationStatus: "unverified",
      present: [],
      missing: required,
      wrongType: [],
      error: "OperatorService.listSearchAttributes unavailable",
    };
  }

  try {
    // Temporal's generated operator service methods rely on `this.rpcCall`.
    // Call through the service object instead of destructuring the method.
    const response = await operatorService.listSearchAttributes({ namespace });
    const customAttributes = extractCustomAttributes(response) ?? {};
    const present: RequiredAdvSearchAttribute[] = [];
    const missing: RequiredAdvSearchAttribute[] = [];
    const wrongType: WrongTypeAdvSearchAttribute[] = [];

    for (const attr of required) {
      if (!(attr.name in customAttributes)) {
        missing.push(attr);
        continue;
      }
      const actualCode = extractIndexedValueType(customAttributes[attr.name]);
      if (actualCode === attr.typeCode) {
        present.push(attr);
      } else {
        wrongType.push({
          name: attr.name,
          expected: attr.type,
          expectedCode: attr.typeCode,
          actualCode,
        });
      }
    }

    return {
      ok: missing.length === 0 && wrongType.length === 0,
      verificationStatus: "verified",
      present,
      missing,
      wrongType,
    };
  } catch (err) {
    return {
      ok: false,
      verificationStatus: "unverified",
      present: [],
      missing: required,
      wrongType: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function registerMissingAdvSearchAttributes(
  connection: SearchAttributeConnectionLike,
  namespace: string,
): Promise<AdvSearchAttributeRegistrationResult> {
  const check = await checkAdvSearchAttributes(connection, namespace);
  const operatorService = connection.operatorService;

  if (check.wrongType.length > 0) {
    return {
      ok: false,
      method: "operatorService.addSearchAttributes",
      verificationStatus: check.verificationStatus,
      created: [],
      skipped: check.present,
      refused: check.wrongType,
      error: "Required ADV search attributes exist with wrong Temporal type",
    };
  }

  if (check.missing.length === 0) {
    return {
      ok: check.ok,
      method: operatorService?.addSearchAttributes
        ? "operatorService.addSearchAttributes"
        : "unavailable",
      verificationStatus: check.verificationStatus,
      created: [],
      skipped: check.present,
      refused: [],
      error: check.error,
    };
  }

  if (!operatorService?.addSearchAttributes) {
    return {
      ok: false,
      method: "unavailable",
      verificationStatus: check.verificationStatus,
      created: [],
      skipped: check.present,
      refused: [],
      error: "OperatorService.addSearchAttributes unavailable",
    };
  }

  const searchAttributes = Object.fromEntries(
    check.missing.map((attr) => [attr.name, attr.typeCode]),
  );

  try {
    // Temporal's generated operator service methods rely on `this.rpcCall`.
    // Call through the service object instead of destructuring the method.
    await operatorService.addSearchAttributes({ namespace, searchAttributes });
    return {
      ok: true,
      method: "operatorService.addSearchAttributes",
      verificationStatus: check.verificationStatus,
      created: check.missing,
      skipped: check.present,
      refused: [],
    };
  } catch (err) {
    return {
      ok: false,
      method: "operatorService.addSearchAttributes",
      verificationStatus: check.verificationStatus,
      created: [],
      skipped: check.present,
      refused: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function buildTemporalSearchAttributes(input: {
  projectId: string;
  changeId?: string;
  changeStatus?: string;
  changeTitle?: string;
  activeGate?: string;
  currentBucket?: string;
  lastSignalAt?: string;
  createdAt?: string;
  affectedProjects?: string[];
  affectedPaths?: string[];
  worktreeBranches?: string[];
  worktreePaths?: string[];
  doomLoopActive?: boolean;
}): Record<string, unknown[]> {
  const attrs: Record<string, unknown[]> = {};

  if (input.changeId) {
    attrs.AdvChangeId = [input.changeId];
  }
  if (input.changeStatus) {
    attrs.AdvChangeStatus = [input.changeStatus];
  }
  if (input.changeTitle) {
    attrs.AdvChangeTitle = [input.changeTitle];
  }
  attrs.AdvAffectedProjects = input.affectedProjects?.length
    ? input.affectedProjects
    : [input.projectId];
  if (input.activeGate) {
    attrs.AdvCurrentGate = [input.activeGate];
  }
  if (input.currentBucket) {
    attrs.AdvCurrentBucket = [input.currentBucket];
  }
  if (input.lastSignalAt) {
    attrs.AdvLastSignalAt = [new Date(input.lastSignalAt)];
  }
  if (input.createdAt) {
    attrs.AdvCreatedAt = [new Date(input.createdAt)];
  }
  if (input.worktreeBranches?.length) {
    attrs.AdvWorktreeBranches = [...input.worktreeBranches].sort((a, b) =>
      a.localeCompare(b),
    );
  }
  if (input.worktreePaths?.length) {
    attrs.AdvWorktreePaths = [...input.worktreePaths].sort((a, b) =>
      a.localeCompare(b),
    );
  }

  return attrs;
}
