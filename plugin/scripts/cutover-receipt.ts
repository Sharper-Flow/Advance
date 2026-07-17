/**
 * cutover-receipt — operator surface for the build-bound cutover receipt
 * (AC9/DDC5/DDC7, C5).
 *
 *   pnpm exec tsx scripts/cutover-receipt.ts status
 *   pnpm exec tsx scripts/cutover-receipt.ts activate
 *   pnpm exec tsx scripts/cutover-receipt.ts disable --reason "<why>"
 *
 * `status` reports the current receipt and a fresh readiness evaluation.
 * `activate` runs the full structural proof — immutable deployed-build
 * identity, complete project/workflow/process/session inventory, committed
 * replay verification, worker serviceability, strict plan validation — and
 * atomically activates the receipt only when every check passes. Unknown or
 * stale components block activation.
 * `disable` is the first rollback action (DDC7): it disables the receipt
 * and restores pre-cutover legacy routing while retaining all artifacts.
 *
 * Run from the checkout whose `plugin/` tree deploys to this machine (the
 * deploy source). For ACTIVATION, pass `--plugin-root` pointing at the
 * DEPLOYED plugin dir (default ~/.local/share/Advance/plugin) so the receipt
 * binds to the build sessions actually load and deployed worker processes
 * classify as deployed rather than foreign.
 *
 * Options:
 *   --plugin-root <path>     default: this repo's plugin/
 *   --migration-root <path>  default: <deploy-root>/migration
 *   --home <path>            default: $HOME (inventory roots)
 *   --temporal-address <addr> default: localhost:7233
 *   --reason "<text>"        required for disable
 */

import { dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

import { verifyDeployedBuildIdentity } from "../src/migration/build-identity";
import {
  activateCutoverReceipt,
  disableCutoverReceipt,
  readCutoverReceipt,
  type CutoverProofs,
} from "../src/migration/cutover-receipt";
import {
  collectMachineInventory,
  validateMigrationReadiness,
} from "../src/migration/inventory";
import { verifyCommittedReplayFixtures } from "../src/migration/replay-verification";
import { validateStrictPlanSurface } from "../src/migration/strict-plan-validation";
import { listChangeWorkflowIds } from "../src/temporal/list-change-workflows";

interface Args {
  command: string;
  pluginRoot: string;
  migrationRoot?: string;
  homeDir: string;
  temporalAddress: string;
  reason?: string;
}

function parseArgs(argv: string[]): Args {
  const [command, ...rest] = argv;
  const args: Args = {
    command: command ?? "",
    pluginRoot: resolve(dirname(fileURLToPath(import.meta.url)), ".."),
    homeDir: homedir(),
    temporalAddress:
      process.env.TEMPORAL_ADDRESS ??
      process.env.ADV_TEMPORAL_ADDRESS ??
      "localhost:7233",
  };
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i];
    const value = rest[i + 1];
    switch (flag) {
      case "--plugin-root":
        args.pluginRoot = resolve(value);
        i++;
        break;
      case "--migration-root":
        args.migrationRoot = resolve(value);
        i++;
        break;
      case "--home":
        args.homeDir = resolve(value);
        i++;
        break;
      case "--temporal-address":
        args.temporalAddress = value;
        i++;
        break;
      case "--reason":
        args.reason = value;
        i++;
        break;
      default:
        throw new Error(`unknown argument: ${flag}`);
    }
  }
  return args;
}

