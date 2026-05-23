import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { describe, expect, test } from "vitest";

const REPO_ROOT = resolve(__dirname, "../..");
const AUTO_RELEASE_WORKFLOW_PATH = join(
  REPO_ROOT,
  ".github/workflows/auto-release.yml",
);
const INSTALL_SCRIPT_PATH = join(REPO_ROOT, "install.sh");
const README_PATH = join(REPO_ROOT, "README.md");
const SETUP_PATH = join(REPO_ROOT, "SETUP.md");

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
    expect(workflow).toContain("dist/install.sh");
    expect(workflow).not.toContain("dist/checksums.txt");
  });

  test("release workflow guards adjacent versioning and concurrency edge cases", () => {
    expect(workflow).toContain("concurrency:");
    expect(workflow).toContain(
      "auto-release-${{ github.event.workflow_run.head_branch }}",
    );
    expect(workflow).toContain('if [ -z "$COMMITS" ]; then');
    expect(workflow).toContain('CURRENT="${CURRENT%%-*}"');
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
      "validate_archive_paths",
      "Archive contains unsafe path",
      "Malformed checksum",
      "Checksum verification failed for ${ASSET}",
      "plugin/dist/index.js",
      "scripts/deploy-local.sh",
      "--fix",
      "mktemp -d",
      "trap cleanup EXIT",
    ]) {
      expect(installer).toContain(requiredSnippet);
    }
    expect(installer).toContain("while read -r checksum filename");
    expect(installer).not.toContain("while IFS= read -r checksum filename");
  });
});

describe("release installation docs", () => {
  const readme = readFileSync(README_PATH, "utf8");
  const setup = readFileSync(SETUP_PATH, "utf8");

  test("README presents one primary user install path", () => {
    expect(readme).toContain("releases/latest/download/install.sh");
    expect(readme).toContain("releases/latest/download/install.sh | bash");
    expect(readme).toContain("downloads the latest GitHub Release artifact");
    expect(readme).not.toMatch(
      /git clone.*Advance\.git[\s\S]*deploy-local\.sh --fix/,
    );
  });

  test("SETUP separates user install from maintainer setup and fallback paths", () => {
    for (const requiredSnippet of [
      "### User install (recommended)",
      "releases/latest/download/install.sh",
      "### Manual release artifact install",
      "ADV_VERSION=",
      "### Maintainer/developer setup",
      "git clone https://github.com/Sharper-Flow/Advance.git",
      "./scripts/deploy-local.sh --fix",
    ]) {
      expect(setup).toContain(requiredSnippet);
    }
  });

  test("SETUP documents release-install failure modes", () => {
    for (const requiredSnippet of [
      "jq not found",
      "rsync not found",
      "pnpm not found",
      "sha256sum not found",
      "chmod +x install.sh",
      "Release artifact is incomplete",
    ]) {
      expect(setup).toContain(requiredSnippet);
    }
  });
});
