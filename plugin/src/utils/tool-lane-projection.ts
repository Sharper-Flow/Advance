import { execFile, type ExecFileOptions } from "node:child_process";
import {
  projectToolSchemaManifest,
  parseAgentToolPermissions,
} from "./tool-schema-projection";
import type { ToolSchemaManifest } from "./tool-schema-telemetry";
import type { ToolSchemaProjection } from "./tool-schema-projection";

function execFileAsync(
  command: string,
  args: string[],
  options: ExecFileOptions,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ stdout: stdout as string, stderr: stderr as string });
    });
  });
}

const REPRESENTATIVE_LANES = ["adv-ci-waiter", "adv-engineer"] as const;

const LANE_PERMISSION_CACHE_TTL_MS = 60_000;

interface CachedLaneProjection {
  projection: ToolSchemaProjection;
  permissions: Record<string, boolean>;
  cachedAt: number;
}

const cache = new Map<string, CachedLaneProjection>();

export function resetLaneProjectionsCache(): void {
  cache.clear();
}

async function resolveLanePermissions(
  lane: string,
): Promise<Record<string, boolean> | undefined> {
  try {
    const { stdout } = await execFileAsync(
      "opencode",
      ["debug", "agent", lane],
      { timeout: 5_000, encoding: "utf8" },
    );
    return parseAgentToolPermissions(stdout);
  } catch {
    return undefined;
  }
}

export async function getLaneProjection(
  manifest: ToolSchemaManifest,
  lane: string,
): Promise<ToolSchemaProjection> {
  const cached = cache.get(lane);
  const now = Date.now();
  if (cached && now - cached.cachedAt < LANE_PERMISSION_CACHE_TTL_MS) {
    return { ...cached.projection };
  }

  const permissions = await resolveLanePermissions(lane);
  if (permissions) {
    const projection = projectToolSchemaManifest(manifest, permissions);
    cache.set(lane, { projection, permissions, cachedAt: now });
    return { ...projection };
  }

  if (cached) {
    return { ...cached.projection, availability: "stale" };
  }

  return {
    availability: "unavailable",
    enabled_tools: 0,
    schema_bytes: 0,
    approx_tokens_4char_rule: 0,
    conversion_errors: 0,
  };
}

export async function getLaneProjections(
  manifest: ToolSchemaManifest,
): Promise<Record<string, ToolSchemaProjection>> {
  const result: Record<string, ToolSchemaProjection> = {};
  for (const lane of REPRESENTATIVE_LANES) {
    result[lane] = await getLaneProjection(manifest, lane);
  }
  return result;
}
