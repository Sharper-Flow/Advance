import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  compareSdkParity,
  decideNetworkAction,
  fetchLatestPluginVersion,
  parseVersion,
  resolveLockedPluginVersion,
  runCheck,
} from "./check-sdk-parity.js";

const validLockfile = `lockfileVersion: '9.0'
settings:
  autoInstallPeers: true
importers:
  .:
    dependencies:
      '@modelcontextprotocol/sdk':
        specifier: ^1.29.0
        version: 1.29.0(zod@4.4.3)
      '@opencode-ai/plugin':
        specifier: ^1.18.4
        version: 1.18.4
`;

const lockfileMissingPlugin = `lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      zod:
        specifier: ^4.4.3
        version: 4.4.3
`;

describe("resolveLockedPluginVersion", () => {
  it("parses a valid v9 importer block", () => {
    const result = resolveLockedPluginVersion(validLockfile);
    expect(result.version).toBe("1.18.4");
    expect(result.specifier).toBe("^1.18.4");
  });

  it("errors loudly when the importer block is missing @opencode-ai/plugin", () => {
    expect(() => resolveLockedPluginVersion(lockfileMissingPlugin)).toThrow(
      /SDK_PARITY_MISSING_IMPORTER/,
    );
  });

  it("errors loudly when YAML is malformed", () => {
    expect(() => resolveLockedPluginVersion("not: yaml: [")).toThrow(
      /SDK_PARITY_MALFORMED_LOCKFILE/,
    );
  });
});

describe("parseVersion", () => {
  it("extracts major/minor/patch from clean SemVer", () => {
    expect(parseVersion("1.18.4")).toEqual({
      major: 1,
      minor: 18,
      patch: 4,
      raw: "1.18.4",
    });
  });

  it("strips peer-dependency suffixes when they exist", () => {
    expect(parseVersion("1.18.4(react@18)")).toEqual({
      major: 1,
      minor: 18,
      patch: 4,
      raw: "1.18.4(react@18)",
    });
  });

  it("rejects non-SemVer strings", () => {
    expect(() => parseVersion("not-a-version")).toThrow(
      /SDK_PARITY_BAD_VERSION/,
    );
  });
});

describe("compareSdkParity", () => {
  it("passes when major+minor match", () => {
    expect(compareSdkParity({ major: 1, minor: 18 }, { major: 1, minor: 18 })).toEqual({
      ok: true,
      reason: "lockfile 1.18 >= latest 1.18",
    });
  });

  it("fails when lockfile minor lags latest", () => {
    expect(compareSdkParity({ major: 1, minor: 16 }, { major: 1, minor: 18 })).toEqual({
      ok: false,
      reason: "SDK_PARITY_MINOR_LAG: lockfile 1.16 < latest 1.18",
    });
  });

  it("fails when majors differ", () => {
    expect(compareSdkParity({ major: 1, minor: 18 }, { major: 2, minor: 0 })).toEqual({
      ok: false,
      reason: "SDK_PARITY_MAJOR_MISMATCH: lockfile 1.18 vs latest 2.0",
    });
  });

  it("passes when lockfile minor is ahead of latest", () => {
    expect(compareSdkParity({ major: 1, minor: 19 }, { major: 1, minor: 18 }).ok).toBe(true);
  });
});

describe("fetchLatestPluginVersion", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the version from the registry response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ version: "1.19.0" }),
      }),
    );

    const version = await fetchLatestPluginVersion("https://example.test/latest");
    expect(version).toBe("1.19.0");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("retries on failure and eventually throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));

    await expect(
      fetchLatestPluginVersion("https://example.test/latest", 2, 10),
    ).rejects.toThrow(/SDK_PARITY_REGISTRY_FAIL/);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe("decideNetworkAction", () => {
  it("requires failure in CI", () => {
    expect(decideNetworkAction(true)).toEqual({
      action: "fail",
      message: "SDK_PARITY_FAIL (registry unreachable in CI)",
    });
  });

  it("allows skipping outside CI", () => {
    expect(decideNetworkAction(false)).toEqual({
      action: "skip",
      message: "SDK_PARITY_SKIP (registry unreachable)",
    });
  });
});

describe("runCheck network-failure policy", () => {
  let tempDir: string;
  let tempLockfile: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "sdk-parity-"));
    tempLockfile = join(tempDir, "pnpm-lock.yaml");
    writeFileSync(tempLockfile, validLockfile);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fails in CI when the registry is unreachable", async () => {
    await expect(runCheck({ lockfilePath: tempLockfile, ci: true })).rejects.toThrow(
      /SDK_PARITY_FAIL \(registry unreachable in CI\)/,
    );
  });

  it("skips outside CI when the registry is unreachable", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runCheck({ lockfilePath: tempLockfile, ci: false });

    expect(logSpy).toHaveBeenCalledWith("SDK_PARITY_SKIP (registry unreachable)");
    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});
