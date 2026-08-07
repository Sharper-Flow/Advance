/**
 * Host-only SHA-256 authority for tool and command idempotency identities.
 *
 * This module is a host-side helper and must stay outside runtime adapters.
 * `canonicalCommandPayloadString` remains workflow-safe so the host and legacy
 * workflow fallback agree on exactly which transport fields are excluded.
 */
import { createHash } from "node:crypto";
import { canonicalCommandPayloadString, stableStringify } from "./digest";

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function computeHostCommandPayloadHash(payload: unknown): string {
  return sha256Hex(canonicalCommandPayloadString(payload));
}

export function computeHostCanonicalHash(value: unknown): string {
  return sha256Hex(stableStringify(value));
}
