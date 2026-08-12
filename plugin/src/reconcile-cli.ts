/**
 * Standalone `adv reconcile` bundle entry point.
 *
 * This module deliberately calls the canonical operator tool handler instead
 * of duplicating its scan/plan/apply logic. The emitted bundle is runnable by
 * Bun or Node and has no OpenCode host-runtime dependency.
 */

import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { createStore } from "./storage/store";
import { getExternalRoot, getProjectId } from "./utils/project-id";
import { storeReconcileHandler } from "./tools/store-reconcile";

type ReconcileMode = "plan" | "dry_run" | "apply";

interface ReconcileCliArgs {
  mode: ReconcileMode;
  target_path?: string;
  target_confirmed?: true;
  confirmationEvidence?: string;
  confirm_plan_hash?: string;
  resume_from?: string;
  max_records?: number;
  budget_ms?: number;
}

interface ParsedReconcileArgs {
  args: ReconcileCliArgs;
  pretty: boolean;
}

function usageError(message: string): never {
  throw new Error(message);
}

function oneMode(
  values: Record<string, unknown>,
  modeValue: unknown,
): ReconcileMode {
  const selected = [
    values.plan === true ? "plan" : null,
    values["dry-run"] === true ? "dry_run" : null,
    values.apply === true ? "apply" : null,
    typeof modeValue === "string" ? modeValue : null,
  ].filter((value): value is string => value !== null);

  if (selected.length > 1) {
    usageError("choose exactly one of --mode, --plan, --dry-run, or --apply");
  }
  const mode = selected[0] ?? "plan";
  if (mode !== "plan" && mode !== "dry_run" && mode !== "apply") {
    usageError(
      `--mode must be one of plan, dry_run, or apply (received ${mode})`,
    );
  }
  return mode;
}

function positiveInteger(
  values: Record<string, unknown>,
  key: string,
  label: string,
): number | undefined {
  const value = values[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    usageError(`${label} must be a positive integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    usageError(`${label} must be a positive integer`);
  }
  return parsed;
}

function stringValue(
  values: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    if (typeof values[key] === "string") return values[key] as string;
  }
  return undefined;
}

function parseReconcileArgs(argv: string[]): ParsedReconcileArgs {
  const parsed = parseArgs({
    args: argv,
    options: {
      mode: { type: "string" },
      plan: { type: "boolean" },
      "dry-run": { type: "boolean" },
      apply: { type: "boolean" },
      "target-path": { type: "string" },
      target_path: { type: "string" },
      "target-confirmed": { type: "boolean" },
      target_confirmed: { type: "boolean" },
      "confirmation-evidence": { type: "string" },
      confirmationEvidence: { type: "string" },
      "confirm-plan-hash": { type: "string" },
      confirm_plan_hash: { type: "string" },
      "resume-from": { type: "string" },
      resume_from: { type: "string" },
      "max-records": { type: "string" },
      max_records: { type: "string" },
      "budget-ms": { type: "string" },
      budget_ms: { type: "string" },
      json: { type: "boolean" },
      pretty: { type: "boolean" },
    },
    allowPositionals: false,
    strict: true,
  });
  const values = parsed.values as Record<string, unknown>;
  const mode = oneMode(values, values.mode);
  const targetPath = stringValue(values, "target-path", "target_path");
  const targetConfirmed =
    values["target-confirmed"] === true || values.target_confirmed === true;
  const confirmationEvidence = stringValue(
    values,
    "confirmation-evidence",
    "confirmationEvidence",
  );
  const confirmPlanHash = stringValue(
    values,
    "confirm-plan-hash",
    "confirm_plan_hash",
  );
  const resumeFrom = stringValue(values, "resume-from", "resume_from");
  const maxRecords = positiveInteger(
    { max_records: values["max-records"] ?? values.max_records },
    "max_records",
    "--max-records",
  );
  const budgetMs = positiveInteger(
    { budget_ms: values["budget-ms"] ?? values.budget_ms },
    "budget_ms",
    "--budget-ms",
  );

  return {
    pretty: values.pretty === true,
    args: {
      mode,
      ...(targetPath !== undefined && { target_path: targetPath }),
      ...(targetConfirmed && { target_confirmed: true }),
      ...(confirmationEvidence !== undefined && {
        confirmationEvidence,
      }),
      ...(confirmPlanHash !== undefined && {
        confirm_plan_hash: confirmPlanHash,
      }),
      ...(resumeFrom !== undefined && { resume_from: resumeFrom }),
      ...(maxRecords !== undefined && { max_records: maxRecords }),
      ...(budgetMs !== undefined && { budget_ms: budgetMs }),
    },
  };
}

function outputExitCode(output: string): number {
  try {
    const parsed = JSON.parse(output) as {
      ok?: unknown;
      exit_code?: unknown;
    };
    if (typeof parsed.exit_code === "number") return parsed.exit_code;
    return parsed.ok === false ? 2 : 0;
  } catch {
    return 1;
  }
}

/** Execute one `reconcile` invocation and return its process exit code. */
export async function runReconcileCli(argv: string[]): Promise<number> {
  let parsed: ParsedReconcileArgs;
  try {
    parsed = parseReconcileArgs(argv);
  } catch (error) {
    process.stderr.write(
      `reconcile: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 2;
  }

  const projectRoot = process.cwd();
  const projectId = await getProjectId(projectRoot);
  if (!projectId) {
    const output = JSON.stringify({
      ok: false,
      mode: parsed.args.mode,
      error_class: "target_store_resolution",
      exit_code: 2,
      error:
        "project identity could not be resolved from the current directory",
      zero_mutations: true,
    });
    process.stdout.write(output + "\n");
    return 2;
  }

  let output: string;
  const store = await createStore(projectRoot, {
    externalRoot: getExternalRoot(projectId),
  });
  try {
    output = await storeReconcileHandler(parsed.args, store);
  } catch (error) {
    output = JSON.stringify({
      ok: false,
      mode: parsed.args.mode,
      error_class: "target_store_resolution",
      exit_code: 2,
      error: error instanceof Error ? error.message : String(error),
      zero_mutations: true,
    });
  } finally {
    store.close?.();
  }

  if (parsed.pretty) {
    try {
      output = JSON.stringify(JSON.parse(output), null, 2);
    } catch {
      // Keep the canonical handler output if it is not JSON.
    }
  }
  process.stdout.write(output + "\n");
  return outputExitCode(output);
}

function isDirectExecution(): boolean {
  if (!process.argv[1]) return false;
  return resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
}

if (isDirectExecution()) {
  runReconcileCli(process.argv.slice(2)).then((code) => process.exit(code));
}
