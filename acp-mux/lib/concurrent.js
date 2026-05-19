// Scan acp-mux instance dirs (new + legacy) to find other live OpenCode
// processes, optionally filtered to the same project root.
//
// "Live" = the PID stamped in .instance.json still exists in /proc.
// "Same project" = stamp.cwd starts with the given project root.

import fs from "node:fs";
import path from "node:path";

import { instancesRoot, legacyInstancesRoot, currentInstanceId } from "./instance.js";

function pidAlive(pid) {
  if (!pid || typeof pid !== "number") return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readStamp(instanceDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(instanceDir, ".instance.json"), "utf8"));
  } catch {
    return null;
  }
}

function dirMtime(p) {
  try {
    return fs.statSync(p).mtimeMs;
  } catch {
    return 0;
  }
}

function* enumerateRoots(includeLegacy) {
  const roots = [{ root: instancesRoot(), origin: "current" }];
  if (includeLegacy) {
    const legacy = legacyInstancesRoot();
    if (legacy && legacy !== roots[0].root) {
      roots.push({ root: legacy, origin: "legacy" });
    }
  }
  for (const { root, origin } of roots) {
    let entries = [];
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      yield { id: ent.name, dir: path.join(root, ent.name, "opencode"), origin };
    }
  }
}

export function listInstances({ includeSelf = false, liveOnly = false, includeLegacy = true } = {}) {
  const selfId = currentInstanceId();
  const results = [];
  for (const { id, dir, origin } of enumerateRoots(includeLegacy)) {
    if (!includeSelf && id === selfId) continue;
    const stamp = readStamp(dir);
    const pid = stamp?.pid ?? null;
    const alive = pidAlive(pid);
    if (liveOnly && !alive) continue;
    results.push({
      id,
      origin,
      pid,
      alive,
      cwd: stamp?.cwd ?? null,
      ppid: stamp?.ppid ?? null,
      startedAt: stamp?.started_at ?? null,
      subcommand: stamp?.subcommand ?? null,
      launcher: stamp?.launcher ?? null,
      dir,
      mtime: dirMtime(dir),
    });
  }
  results.sort((a, b) => b.mtime - a.mtime);
  return results;
}

export function instancesForProject(projectRoot, opts = {}) {
  const all = listInstances(opts);
  const normalized = path.resolve(projectRoot);
  return all.filter((i) => {
    if (!i.cwd) return false;
    const cwd = path.resolve(i.cwd);
    return cwd === normalized || cwd.startsWith(normalized + path.sep);
  });
}

export function summary(projectRoot) {
  const all = listInstances({ liveOnly: true });
  const onProject = projectRoot ? instancesForProject(projectRoot, { liveOnly: true }) : [];
  return {
    totalLive: all.length,
    onCurrentProject: onProject.length,
    instances: all,
    instancesOnProject: onProject,
  };
}