async function makeWorkflowProbe(address: string) {
  const { Connection, Client } = await import("@temporalio/client");
  const connection = await Connection.connect({ address });
  const client = new Client({ connection });
  return async (projectId: string): Promise<number> => {
    const ids = await listChangeWorkflowIds(client, {
      projectId,
      statuses: null, // count every known change workflow
    });
    return ids.length;
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const deployRoot = dirname(args.pluginRoot);
  const migrationRoot = args.migrationRoot ?? resolve(deployRoot, "migration");

  if (args.command === "disable") {
    if (!args.reason) {
      throw new Error("disable requires --reason <text>");
    }
    const result = disableCutoverReceipt({
      migrationRoot,
      reason: args.reason,
    });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.disabled ? 0 : 1);
  }

  // Shared proof gathering for status + activate.
  const identity = verifyDeployedBuildIdentity(args.pluginRoot);
  let workflowProbe: ((projectId: string) => Promise<number>) | undefined;
  try {
    workflowProbe = await makeWorkflowProbe(args.temporalAddress);
  } catch (error) {
    console.error(
      `workflow probe unavailable (${error instanceof Error ? error.message : String(error)}); inventory will be incomplete`,
    );
  }
  const inventory = await collectMachineInventory({
    pluginRoot: args.pluginRoot,
    deployRoot,
    migrationRoot,
    homeDir: args.homeDir,
    listRunningWorkflows: workflowProbe,
  });
  const readiness = validateMigrationReadiness(inventory);

  if (args.command === "status") {
    const receipt = readCutoverReceipt({ migrationRoot });
    console.log(
      JSON.stringify(
        {
          receipt: receipt.receipt,
          receiptMalformed: receipt.malformed,
          build: inventory.build,
          readiness,
          inventorySummary: inventory.summary,
        },
        null,
        2,
      ),
    );
    process.exit(readiness.complete ? 0 : 1);
  }

  if (args.command !== "activate") {
    throw new Error(
      `unknown command "${args.command}" — expected status | activate | disable`,
    );
  }

  if (!readiness.complete) {
    console.error(
      JSON.stringify(
        { activated: false, blockers: readiness.blockers },
        null,
        2,
      ),
    );
    process.exit(1);
  }
  if (inventory.build.status !== "match" || !inventory.build.digest) {
    console.error(
      JSON.stringify(
        {
          activated: false,
          error: `build identity status: ${inventory.build.status}`,
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  // Replay verification against the built workflows bundle (DDC6).
  const replay = await verifyCommittedReplayFixtures({
    historiesDir: resolve(
      args.pluginRoot,
      "src/temporal/__tests__/replay/histories",
    ),
    workflowsPath: resolve(args.pluginRoot, "dist/temporal/workflows.js"),
  });
  if (!replay.passed) {
    console.error(JSON.stringify({ activated: false, replay }, null, 2));
    process.exit(1);
  }

  // Worker serviceability: current worker capacity must exist — a current
  // deployed worker process or at least one live session registered on the
  // current build digest (in-process worker hosts).
  const currentCapacity =
    inventory.processes.workers.filter((worker) => worker.root === "deployed")
      .length + inventory.sessions.live.length;
  const serviceability =
    currentCapacity > 0
      ? {
          status: "serviceable" as const,
          detail: `${currentCapacity} current worker-capacity source(s) (deployed workers + current sessions)`,
        }
      : {
          status: "not_serviceable" as const,
          detail:
            "no current worker capacity: no deployed worker process and no live session on the current build",
        };

  const planValidation = validateStrictPlanSurface();
  if (!planValidation.passed || serviceability.status !== "serviceable") {
    console.error(
      JSON.stringify(
        { activated: false, serviceability, planValidation },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  const proofs: CutoverProofs = {
    buildIdentityDigest: inventory.build.digest,
    inventoryComplete: true,
    inventorySummary: inventory.summary,
    replay: {
      passed: true,
      fixturesVerified: replay.fixtures.length,
      verifiedAt: replay.verifiedAt,
    },
    workerServiceability: {
      status: "serviceable",
      detail: serviceability.detail,
    },
    strictPlanValidation: {
      passed: true,
      checks: planValidation.checks,
      detail: planValidation.detail,
    },
  };

  const result = activateCutoverReceipt({
    migrationRoot,
    pluginRoot: args.pluginRoot,
    buildDigest: inventory.build.digest,
    proofs,
    activatedBy: process.env.USER ?? "operator",
  });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.activated ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
