#!/usr/bin/env bun
/**
 * arch-scan — capability-consistency scanner CLI
 *
 * Thin shell over `bin/lib/arch-scan/bridge.ts`. Parses argv using
 * `node:util` `parseArgs` (matches `bin/adv` convention; no yargs dep),
 * delegates to {@link runCapabilityBridge}, and renders the result via
 * {@link renderReport}.
 *
 * Exit codes:
 *   0 — scan completed (regardless of finding count)
 *   1 — bridge-level error (missing repo, scan crash). Discriminated from
 *       a healthy run by a synthetic degraded entry carrying the
 *       {@link BRIDGE_DEGRADED_ID} sentinel id.
 *   2 — argv parse failure or invalid flag value
 *
 * Runtime: Bun 1.3+. Dependencies: Bun built-ins only.
 */

import { parseArgs } from "node:util";

import { runCapabilityBridge, BRIDGE_DEGRADED_ID } from "./lib/arch-scan/bridge";
import { renderReport } from "./lib/arch-scan/report";
import type { BridgeOptions } from "./lib/arch-scan/bridge";

type Phase = 1 | 3 | "all";

interface CliOptions extends BridgeOptions {
  readonly format: "text" | "json";
}

const USAGE = `Usage: arch-scan [options] [repoRoot]

Options:
  --format <text|json>            Output format (default: text)
  --phase <1|3|all>               Detection phase filter (default: all)
  --relationship-id <id>          Narrow to a single relationship id
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
  readonly relationshipId?: string;
  readonly regexTimeoutMs: number;
  readonly repoRoot: string;
  readonly help: boolean;
}

/**
 * Outcome of argv parsing. `kind: "ok"` carries the parsed args; the two
 * error kinds carry a stderr message to print before exiting. Kept
 * structural (P33) so the exit code is decided in exactly one place.
 */
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
        format: { type: "string", default: "text" },
        phase: { type: "string", default: "all" },
        "relationship-id": { type: "string" },
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
  if (!Number.isFinite(timeoutNum) || timeoutNum <= 0 || !Number.isInteger(timeoutNum)) {
    return {
      kind: "usage",
      message: `--regex-timeout-ms must be a positive integer (got '${timeoutRaw}')`,
    };
  }

  const repoRoot = parsed.positionals[0] ?? process.cwd();
  const relationshipId = parsed.values["relationship-id"];

  return {
    kind: "ok",
    args: {
      format,
      phase,
      relationshipId,
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
    process.stderr.write(`arch-scan: ${outcome.message}\n`);
    process.stderr.write(USAGE);
    return 2;
  }

  const parsed = outcome.args;
  const options: CliOptions = {
    repoRoot: parsed.repoRoot,
    phase: parsed.phase,
    relationshipId: parsed.relationshipId,
    regexTimeoutMs: parsed.regexTimeoutMs,
    format: parsed.format,
  };

  const result = await runCapabilityBridge(options);

  const output = renderReport(result, options.format);
  process.stdout.write(output);
  if (!output.endsWith("\n")) {
    process.stdout.write("\n");
  }

  // Bridge-level errors carry the sentinel id; per-relationship degradations
  // (e.g. a single regex timeout) keep exit 0 because the scan as a whole
  // remained usable.
  const bridgeFailed = result.coverage.degradedRelationships.some(
    (d) => d.id === BRIDGE_DEGRADED_ID,
  );
  return bridgeFailed ? 1 : 0;
}

const code = await run(process.argv.slice(2));

// Flush stdout before force-exiting so piped output is never truncated.
// Matches the `bin/adv` exit pattern.
process.stdout.end(() => process.exit(code));
