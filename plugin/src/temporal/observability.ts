export const ADVANCE_TEMPORAL_SEARCH_ATTRIBUTES = {
  projectId: "AdvProjectId",
  changeId: "AdvChangeId",
  changeStatus: "AdvChangeStatus",
  activeGate: "AdvActiveGate",
  doomLoop: "AdvDoomLoopActive",
} as const;

const SEARCH_ATTRIBUTE_TYPE_CODE = {
  Keyword: 1,
  Bool: 4,
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
  present: RequiredAdvSearchAttribute[];
  missing: RequiredAdvSearchAttribute[];
  wrongType: WrongTypeAdvSearchAttribute[];
  error?: string;
}

export interface AdvSearchAttributeRegistrationResult {
  ok: boolean;
  method: "operatorService.addSearchAttributes" | "unavailable";
  created: RequiredAdvSearchAttribute[];
  skipped: RequiredAdvSearchAttribute[];
  refused: WrongTypeAdvSearchAttribute[];
  error?: string;
}

interface SearchAttributeOperatorService {
  getSearchAttributes?: (req: { namespace: string }) => Promise<unknown>;
  addSearchAttributes?: (req: {
    namespace: string;
    searchAttributes: Record<string, number>;
  }) => Promise<unknown>;
}

export interface SearchAttributeConnectionLike {
  operatorService?: SearchAttributeOperatorService;
}

export function requiredAdvSearchAttributes(): RequiredAdvSearchAttribute[] {
  return [
    {
      name: ADVANCE_TEMPORAL_SEARCH_ATTRIBUTES.projectId,
      type: "Keyword",
      typeCode: SEARCH_ATTRIBUTE_TYPE_CODE.Keyword,
    },
    {
      name: ADVANCE_TEMPORAL_SEARCH_ATTRIBUTES.changeId,
      type: "Keyword",
      typeCode: SEARCH_ATTRIBUTE_TYPE_CODE.Keyword,
    },
    {
      name: ADVANCE_TEMPORAL_SEARCH_ATTRIBUTES.changeStatus,
      type: "Keyword",
      typeCode: SEARCH_ATTRIBUTE_TYPE_CODE.Keyword,
    },
    {
      name: ADVANCE_TEMPORAL_SEARCH_ATTRIBUTES.activeGate,
      type: "Keyword",
      typeCode: SEARCH_ATTRIBUTE_TYPE_CODE.Keyword,
    },
    {
      name: ADVANCE_TEMPORAL_SEARCH_ATTRIBUTES.doomLoop,
      type: "Bool",
      typeCode: SEARCH_ATTRIBUTE_TYPE_CODE.Bool,
    },
  ];
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
  if (!operatorService?.getSearchAttributes) {
    return {
      ok: false,
      present: [],
      missing: required,
      wrongType: [],
      error: "OperatorService.getSearchAttributes unavailable",
    };
  }

  try {
    // Temporal's generated operator service methods rely on `this.rpcCall`.
    // Call through the service object instead of destructuring the method.
    const response = await operatorService.getSearchAttributes({ namespace });
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
      present,
      missing,
      wrongType,
    };
  } catch (err) {
    return {
      ok: false,
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
      created: check.missing,
      skipped: check.present,
      refused: [],
    };
  } catch (err) {
    return {
      ok: false,
      method: "operatorService.addSearchAttributes",
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
  activeGate?: string;
  doomLoopActive?: boolean;
}): Record<string, unknown[]> {
  const attrs: Record<string, unknown[]> = {
    [ADVANCE_TEMPORAL_SEARCH_ATTRIBUTES.projectId]: [input.projectId],
  };

  if (input.changeId) {
    attrs[ADVANCE_TEMPORAL_SEARCH_ATTRIBUTES.changeId] = [input.changeId];
  }
  if (input.changeStatus) {
    attrs[ADVANCE_TEMPORAL_SEARCH_ATTRIBUTES.changeStatus] = [
      input.changeStatus,
    ];
  }
  if (input.activeGate) {
    attrs[ADVANCE_TEMPORAL_SEARCH_ATTRIBUTES.activeGate] = [input.activeGate];
  }
  if (input.doomLoopActive !== undefined) {
    attrs[ADVANCE_TEMPORAL_SEARCH_ATTRIBUTES.doomLoop] = [input.doomLoopActive];
  }

  return attrs;
}
