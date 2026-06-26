import { readFile } from "fs/promises";
import { join } from "path";

import {
  dashboardProfileConfigPath,
  type DashboardProfile,
} from "./config";

export const DASHBOARD_PORT_IN_USE_EXIT_CODE = 75;

export interface DashboardServicePaths {
  configPath: string;
  serviceDir: string;
  servicePath: string;
  serviceName: string;
}

export interface DashboardServiceUnitOptions {
  profile: DashboardProfile;
  advPath: string;
  homeDir: string;
  pathEnv: string;
}

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type CommandExec = (cmd: string[]) => Promise<CommandResult>;
export type ReadText = (path: string) => Promise<string>;

export interface DoctorCheck {
  code: string;
  ok: boolean;
  message: string;
}

export interface DashboardDoctorReport {
  ok: boolean;
  checks: DoctorCheck[];
  remediation: string[];
}

export interface DashboardDoctorOptions {
  profile: DashboardProfile;
  homeDir: string;
  readText?: ReadText;
  exec?: CommandExec;
  user?: string;
}

export function dashboardServicePaths(
  profile: DashboardProfile,
  homeDir: string,
): DashboardServicePaths {
  const serviceName = `adv-dashboard-${profile}.service`;
  const serviceDir = join(homeDir, ".config", "systemd", "user");
  return {
    configPath: dashboardProfileConfigPath(profile, homeDir),
    serviceDir,
    servicePath: join(serviceDir, serviceName),
    serviceName,
  };
}

export function buildDashboardServiceUnit(
  options: DashboardServiceUnitOptions,
): string {
  const paths = dashboardServicePaths(options.profile, options.homeDir);
  return `[Unit]
Description=ADV PokeEdge Dashboard (User)
Documentation=https://github.com/Sharper-Flow/Advance
After=default.target
StartLimitIntervalSec=60
StartLimitBurst=3

[Service]
Type=simple
ExecStart=${options.advPath} dashboard --config %h/.config/advance/dashboard/pokeedge.json
Restart=on-failure
RestartSec=5
RestartPreventExitStatus=${DASHBOARD_PORT_IN_USE_EXIT_CODE}
Environment="PATH=${options.pathEnv}"
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${paths.serviceName.replace(/\.service$/, "")}

[Install]
WantedBy=default.target
`;
}

export function parseLingerEnabled(output: string): boolean | undefined {
  const match = output.match(/^Linger=(yes|no)$/m);
  if (!match) return undefined;
  return match[1] === "yes";
}

export async function buildDashboardDoctorReport(
  options: DashboardDoctorOptions,
): Promise<DashboardDoctorReport> {
  const paths = dashboardServicePaths(options.profile, options.homeDir);
  const readText = options.readText ?? ((path: string) => readFile(path, "utf-8"));
  const exec = options.exec ?? defaultExec;
  const user = options.user ?? process.env.USER ?? "";
  const checks: DoctorCheck[] = [];
  const remediation: string[] = [];

  await checkReadable(readText, paths.configPath, checks, remediation, "CONFIG_PRESENT");
  await checkReadable(readText, paths.servicePath, checks, remediation, "SERVICE_PRESENT");

  const linger = await exec(["loginctl", "show-user", user, "--property=Linger"]);
  const lingerEnabled = linger.exitCode === 0 ? parseLingerEnabled(linger.stdout) : undefined;
  if (lingerEnabled) {
    checks.push({ code: "LINGER_ENABLED", ok: true, message: "User lingering is enabled." });
  } else {
    checks.push({ code: "LINGER_DISABLED", ok: false, message: "User lingering is not enabled." });
    remediation.push(`loginctl enable-linger ${user || "$USER"}`);
  }

  const service = await exec(["systemctl", "--user", "is-active", paths.serviceName]);
  const active = service.exitCode === 0 && service.stdout.trim() === "active";
  checks.push({
    code: active ? "SERVICE_ACTIVE" : "SERVICE_NOT_ACTIVE",
    ok: active,
    message: active ? "Dashboard service is active." : "Dashboard service is not active.",
  });
  if (!active) remediation.push(`systemctl --user enable --now ${paths.serviceName}`);

  return { ok: checks.every((check) => check.ok), checks, remediation };
}

async function checkReadable(
  readText: ReadText,
  path: string,
  checks: DoctorCheck[],
  remediation: string[],
  code: string,
): Promise<void> {
  try {
    await readText(path);
    checks.push({ code, ok: true, message: `${path} exists.` });
  } catch {
    checks.push({ code, ok: false, message: `${path} is missing.` });
    remediation.push("adv dashboard install --profile pokeedge");
  }
}

async function defaultExec(cmd: string[]): Promise<CommandResult> {
  const bun = (globalThis as any).Bun;
  if (!bun || typeof bun.spawn !== "function") {
    return { exitCode: 127, stdout: "", stderr: "Bun.spawn unavailable" };
  }
  const proc = bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stdout, stderr };
}
