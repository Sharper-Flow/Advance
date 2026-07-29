#!/usr/bin/env bun
/**
 * opt-scan — optimization candidate scanner CLI
 *
 * Thin shell over `bin/lib/opt-scan/bridge.ts`. Parses argv using
 * `node:util` `parseArgs` (matches `bin/arch-scan.ts` convention; no yargs
 * dep), delegates to {@link runOptBridge}, and renders the result via
 * {@link renderReport}.
 *
 * Exit codes:
 *   0 — scan completed (regardless of candidate count)
 *   1 — bridge-level error (missing repo, scan crash). Discriminated from
 *       a healthy run by a synthetic degraded coverage entry carrying the
 *       {@link BRIDGE_DEGRADED_ID} sentinel id.
 *   2 — argv parse failure or invalid flag value
 *
 * Runtime: Bun 1.3+. Dependencies: Bun built-ins only.
 */

import { parseArgs } from "node:util";

import { runOptBridge, BRIDGE_DEGRADED_ID } from "./lib/opt-scan/bridge";
import { renderReport } from "./lib/opt-scan/report";
import type { BridgeOptions } from "./lib/opt-scan/bridge";

type Phase = 1 | 3 | "all";

interface CliOptions extends BridgeOptions {
  readonly format: "text" | "json";
}

const USAGE = `Usage: opt-scan [options] [repoRoot]

Options:
  --format <text|json>            Output format (default: json)
  --phase <1|3|all>               Detection phase filter (default: all)
  --detector-id <id>              Narrow to a single detector id
  --regex-timeout-ms <n>          Per-pattern regex budget in ms (default: 5000)
  -h, --help                      Show this help

Positional <repoRoot> defaults to the current working directory.

Exit codes:
  0  scan completed
  1  bridge error (missing repo, scan crash)
  2  invalid arguments
`;

interface ParsedArgs {
  readonly format: "text" | "json";
  readonly phase: Phase;
  readonly detectorId?: string;
  readonly regexTimeoutMs: number;
  readonly repoRoot: string;
  readonly help: boolean;
}

type ParseOutcome =
  | { readonly kind: "ok"; readonly args: ParsedArgs }
  | { readonly kind: "usage"; readonly message: string }
  | { readonly kind: "help" };

function parseCliArgs(argv: string[]): ParseOutcome {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        format: { type: "string", default: "json" },
        phase: { type: "string", default: "all" },
        "detector-id": { type: "string" },
        "regex-timeout-ms": { type: "string", default: "5000" },
        help: { type: "boolean", short: "h" },
      },
      allowPositionals: true,
      strict: true,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { kind: "usage", message: msg };
  }

  if (parsed.values.help) {
    return { kind: "help" };
  }

  const format = parsed.values.format;
  if (format !== "text" && format !== "json") {
    return {
      kind: "usage",
      message: `--format must be 'text' or 'json' (got '${format}')`,
    };
  }

  const phaseRaw = parsed.values.phase;
  let phase: Phase;
  if (phaseRaw === "1") {
    phase = 1;
  } else if (phaseRaw === "3") {
    phase = 3;
  } else if (phaseRaw === "all") {
    phase = "all";
  } else {
    return {
      kind: "usage",
      message: `--phase must be '1', '3', or 'all' (got '${phaseRaw}')`,
    };
  }

  const timeoutRaw = parsed.values["regex-timeout-ms"];
  const timeoutNum = Number(timeoutRaw);
  if (
    !Number.isFinite(timeoutNum) ||
    timeoutNum <= 0 ||
    !Number.isInteger(timeoutNum)
  ) {
    return {
      kind: "usage",
      message: `--regex-timeout-ms must be a positive integer (got '${timeoutRaw}')`,
    };
  }

  const repoRoot = parsed.positionals[0] ?? process.cwd();
  const detectorId = parsed.values["detector-id"];

  return {
    kind: "ok",
    args: {
      format,
      phase,
      detectorId,
      regexTimeoutMs: timeoutNum,
      repoRoot,
      help: false,
    },
  };
}

async function run(argv: string[]): Promise<number> {
  const outcome = parseCliArgs(argv);

  if (outcome.kind === "help") {
    process.stdout.write(USAGE);
    return 0;
  }

  if (outcome.kind === "usage") {
    process.stderr.write(`opt-scan: ${outcome.message}\n`);
    process.stderr.write(USAGE);
    return 2;
  }

  const parsed = outcome.args;
  const options: CliOptions = {
    repoRoot: parsed.repoRoot,
    phase: parsed.phase,
    detectorId: parsed.detectorId,
    regexTimeoutMs: parsed.regexTimeoutMs,
    format: parsed.format,
  };

  const result = await runOptBridge(options);

  const output = renderReport(result, options.format);
  process.stdout.write(output);
  if (!output.endsWith("\n")) {
    process.stdout.write("\n");
  }

  const bridgeFailed = result.coverage.some(
    (d) => d.id === BRIDGE_DEGRADED_ID && d.state === "degraded",
  );
  return bridgeFailed ? 1 : 0;
}

const code = await run(process.argv.slice(2));

process.stdout.end(() => process.exit(code));
