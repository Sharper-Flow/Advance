// acp-mux — OpenCode server plugin for the Zed/ACP era.
//
// Companion to `bin/acp-mux` (the launcher binary). The launcher handles
// XDG_DATA_HOME isolation, DB seeding, and instance bookkeeping before
// OpenCode starts (because plugins cannot change XDG_DATA_HOME after the
// SQLite handle is opened). This plugin runs in-process and provides:
//
//   - ACP-runtime detection and a warning when ACP launched without the
//     isolated launcher
//   - Boot log with mode, instance id, DB path
//   - Agent-callable tools: acp_mux_instance_info, acp_mux_concurrent_sessions,
//     acp_mux_sync_db, acp_mux_doctor, acp_mux_instances
//   - shell.env tagging: OPENCODE_CLIENT=acp, OPENCODE_ZED=1 forwarded to
//     subprocess shells
//   - WAL TRUNCATE checkpoint on session.deleted / SIGTERM / SIGINT /
//     beforeExit so per-instance DBs don't accumulate WAL bloat
//
// Provenance: this is the Zed-era extraction of Pattern B session topology and
// session-DB contention discovery items
// (proposals/2026-05-03-session-and-resource-architecture.md §10.2).
// Tmux-specific pieces (status decode, resurrect, dashboard) are intentionally
// omitted — Zed owns window/session management now.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { tool } from "@opencode-ai/plugin";
import { z } from "zod";

import * as instance from "./lib/instance.js";
import * as concurrent from "./lib/concurrent.js";
import { walCheckpoint } from "./lib/checkpoint.js";

const execFileP = promisify(execFile);
const PREFIX = "acp-mux";

function log(event, data = {}) {
  if (process.env.ACP_MUX_QUIET === "1") return;
  console.error(`[${PREFIX}] ${event}`, JSON.stringify(data));
}

function logDebug(event, data = {}) {
  if (process.env.ACP_MUX_DEBUG !== "1") return;
  console.error(`[${PREFIX}:debug] ${event}`, JSON.stringify(data));
}

async function runLauncher(args, { timeoutMs = 60_000 } = {}) {
  const bin = instance.launcherBinPath();
  try {
    const { stdout, stderr } = await execFileP(bin, args, {
      timeout: timeoutMs,
      maxBuffer: 4 * 1024 * 1024,
    });
    return { ok: true, stdout, stderr };
  } catch (err) {
    return {
      ok: false,
      stdout: err.stdout?.toString() ?? "",
      stderr: err.stderr?.toString() ?? String(err),
      code: err.code ?? null,
    };
  }
}

