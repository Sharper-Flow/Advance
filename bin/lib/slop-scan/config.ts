/** adv CLI — slop scan config parsing */

import { readFile } from "fs/promises";
import { join } from "path";

export interface SlopScanConfig {
  nesting_depth_threshold: number;
  defensive_guard_threshold: number;
  complexity_threshold: number;
  ast_timeout_ms: number;
}

export const DEFAULT_SLOP_SCAN_CONFIG: SlopScanConfig = {
  nesting_depth_threshold: 4,
  defensive_guard_threshold: 3,
  complexity_threshold: 10,
  ast_timeout_ms: 10000,
};

export type SlopScanConfigResult =
  | { ok: true; config: SlopScanConfig; warnings: string[] }
  | { ok: false; config: SlopScanConfig; warnings: string[]; errors: string[] };

const CANONICAL_KEYS = new Set(Object.keys(DEFAULT_SLOP_SCAN_CONFIG));
const LEGACY_KEYS: Record<string, keyof SlopScanConfig> = {
  nesting_depth: "nesting_depth_threshold",
  defensive_guard: "defensive_guard_threshold",
  complexity: "complexity_threshold",
};

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function parseSlopScanConfig(raw: unknown): SlopScanConfigResult {
  const config: SlopScanConfig = { ...DEFAULT_SLOP_SCAN_CONFIG };
  const warnings: string[] = [];
  const errors: string[] = [];

  if (raw === undefined || raw === null) return { ok: true, config, warnings };
  if (!isObject(raw)) {
    return {
      ok: false,
      config,
      warnings,
      errors: ["features.slop_scan must be an object"],
    };
  }

  for (const [key, value] of Object.entries(raw)) {
    const legacyTarget = LEGACY_KEYS[key];
    const target = (legacyTarget ?? key) as keyof SlopScanConfig;
    if (legacyTarget) {
      warnings.push(`features.slop_scan.${key} is deprecated; use ${legacyTarget}`);
    } else if (!CANONICAL_KEYS.has(key)) {
      warnings.push(`features.slop_scan.${key} is unknown and was ignored`);
      continue;
    }

    if (!positiveInteger(value)) {
      errors.push(`features.slop_scan.${key} must be a positive integer`);
      continue;
    }
    config[target] = value;
  }

  return errors.length > 0
    ? { ok: false, config, warnings, errors }
    : { ok: true, config, warnings };
}

export async function readSlopScanConfig(repoRoot: string): Promise<SlopScanConfigResult> {
  let raw: string;
  try {
    raw = await readFile(join(repoRoot, "project.json"), "utf8");
  } catch {
    return parseSlopScanConfig(undefined);
  }

  try {
    const parsed = JSON.parse(raw) as { features?: { slop_scan?: unknown } };
    return parseSlopScanConfig(parsed.features?.slop_scan);
  } catch (err) {
    return {
      ok: false,
      config: { ...DEFAULT_SLOP_SCAN_CONFIG },
      warnings: [],
      errors: [`project.json is not valid JSON: ${(err as Error).message}`],
    };
  }
}
