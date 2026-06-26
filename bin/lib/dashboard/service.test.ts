import { describe, expect, test } from "bun:test";

import {
  buildDashboardDoctorReport,
  buildDashboardServiceUnit,
  dashboardServicePaths,
  parseLingerEnabled,
} from "./service";

describe("dashboard user service", () => {
  test("generates PokeEdge service paths under user config", () => {
    expect(dashboardServicePaths("pokeedge", "/home/example")).toEqual({
      configPath: "/home/example/.config/advance/dashboard/pokeedge.json",
      serviceDir: "/home/example/.config/systemd/user",
      servicePath: "/home/example/.config/systemd/user/adv-dashboard-pokeedge.service",
      serviceName: "adv-dashboard-pokeedge.service",
    });
  });

  test("generates a restart-safe fixed-port user systemd unit", () => {
    const unit = buildDashboardServiceUnit({
      profile: "pokeedge",
      advPath: "/home/example/dev/advance/bin/adv",
      homeDir: "/home/example",
      pathEnv: "/home/example/.bun/bin:/usr/bin:/bin",
    });

    expect(unit).toContain("Description=ADV PokeEdge Dashboard (User)");
    expect(unit).toContain("StartLimitIntervalSec=60");
    expect(unit).toContain("StartLimitBurst=3");
    expect(unit).toContain("ExecStart=/home/example/dev/advance/bin/adv dashboard --config %h/.config/advance/dashboard/pokeedge.json");
    expect(unit).toContain("Restart=on-failure");
    expect(unit).toContain("RestartPreventExitStatus=75");
    expect(unit).toContain("WantedBy=default.target");
    expect(unit).not.toContain("--port");
    expect(unit).not.toContain("open ");
  });

  test("parses linger status and reports remediation", async () => {
    expect(parseLingerEnabled("Linger=yes\n")).toBe(true);
    expect(parseLingerEnabled("Linger=no\n")).toBe(false);

    const report = await buildDashboardDoctorReport({
      profile: "pokeedge",
      homeDir: "/home/example",
      readText: async (path) => (path.endsWith("pokeedge.json") ? "{}" : "[Unit]\n"),
      exec: async (cmd) =>
        cmd[0] === "loginctl"
          ? { exitCode: 0, stdout: "Linger=no\n", stderr: "" }
          : { exitCode: 0, stdout: "active\n", stderr: "" },
    });

    expect(report.ok).toBe(false);
    expect(report.checks.map((check) => check.code)).toContain("LINGER_DISABLED");
    expect(report.remediation.some((item) => item.startsWith("loginctl enable-linger"))).toBe(true);
  });
});
