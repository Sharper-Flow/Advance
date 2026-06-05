/**
 * adv CLI — project resolution
 *
 * Zero dependencies; compatible with Bun runtime.
 */

import { join } from "path";
import { homedir } from "os";

export async function resolveProjectId(cwd: string): Promise<string | null> {
  try {
    // Use globalThis to access Bun globals without requiring a Bun type decl
    const spawn = (globalThis as any).Bun?.spawn;
    if (typeof spawn !== "function") return null;

    const proc = spawn(["git", "rev-list", "--max-parents=0", "HEAD"], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    if (exitCode !== 0) return null;

    const roots = stdout.trim().split("\n").filter(Boolean).sort();
    const sha = roots[0];
    if (/^[0-9a-f]{40}$/.test(sha)) return sha;
    return null;
  } catch {
    return null;
  }
}

export function resolveExternalRoot(projectId: string): string {
  const dataHome =
    process.env.XDG_DATA_HOME || join(homedir(), ".local/share");
  return join(dataHome, "opencode/plugins/advance", projectId);
}