export default async function acpMuxPlugin(input) {
  const snap = instance.snapshot();

  // One-time boot log so the operator/agent knows whether iso is engaged.
  log("boot", {
    mode: snap.mode,
    acp: snap.acp,
    instanceId: snap.instanceId,
    dbPath: snap.dbPath,
    launcherInstalled: snap.launcherInstalled,
    project: input?.project?.id,
    worktree: input?.worktree,
  });

  if (snap.acp && snap.mode === "master") {
    log("warn.acp-not-isolated", {
      msg: "ACP runtime detected but ACP_MUX_INSTANCE_ID is unset. Zed should launch via `acp-mux acp`, not `opencode acp`, for concurrency safety.",
    });
  }

  return {
    config() {
      // Preserve trunk behaviour: emit a brief ACP detection line so
      // ACP log readers see it even if ACP_MUX_QUIET is set.
      if (snap.acp) {
        console.error(`[${PREFIX}] ACP runtime detected`);
      }
    },

    "shell.env": async (_input, output) => {
      // Forward ACP markers so child shells (lazygit, scripts, etc.) can
      // distinguish ACP-launched contexts from interactive TUI/run.
      if (snap.acp) {
        output.env.OPENCODE_CLIENT = "acp";
        output.env.OPENCODE_ZED = "1";
      }
      if (snap.instanceId) {
        output.env.ACP_MUX_INSTANCE_ID = snap.instanceId;
      }
    },

    tool: {
      acp_mux_instance_info: tool({
        description:
          "Show OpenCode multi-instance state: which acp-mux instance this session is running in, where its SQLite DB lives, ACP vs TUI runtime, and whether the launcher is installed. Useful when debugging cross-session contention or planning sync-db.",
        args: {},
        async execute(_args, ctx) {
          const s = instance.snapshot();
          const lines = [
            `mode             : ${s.mode}`,
            `acp_runtime      : ${s.acp}`,
            `instance_id      : ${s.instanceId ?? "(none — master DB)"}`,
            `instance_dir     : ${s.instanceDir ?? "(n/a)"}`,
            `current_db       : ${s.dbPath}`,
            `master_db        : ${s.masterDbPath}`,
            `instances_root   : ${s.instancesRoot}`,
            `legacy_root      : ${s.legacyInstancesRoot}`,
            `launcher_bin     : ${s.launcherBin}`,
            `launcher_installed: ${s.launcherInstalled}`,
            `project_dir      : ${ctx.directory}`,
            `project_worktree : ${ctx.worktree}`,
          ];
          if (s.stamp) {
            lines.push(
              `stamp.started_at : ${s.stamp.started_at ?? "?"}`,
              `stamp.cwd        : ${s.stamp.cwd ?? "?"}`,
              `stamp.pid        : ${s.stamp.pid ?? "?"}`,
              `stamp.launcher   : ${s.stamp.launcher ?? "?"}`,
            );
          }
          return {
            title: s.mode === "isolated" ? `iso instance ${s.instanceId}` : "master DB (no isolation)",
            output: lines.join("\n"),
            metadata: s,
          };
        },
      }),

      acp_mux_concurrent_sessions: tool({
        description:
          "List other live OpenCode instances (Zed ACP, TUI, opencode run), optionally filtered to the current project. Scans both the current ~/.local/share/acp-mux/instances and the legacy ~/.local/share/opencode-instances roots. Use this before destructive operations on shared project state (worktrees, ADV plugin files).",
        args: {
          scope: z
            .enum(["all", "project"])
            .default("project")
            .describe("'project' = only instances on the current project_dir; 'all' = every live instance"),
          include_self: z.boolean().default(false).describe("Include this instance in the result"),
          include_legacy: z.boolean().default(true).describe("Also scan the pre-rename ~/.local/share/opencode-instances root"),
        },
        async execute({ scope, include_self, include_legacy }, ctx) {
          const projectRoot = scope === "project" ? ctx.directory : null;
          const all = concurrent.listInstances({
            includeSelf: include_self,
            liveOnly: true,
            includeLegacy: include_legacy,
          });
          const filtered = projectRoot
            ? concurrent.instancesForProject(projectRoot, {
                includeSelf: include_self,
                liveOnly: true,
                includeLegacy: include_legacy,
              })
            : all;
          const rows = filtered.map((i) => {
            const cwd = i.cwd ?? "?";
            const start = i.startedAt ? i.startedAt.slice(0, 19) : "?";
            const origin = i.origin === "legacy" ? "L" : " ";
            return `${origin} ${i.id.padEnd(36)}  pid=${String(i.pid ?? "?").padEnd(8)}  ${start}  ${cwd}`;
          });
          const title =
            scope === "project"
              ? `${filtered.length} concurrent on ${ctx.directory}`
              : `${filtered.length} concurrent live instances`;
          const output =
            rows.length === 0
              ? `(no other live instances${scope === "project" ? " on this project" : ""})`
              : ["  " + "id".padEnd(36) + "  pid       started              cwd", ...rows].join("\n");
          return {
            title,
            output,
            metadata: { total_live: all.length, on_project: filtered.length, scope, instances: filtered },
          };
        },
      }),

      acp_mux_sync_db: tool({
        description:
          "Run the bidirectional session-store sync (`acp-mux sync-db`) so canonical and isolated DBs converge. INSERT OR IGNORE is used in all directions, so the operation is additive and safe to repeat. Defaults to --dry-run; set execute=true to apply.",
        args: {
          mode: z
            .enum(["live", "all"])
            .default("live")
            .describe("'live' = only sync instances with live PIDs; 'all' = include dead instance dirs too"),
          execute: z.boolean().default(false).describe("Actually run sync. Default is dry-run."),
          target: z
            .string()
            .optional()
            .describe("Override target DB path (instead of scanning instance roots). Mutually exclusive with mode."),
        },
        async execute(args) {
          const argv = ["sync-db"];
          if (args.target) argv.push("--target", args.target);
          else argv.push(args.mode === "all" ? "--all" : "--live");
          if (!args.execute) argv.push("--dry-run");
          const r = await runLauncher(argv, { timeoutMs: 120_000 });
          return {
            title: r.ok
              ? args.execute
                ? "sync-db complete"
                : "sync-db dry-run"
              : "sync-db failed",
            output: r.ok ? r.stdout : `${r.stdout}\n--- stderr ---\n${r.stderr}`,
            metadata: { ok: r.ok, argv },
          };
        },
      }),

      acp_mux_doctor: tool({
        description: "Run `acp-mux doctor`: report binary path, version, master-data location, instance roots, live-instance count, and canonical DB integrity.",
        args: {},
        async execute() {
          const r = await runLauncher(["doctor"], { timeoutMs: 15_000 });
          return {
            title: r.ok ? "acp-mux doctor" : "acp-mux doctor failed",
            output: r.ok ? r.stdout : `${r.stdout}\n--- stderr ---\n${r.stderr}`,
            metadata: { ok: r.ok },
          };
        },
      }),

      acp_mux_instances: tool({
        description: "List acp-mux isolated instances. Default: only those with live PIDs. Set all=true to include dead instance dirs.",
        args: {
          all: z.boolean().default(false).describe("Include dead instance dirs"),
        },
        async execute(args) {
          const argv = ["instances"];
          if (args.all) argv.push("--all");
          const r = await runLauncher(argv, { timeoutMs: 10_000 });
          return {
            title: args.all ? "all instances" : "live instances",
            output: r.ok ? (r.stdout.trim() || "(none)") : r.stderr,
            metadata: { ok: r.ok },
          };
        },
      }),
    },

    // Track which sessions we've seen so we can checkpoint on shutdown.
    "chat.message": async (msgInput) => {
      if (msgInput?.sessionID) seenSessions.add(msgInput.sessionID);
    },

    // Lifecycle events — WAL checkpoint on session deletion.
    event: async ({ event }) => {
      const t = event?.type ?? event?.kind ?? null;
      logDebug("event", { type: t });
      if (t === "session.deleted" || t === "session.delete") {
        const sid = event?.properties?.id ?? event?.id ?? null;
        if (sid) seenSessions.delete(sid);
        const dbPath = instance.currentInstanceDbPath();
        const r = await walCheckpoint(dbPath, { log: logDebug });
        logDebug("checkpoint.session-delete", { sid, dbPath, result: r });
      }
    },
  };
}

const seenSessions = new Set();

// Process-level shutdown checkpoint. SIGTERM/SIGINT/exit funnel here.
let _checkpointing = false;
async function gracefulCheckpoint(reason) {
  if (_checkpointing) return;
  _checkpointing = true;
  const dbPath = instance.currentInstanceDbPath();
  try {
    const r = await walCheckpoint(dbPath, { log: logDebug });
    log("checkpoint.exit", { reason, dbPath, ...r });
  } catch (err) {
    log("checkpoint.exit.failed", { reason, error: String(err) });
  }
}

if (!globalThis.__acp_mux_signal_hooks_installed) {
  globalThis.__acp_mux_signal_hooks_installed = true;
  for (const sig of ["SIGTERM", "SIGINT"]) {
    process.on(sig, () => {
      gracefulCheckpoint(sig).finally(() => {
        process.kill(process.pid, sig);
      });
    });
  }
  process.on("beforeExit", () => {
    gracefulCheckpoint("beforeExit").catch(() => {});
  });
}

export { acpMuxPlugin };
