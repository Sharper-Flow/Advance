/** Read-only package/CI entry point for the reviewed dead-code ratchet. */

import { readFile } from "fs/promises";

import {
  runDeadCodeRatchet,
  type DeadCodeBaselineInput,
  type DeadCodeRatchetResult,
} from "./ratchet";
import { runSlopScan, type SlopScanOptions } from "./scan";

const CHECK_TIMEOUT_MS = 120_000;

export interface DeadCodeCheckOptions {
  repoRoot: string;
  baselinePath: string;
  requestedPath?: string;
  readBaseline?: (path: string) => Promise<unknown>;
  scan?: (options: SlopScanOptions) => Promise<unknown>;
}

function blockedResult(message: string): DeadCodeRatchetResult {
  return {
    ok: false,
    status: "blocked",
    currentFingerprints: [],
    newFindings: [],
    diagnostics: [message],
    diagnosticsTruncated: 0,
  };
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function runDeadCodeCheck(
  options: DeadCodeCheckOptions,
): Promise<DeadCodeRatchetResult> {
  const read = options.readBaseline ?? readJson;
  let baseline: unknown;
  try {
    baseline = await read(options.baselinePath);
  } catch (error) {
    return blockedResult(
      `dead-code baseline failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return runDeadCodeRatchet({
    repoRoot: options.repoRoot,
    requestedPath: options.requestedPath ?? ".",
    baseline: baseline as DeadCodeBaselineInput,
    scan:
      options.scan ??
      ((scanOptions) =>
        runSlopScan({ ...scanOptions, timeoutMs: CHECK_TIMEOUT_MS })),
  });
}

export function deadCodeCheckExitCode(result: DeadCodeRatchetResult): number {
  if (result.status === "pass") return 0;
  if (result.status === "fail") return 1;
  return 2;
}
