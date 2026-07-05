import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "fs";
import { writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const ADV_PATH = join(import.meta.dir, "adv");

async function runAdv(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["bun", ADV_PATH, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, NO_COLOR: "1" },
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  return { exitCode, stdout, stderr };
}

describe("adv dashboard dispatcher", () => {
  test("help lists dashboard", async () => {
    const { exitCode, stdout } = await runAdv(["--help"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("dashboard");
    expect(stdout).toContain("--config <path>");
    expect(stdout).toContain("COMMAND BOUNDARY");
    expect(stdout).toContain("Most commands are read-only diagnostics/scanners");
    expect(stdout).toContain("dashboard install mutates local user configuration/service state");
    expect(stdout).toContain("dashboard install     Mutating install of dashboard user service profile");
    expect(stdout).toContain("dashboard            Run local read-only ADV/GitHub dashboard");
    expect(stdout).toContain("Bind host (default: 127.0.0.1)");
  });

  test("source header does not claim the whole CLI is read-only", () => {
    const source = readFileSync(ADV_PATH, "utf8");
    expect(source).not.toContain("Read-only terminal client");
    expect(source).toContain("dashboard install mutates local user service configuration");
  });

  test("requires --config", async () => {
    const { exitCode, stderr } = await runAdv(["dashboard", "--no-color"]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("--config is required");
  });

  test("rejects non-loopback host without opt-in", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "adv-dashboard-"));
    const configPath = join(tmp, "dashboard.json");
    await writeFile(
      configPath,
      JSON.stringify({
        schema_version: 1,
        refresh_seconds: 45,
        projects: [
          {
            id: "advance",
            label: "Advance",
            path: "/repo/advance",
            github: { owner: "Sharper-Flow", repo: "Advance" },
          },
        ],
      }),
    );

    const { exitCode, stderr } = await runAdv([
      "dashboard",
      "--config",
      configPath,
      "--host",
      "0.0.0.0",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("non-loopback");
  });

  test("fails loudly with a distinct exit code when fixed port is occupied", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "adv-dashboard-"));
    const configPath = join(tmp, "dashboard.json");
    await writeFile(
      configPath,
      JSON.stringify({
        schema_version: 1,
        refresh_seconds: 45,
        projects: [
          {
            id: "advance",
            label: "Advance",
            path: "/repo/advance",
            github: { owner: "Sharper-Flow", repo: "Advance" },
          },
        ],
      }),
    );
    const occupied = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () => new Response("occupied"),
    });
    try {
      const { exitCode, stderr } = await runAdv([
        "dashboard",
        "--config",
        configPath,
        "--port",
        String(occupied.port),
      ]);

      expect(exitCode).toBe(75);
      expect(stderr).toContain(`port ${occupied.port} is already in use`);
      expect(stderr).not.toContain("ghp_");
    } finally {
      occupied.stop(true);
    }
  });

  test("supports PokeEdge dashboard install dry-run", async () => {
    const { exitCode, stdout, stderr } = await runAdv([
      "dashboard",
      "install",
      "--profile",
      "pokeedge",
      "--dry-run",
      "--home",
      "/home/example",
    ]);

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain("MUTATION PLAN: dashboard install");
    expect(stdout).toContain("No changes were made (--dry-run).");
    expect(stdout).toContain("adv-dashboard-pokeedge.service");
    expect(stdout).toContain("/home/example/.config/advance/dashboard/pokeedge.json");
    expect(stdout).toContain("systemctl --user daemon-reload");
    expect(stdout).toContain("systemctl --user enable --now adv-dashboard-pokeedge.service");
  });

  test("supports PokeEdge dashboard doctor dry-run", async () => {
    const { exitCode, stdout, stderr } = await runAdv([
      "dashboard",
      "doctor",
      "--profile",
      "pokeedge",
      "--dry-run",
      "--home",
      "/home/example",
    ]);

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain("adv-dashboard-pokeedge.service");
    expect(stdout).toContain("loginctl show-user");
    expect(stdout).toContain("journalctl --user -u adv-dashboard-pokeedge.service");
  });
});
