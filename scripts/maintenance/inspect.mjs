#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

function parseArgs(argv) {
  const args = { projectRoot: process.cwd() };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--project-root") {
      const value = argv[i + 1];
      if (!value) throw new Error("--project-root requires a value");
      args.projectRoot = value;
      i += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      args.help = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

async function readArchiveChanges(projectRoot) {
  const archiveRoot = resolve(projectRoot, ".adv", "archive");
  let entries;
  try {
    entries = await readdir(archiveRoot, { withFileTypes: true });
  } catch (err) {
    if (err?.code === "ENOENT") return [];
    throw err;
  }

  const changes = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const changePath = resolve(archiveRoot, entry.name, "change.json");
    try {
      const raw = await readFile(changePath, "utf8");
      const change = JSON.parse(raw);
      const releaseStatus = change?.gates?.release?.status ?? "missing";
      const eligible =
        change?.status === "archived" && releaseStatus === "done";
      changes.push({
        change_id: change?.id ?? entry.name,
        archive_dir: entry.name,
        change_path: changePath,
        status: change?.status ?? "unknown",
        release_gate: releaseStatus,
        eligible,
        verification: {
          archived: change?.status === "archived",
          release_gate_done: releaseStatus === "done",
        },
      });
    } catch (err) {
      changes.push({
        change_id: entry.name,
        archive_dir: entry.name,
        change_path: changePath,
        status: "unreadable",
        release_gate: "unknown",
        eligible: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return changes.sort((a, b) => a.change_id.localeCompare(b.change_id));
}

export async function inspect(projectRoot) {
  const resolvedRoot = resolve(projectRoot);
  const archivedChanges = await readArchiveChanges(resolvedRoot);
  const eligibleArchives = archivedChanges.filter((change) => change.eligible);
  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    project_root: resolvedRoot,
    eligible_archives: eligibleArchives,
    archived_changes: archivedChanges,
    verification_summary: {
      archived_count: archivedChanges.length,
      eligible_count: eligibleArchives.length,
      ineligible_count: archivedChanges.length - eligibleArchives.length,
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(
      "Usage: node scripts/maintenance/inspect.mjs [--project-root <path>]\n",
    );
    return;
  }
  const report = await inspect(args.projectRoot);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(
      `${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exitCode = 1;
  });
}
