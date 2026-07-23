#!/usr/bin/env node
/**
 * CI SDK-parity drift guard.
 *
 * Compares the @opencode-ai/plugin version resolved in plugin/pnpm-lock.yaml
 * against the latest version published on npm. Fails CI when the lockfile
 * silently lags behind npm latest (major mismatch or minor < latest minor).
 *
 * Network behavior:
 * - CI=true  → registry outage is a HARD FAIL (exit 1).
 * - non-CI   → print SDK_PARITY_SKIP and exit 0.
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const NPM_LATEST_URL = "https://registry.npmjs.org/@opencode-ai/plugin/latest";

export interface ResolvedImporter {
  specifier: string;
  version: string;
}

export interface VersionParts {
  major: number;
  minor: number;
  patch: number;
  raw: string;
}

export interface ParityResult {
  ok: boolean;
  reason?: string;
}

export interface NetworkAction {
  action: "fail" | "skip";
  message: string;
}

export function parseVersion(raw: string): VersionParts {
  // Accept clean SemVer plus pnpm-style peer suffixes such as 1.18.4(react@18).
  const match = raw.match(
    /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?(?:\([^)]*\))?$/,
  );
  if (!match) {
    throw new Error(
      `SDK_PARITY_BAD_VERSION: "${raw}" is not SemVer-shaped`,
    );
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    raw,
  };
}

export function resolveLockedPluginVersion(text: string): ResolvedImporter {
  let doc: unknown;
  try {
    doc = parse(text);
  } catch (err) {
    throw new Error(
      `SDK_PARITY_MALFORMED_LOCKFILE: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const root = doc as Record<string, unknown> | null;
  const importers = root?.importers as Record<string, unknown> | undefined;
  const importer = importers?.["."] as Record<string, unknown> | undefined;
  if (!importer) {
    throw new Error(
      "SDK_PARITY_MALFORMED_LOCKFILE: missing default importer block",
    );
  }

  const dependencies = importer.dependencies as
    | Record<string, { specifier?: string; version?: string }>
    | undefined;
  const entry = dependencies?.["@opencode-ai/plugin"];
  if (!entry || typeof entry.version !== "string") {
    throw new Error(
      "SDK_PARITY_MISSING_IMPORTER: no resolved @opencode-ai/plugin entry in lockfile",
    );
  }

  return {
    specifier: entry.specifier ?? "",
    version: entry.version,
  };
}

export function compareSdkParity(
  locked: Pick<VersionParts, "major" | "minor">,
  latest: Pick<VersionParts, "major" | "minor">,
): ParityResult {
  if (locked.major !== latest.major) {
    return {
      ok: false,
      reason: `SDK_PARITY_MAJOR_MISMATCH: lockfile ${locked.major}.${locked.minor} vs latest ${latest.major}.${latest.minor}`,
    };
  }
  if (locked.minor < latest.minor) {
    return {
      ok: false,
      reason: `SDK_PARITY_MINOR_LAG: lockfile ${locked.major}.${locked.minor} < latest ${latest.major}.${latest.minor}`,
    };
  }
  return {
    ok: true,
    reason: `lockfile ${locked.major}.${locked.minor} >= latest ${latest.major}.${latest.minor}`,
  };
}

export function decideNetworkAction(ci: boolean): NetworkAction {
  if (ci) {
    return {
      action: "fail",
      message: "SDK_PARITY_FAIL (registry unreachable in CI)",
    };
  }
  return {
    action: "skip",
    message: "SDK_PARITY_SKIP (registry unreachable)",
  };
}

export async function fetchLatestPluginVersion(
  url = NPM_LATEST_URL,
  attempts = 2,
  timeoutMs = 2000,
): Promise<string> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);

      if (!response.ok) {
        throw new Error(`registry HTTP ${response.status}`);
      }
      const body = (await response.json()) as { version?: unknown };
      if (typeof body.version !== "string") {
        throw new Error("registry response missing version field");
      }
      return body.version;
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(
    `SDK_PARITY_REGISTRY_FAIL: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

export interface RunCheckOptions {
  lockfilePath?: string;
  registryUrl?: string;
  ci?: boolean;
}

export async function runCheck(options: RunCheckOptions = {}): Promise<void> {
  const ci = options.ci ?? isCi();
  const lockfilePath = options.lockfilePath ?? defaultLockfilePath();
  const lockText = readFileSync(lockfilePath, "utf8");
  const locked = resolveLockedPluginVersion(lockText);
  const lockedVersion = parseVersion(locked.version);

  let latestVersionRaw: string;
  try {
    latestVersionRaw = await fetchLatestPluginVersion(options.registryUrl);
  } catch (err) {
    const { action, message } = decideNetworkAction(ci);
    if (action === "fail") {
      throw new Error(
        `${message}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    console.log(message);
    process.exit(0);
    return;
  }

  const latestVersion = parseVersion(latestVersionRaw);
  const result = compareSdkParity(lockedVersion, latestVersion);
  if (!result.ok) {
    throw new Error(
      `SDK_PARITY_FAIL: ${result.reason} (${locked.version} vs ${latestVersionRaw})`,
    );
  }
  console.log(`SDK_PARITY_OK: ${locked.version} >= ${latestVersion.raw}`);
}

function isCi(): boolean {
  return process.env.CI === "true" || process.env.CI === "1";
}

function defaultLockfilePath(): string {
  return resolve(
    join(dirname(fileURLToPath(import.meta.url)), "..", "pnpm-lock.yaml"),
  );
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  runCheck()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
