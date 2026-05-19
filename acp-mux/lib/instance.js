// Detect and read state about the current acp-mux isolated instance.
//
// The `acp-mux acp` launcher (bin/acp-mux) sets:
//   XDG_DATA_HOME            = <INSTANCES_ROOT>/<INSTANCE_ID>
//   ACP_MUX_INSTANCE_ID = <INSTANCE_ID>
//   OPENCODE_CLIENT          = "acp"
// and writes a stamp file at <XDG_DATA_HOME>/opencode/.instance.json.
//
// When the wrapper is NOT in use, ACP_MUX_INSTANCE_ID is unset and we
// report `mode=master` (running against the canonical ~/.local/share/opencode).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const HOME = os.homedir();
const DEFAULT_MASTER_DATA = path.join(HOME, ".local", "share", "opencode");
const DEFAULT_INSTANCES_ROOT = path.join(HOME, ".local", "share", "acp-mux", "instances");
const DEFAULT_LEGACY_INSTANCES_ROOT = path.join(HOME, ".local", "share", "opencode-instances");
const DEFAULT_LAUNCHER_BIN = path.join(HOME, ".local", "bin", "acp-mux");

export function instancesRoot() {
  return process.env.ACP_MUX_INSTANCES_ROOT || DEFAULT_INSTANCES_ROOT;
}

export function legacyInstancesRoot() {
  return process.env.OPENCODE_LEGACY_INSTANCES_ROOT || DEFAULT_LEGACY_INSTANCES_ROOT;
}

export function masterDataDir() {
  return process.env.OPENCODE_MASTER_DATA || DEFAULT_MASTER_DATA;
}

export function masterDbPath() {
  return path.join(masterDataDir(), "opencode.db");
}

export function launcherBinPath() {
  return process.env.ACP_MUX_BIN || DEFAULT_LAUNCHER_BIN;
}

export function isolatedMode() {
  return Boolean(process.env.ACP_MUX_INSTANCE_ID);
}

export function acpMode() {
  return process.env.OPENCODE_CLIENT === "acp";
}

export function currentInstanceId() {
  return process.env.ACP_MUX_INSTANCE_ID || null;
}

export function currentInstanceDir() {
  const id = currentInstanceId();
  if (!id) return null;
  return path.join(instancesRoot(), id, "opencode");
}

export function currentInstanceDbPath() {
  const dir = currentInstanceDir();
  if (!dir) return masterDbPath();
  return path.join(dir, "opencode.db");
}

export function readStamp(instanceDir) {
  const file = path.join(instanceDir, ".instance.json");
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

export function currentStamp() {
  const dir = currentInstanceDir();
  if (!dir) return null;
  return readStamp(dir);
}

export function hasLauncher() {
  const candidates = [launcherBinPath()];
  return candidates.some((p) => {
    try {
      const st = fs.statSync(p);
      return st.isFile() || st.isSymbolicLink();
    } catch {
      return false;
    }
  });
}

export function snapshot() {
  return {
    mode: isolatedMode() ? "isolated" : "master",
    acp: acpMode(),
    instanceId: currentInstanceId(),
    instanceDir: currentInstanceDir(),
    dbPath: currentInstanceDbPath(),
    masterDbPath: masterDbPath(),
    instancesRoot: instancesRoot(),
    legacyInstancesRoot: legacyInstancesRoot(),
    stamp: currentStamp(),
    launcherInstalled: hasLauncher(),
    launcherBin: launcherBinPath(),
  };
}
