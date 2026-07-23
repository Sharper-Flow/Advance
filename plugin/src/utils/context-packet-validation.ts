import {
  FutureWorkContextPacket,
  FutureWorkContextPacketSchema,
} from "../types/future-work.js";

const PACKET_SIZE_LIMIT = 16384; // 16 KiB
const EPIC_AGGREGATE_LIMIT = 262144; // 256 KiB

/**
 * Thrown when a single serialized context packet exceeds the per-packet size
 * budget (AC3).
 */
export class ContextPacketTooLargeError extends Error {
  readonly actualBytes: number;

  constructor(actualBytes: number) {
    super(
      `Context packet size ${actualBytes} bytes exceeds limit of ${PACKET_SIZE_LIMIT} bytes`,
    );
    this.name = "ContextPacketTooLargeError";
    this.actualBytes = actualBytes;
  }
}

/**
 * Thrown when the sum of serialized context packets across an Epic's entries
 * exceeds the aggregate budget (C1).
 */
export class EpicAggregatePacketsExceededError extends Error {
  readonly actualBytes: number;
  readonly limit: number;

  constructor(actualBytes: number, limit: number) {
    super(
      `Epic aggregate context packet size ${actualBytes} bytes exceeds limit of ${limit} bytes`,
    );
    this.name = "EpicAggregatePacketsExceededError";
    this.actualBytes = actualBytes;
    this.limit = limit;
  }
}

/**
 * Parses and validates an unknown value as a {@link FutureWorkContextPacket}.
 * Rethrows Zod validation errors unchanged.
 */
export function parsePacket(input: unknown): FutureWorkContextPacket {
  return FutureWorkContextPacketSchema.parse(input);
}

/**
 * Asserts that a single serialized packet is within the 16 KiB budget.
 *
 * Precondition: `packet` has already passed {@link parsePacket}.
 */
export function assertPacketSize(packet: FutureWorkContextPacket): void {
  const actualBytes = Buffer.byteLength(JSON.stringify(packet), "utf8");
  if (actualBytes > PACKET_SIZE_LIMIT) {
    throw new ContextPacketTooLargeError(actualBytes);
  }
}

/**
 * Asserts that the aggregate serialized size of context packets across an Epic's
 * entries (plus an optional incoming byte count) is within the 256 KiB budget.
 *
 * Entries without a `context_packet` contribute 0 bytes.
 */
export function assertEpicAggregatePackets(
  entries: ReadonlyArray<{ context_packet?: FutureWorkContextPacket }>,
  incomingBytes = 0,
): void {
  const aggregateBytes =
    entries.reduce((sum, entry) => {
      const packet = entry.context_packet ?? {};
      return sum + Buffer.byteLength(JSON.stringify(packet), "utf8");
    }, 0) + incomingBytes;

  if (aggregateBytes > EPIC_AGGREGATE_LIMIT) {
    throw new EpicAggregatePacketsExceededError(
      aggregateBytes,
      EPIC_AGGREGATE_LIMIT,
    );
  }
}
