import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { describe, expect, test } from "vitest";

const REPO_ROOT = resolve(__dirname, "../..");
const AUTO_RELEASE_WORKFLOW_PATH = join(
  REPO_ROOT,
  ".github/workflows/auto-release.yml",
);
const INSTALL_SCRIPT_PATH = join(REPO_ROOT, "install.sh");

describe("GitHub release installer artifact", () => {
  const workflow = readFileSync(AUTO_RELEASE_WORKFLOW_PATH, "utf8");

  test("release archive is a full install payload, not plugin-only", () => {
    expect(workflow).not.toContain(
      'tar -czf "dist/advance-${VERSION}.tar.gz" -C plugin dist/ src/ package.json pnpm-lock.yaml',
    );

    for (const requiredPath of [
      "plugin/dist",
      "plugin/src",
      "plugin/package.json",
      "plugin/pnpm-lock.yaml",
      "scripts/deploy-local.sh",
      "install.sh",
      ".opencode/command",
      ".opencode/agents",
      ".opencode/overlays",
      "skills",
      "README.md",
      "SETUP.md",
      "ADV_INSTRUCTIONS.md",
      "AGENTS.md",
      "project.md",
      "project.json",
    ]) {
      expect(workflow).toContain(requiredPath);
    }
  });

  test("release publishes conventional SHA256 checksums", () => {
    expect(workflow).toContain("SHA256SUMS.txt");
    expect(workflow).toContain("dist/SHA256SUMS.txt");
    expect(workflow).not.toContain("dist/checksums.txt");
  });
});

describe("latest-release installer", () => {
  const installer = existsSync(INSTALL_SCRIPT_PATH)
    ? readFileSync(INSTALL_SCRIPT_PATH, "utf8")
    : "";

  test("root install.sh exists and resolves latest without hardcoded versions", () => {
    expect(existsSync(INSTALL_SCRIPT_PATH)).toBe(true);
    expect(installer).toContain("ADV_VERSION");
    expect(installer).toContain("/releases/latest");
    expect(installer).toContain("url_effective");
    expect(installer).toContain("advance-${ADV_VERSION}.tar.gz");
    expect(installer).not.toMatch(/ADV_VERSION=.*v\d+\.\d+\.\d+/);
  });

  test("installer verifies downloads before delegating to deploy-local", () => {
    for (const requiredSnippet of [
      "SHA256SUMS.txt",
      "sha256sum --check --ignore-missing SHA256SUMS.txt",
      "tar -tzf",
      "scripts/deploy-local.sh",
      "--fix",
      "mktemp -d",
      "trap cleanup EXIT",
    ]) {
      expect(installer).toContain(requiredSnippet);
    }
  });
});
