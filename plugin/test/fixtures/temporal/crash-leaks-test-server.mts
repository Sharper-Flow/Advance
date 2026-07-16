/**
 * Crash fixture for the real-server residue proof (reapLeakedTestServers AC5).
 *
 * Spawned as a child process by `with-test-env-residue.itest.ts`. It creates
 * a REAL time-skipping test environment through the named helper constructor
 * (raw `TestWorkflowEnvironment.create*` stays inside the helper module per
 * the constructor guard), prints the real test-server PID on stdout, then
 * SIGKILLs itself. No `finally` / teardown can run on a SIGKILL, so the
 * `/tmp/temporal-test-server-sdk-typescript-*` child is genuinely leaked —
 * the exact crashed-runner scenario the conservative pre-run sweep exists for.
 *
 * Runs under plain Node (>=23.6) type stripping; invoked as
 * `node crash-leaks-test-server.mts`. Stdout carries exactly one JSON line:
 *   {"serverPid": <pid>}
 */
import { readdirSync, readFileSync, writeSync } from "node:fs";
import { createTimeSkippingTestWorkflowEnvironment } from "../../../src/temporal/__tests__/with-test-env.ts";

function findOwnTestServerPid(): number {
  const self = process.pid;
  for (const entry of readdirSync("/proc")) {
    if (!/^\d+$/.test(entry)) continue;
    let cmdline: string;
    try {
      cmdline = readFileSync(`/proc/${entry}/cmdline`, "utf8");
    } catch {
      continue; // kernel thread or raced exit
    }
    const argv0 = cmdline.split("\0")[0] ?? "";
    const base = argv0.slice(argv0.lastIndexOf("/") + 1);
    if (!base.startsWith("temporal-test-server-sdk-typescript-")) continue;
    let stat: string;
    try {
      stat = readFileSync(`/proc/${entry}/stat`, "utf8");
    } catch {
      continue;
    }
    const rest = stat.slice(stat.lastIndexOf(")") + 2);
    const ppid = Number(rest.split(" ")[1]);
    if (ppid === self) return Number(entry);
  }
  throw new Error("crash fixture: no temporal test-server child found");
}

const env = await createTimeSkippingTestWorkflowEnvironment();
// Deliberately never torn down: this process crashes right after reporting.
void env;
const serverPid = findOwnTestServerPid();
// Synchronous flush: SIGKILL does not drain stdio buffers.
writeSync(1, JSON.stringify({ serverPid }) + "\n");
process.kill(process.pid, "SIGKILL");
