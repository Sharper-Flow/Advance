import type { Epic } from "./index";

export interface EpicInput {
  projectId: string;
  epicId: string;
  title: string;
  narrative: string;
  initializedAt: string;
  seedState?: Partial<
    Pick<
      EpicState,
      "epic" | "status" | "idempotencyLedger" | "lastSignalAt" | "rejections"
    >
  >;
}

export interface EpicSignalRejection {
  signalName: string;
  errorMessage: string;
  payloadDigest: {
    payload_size: number;
    payload_sample: string;
    payload_fnv1a: string;
  };
  rejectedAt: string;
}

export interface EpicState extends EpicInput {
  id: string;
  status: "active" | "archived" | "merged";
  epic: Epic;
  idempotencyLedger: Record<string, { processedAt: string; outcome: string }>;
  lastSignalAt?: string;
  rejections?: EpicSignalRejection[];
}

export function createEpicState(input: EpicInput): EpicState {
  const now = input.initializedAt;
  const epic: Epic = {
    id: input.epicId,
    title: input.title,
    narrative: input.narrative,
    entries: [],
    progress: {
      status: "active",
      total_entries: 0,
      completed_entries: 0,
      active_entries: 0,
      next_entry_id: null,
      updated_at: now,
    },
    created_at: now,
    updated_at: now,
    version: 0,
  };
  return {
    ...input,
    id: input.epicId,
    status: "active",
    epic,
    idempotencyLedger: {},
  };
}

export function buildEpicSeedState(
  state: EpicState,
): NonNullable<EpicInput["seedState"]> {
  return {
    epic: JSON.parse(JSON.stringify(state.epic)) as Epic,
    status: state.status,
    idempotencyLedger: { ...state.idempotencyLedger },
    lastSignalAt: state.lastSignalAt,
    rejections: state.rejections ? [...state.rejections] : undefined,
  };
}
