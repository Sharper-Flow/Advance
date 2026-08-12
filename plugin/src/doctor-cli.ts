/**
 * Standalone `adv doctor` bundle entry point.
 *
 * This CLI is a thin adapter over the canonical operator handlers. It does not
 * duplicate diagnostics, repair, quarantine, cleanup, conformance, or purge
 * logic from the plugin.
 */
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { createStore } from "./storage/store";
import { getExternalRoot, getProjectId } from "./utils/project-id";
import { doctorHandler } from "./tools/doctor";
import { changeProjectionQuarantineHandler } from "./tools/change-projection-quarantine";
import { snapshotHealthHandler } from "./tools/snapshot";
import { storeCleanupHandler } from "./tools/store-cleanup";
import { advArchivePurgeHandler } from "./tools/change/handlers-archive";

function outputExitCode(output: string): number {
  try {
    const parsed = JSON.parse(output) as { success?: unknown; ok?: unknown };
    return parsed.success === false || parsed.ok === false ? 1 : 0;
  } catch {
    return 1;
  }
}

function usageError(message: string): never {
  throw new Error(message);
}

function parseDoctorArgs(argv: string[]) {
  const parsed = parseArgs({
    args: argv,
    options: {
      quarantine: { type: "string" },
      snapshot: { type: "boolean" },
      repair: { type: "boolean" },
      confirm: { type: "boolean" },
      "cleanup-legacy": { type: "boolean" },
      execute: { type: "boolean" },
      "purge-archive": { type: "string" },
      json: { type: "boolean" },
      pretty: { type: "boolean" },
      help: { type: "boolean", short: "h" },
      "target-path": { type: "string" },
      "confirmation-evidence": { type: "string" },
    },
    allowPositionals: false,
    strict: true,
  });
  const values = parsed.values as Record<string, unknown>;
  if (values.help === true) {
    process.stdout.write(
      "Usage: adv doctor [--quarantine <changeId> | --snapshot [--repair --confirm] | --cleanup-legacy [--execute --confirm] | --purge-archive <changeId> --confirm]\n",
    );
    return { values, pretty: false };
  }
  const modes = [
    values.quarantine !== undefined,
    values.snapshot === true,
    values["cleanup-legacy"] === true,
    values["purge-archive"] !== undefined,
  ].filter(Boolean).length;
  if (modes > 1) usageError("choose exactly one doctor operation");
  if (values.repair === true && values.snapshot !== true)
    usageError("--repair requires --snapshot");
  if (
    values.confirm === true &&
    values.snapshot !== true &&
    values["purge-archive"] === undefined
  )
    usageError("--confirm is valid for snapshot repair or archive purge");
  if (values.execute === true && values["cleanup-legacy"] !== true)
    usageError("--execute requires --cleanup-legacy");
  return { values, pretty: values.pretty === true };
}

function prettyOutput(output: string, pretty: boolean): string {
  if (!pretty) return output;
  try {
    return JSON.stringify(JSON.parse(output), null, 2);
  } catch {
    return output;
  }
}

export async function runDoctorCli(argv: string[]): Promise<number> {
  let parsed: ReturnType<typeof parseDoctorArgs>;
  try {
    parsed = parseDoctorArgs(argv);
  } catch (error) {
    process.stderr.write(
      `doctor: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 2;
  }

  const projectRoot = process.cwd();
  const projectId = await getProjectId(projectRoot);
  if (!projectId) {
    process.stdout.write(
      JSON.stringify({
        success: false,
        error:
          "project identity could not be resolved from the current directory",
      }) + "\n",
    );
    return 2;
  }
  const store = await createStore(projectRoot, {
    externalRoot: getExternalRoot(projectId),
  });
  const values = parsed.values;
  if (values.help === true) return 0;
  const evidence =
    (typeof values["confirmation-evidence"] === "string" &&
      values["confirmation-evidence"]) ||
    "Explicit approval supplied by the adv doctor CLI invocation.";
  let output: string;
  try {
    if (values.quarantine !== undefined) {
      output = await changeProjectionQuarantineHandler(
        {
          changeId: String(values.quarantine),
          approvedByUser: true,
          approvalEvidence: evidence,
          dryRun: false,
        },
        store,
      );
    } else if (values.snapshot === true) {
      output = await snapshotHealthHandler(
        {
          action: values.repair === true ? "repair" : "scan",
          scope: "project",
          ...(values.repair === true
            ? {
                ...(values.confirm === true
                  ? { approvedByUser: true, approvalEvidence: evidence }
                  : {}),
              }
            : {}),
        },
        store,
      );
    } else if (values["cleanup-legacy"] === true) {
      output = await storeCleanupHandler(
        {
          action: values.execute === true ? "execute" : "dry_run",
          ...(values.execute === true
            ? {
                ...(values.confirm === true
                  ? { approvedByUser: true, approvalEvidence: evidence }
                  : {}),
              }
            : {}),
        },
        store,
      );
    } else if (values["purge-archive"] !== undefined) {
      if (values.confirm !== true)
        usageError("--purge-archive requires --confirm");
      output = await advArchivePurgeHandler(
        {
          changeId: String(values["purge-archive"]),
          includeDiskBundle: true,
          approvedByUser: true,
          approvalEvidence: evidence,
        },
        store,
      );
    } else {
      output = await doctorHandler({}, store);
    }
  } catch (error) {
    output = JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    store.close?.();
  }
  output = prettyOutput(output, parsed.pretty);
  process.stdout.write(output + "\n");
  return outputExitCode(output);
}

function isDirectExecution(): boolean {
  if (!process.argv[1]) return false;
  return resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
}

if (isDirectExecution()) {
  runDoctorCli(process.argv.slice(2)).then((code) => process.exit(code));
}
