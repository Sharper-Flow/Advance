import { describe, expect, test } from "bun:test";

import { buildRadonCommand, normalizeRadonJson, normalizeRadonOutput } from "./radon";
import { buildVultureCommand, normalizeVultureOutput } from "./vulture";
import { buildGocycloCommand, normalizeGocycloOutput } from "./gocyclo";
import { buildGoDeadcodeCommand, normalizeGoDeadcodeOutput } from "./go-deadcode";

describe("Python and Go slop adapters", () => {
  test("normalizes Radon complexity output", () => {
    const findings = normalizeRadonOutput(
      [{ type: "function", name: "hard", lineno: 3, col_offset: 0, complexity: 14, rank: "C" }],
      "src/app.py",
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      id: "MAINT-004",
      name: "python_complexity_hotspot",
      file: "src/app.py",
      line: 3,
      complexity: 14,
      detectionMethod: "ast",
    });
  });

  test("normalizes Radon JSON keyed by file path", () => {
    const findings = normalizeRadonJson(
      JSON.stringify({
        "/repo/pkg/service.py": [
          { type: "method", name: "Service.hard", lineno: 20, complexity: 18, rank: "C" },
        ],
      }),
      "/repo",
    );

    expect(findings[0]).toMatchObject({ file: "pkg/service.py", line: 20, complexity: 18 });
  });

  test("normalizes Vulture confidence output as review-required deletion candidates", () => {
    const findings = normalizeVultureOutput(
      "pkg/service.py:12: unused function 'legacy' (60% confidence)",
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      id: "MAINT-003",
      name: "python_unused_code",
      file: "pkg/service.py",
      line: 12,
      actionability: "review_required",
      grouping: "user-review",
    });
  });

  test("normalizes gocyclo output", () => {
    const findings = normalizeGocycloOutput("12 main hard pkg/main.go:8:1");

    expect(findings[0]).toMatchObject({
      id: "MAINT-004",
      name: "go_complexity_hotspot",
      file: "pkg/main.go",
      line: 8,
      complexity: 12,
    });
  });

  test("normalizes Go deadcode output", () => {
    const findings = normalizeGoDeadcodeOutput("greet.go:23: unreachable func: goodbye");

    expect(findings[0]).toMatchObject({
      id: "MAINT-003",
      name: "go_unreachable_function",
      file: "greet.go",
      line: 23,
      actionability: "review_required",
      grouping: "user-review",
    });
  });

  test("builds local executable commands without network installers", () => {
    const commands = [
      buildRadonCommand("src"),
      buildVultureCommand("src"),
      buildGocycloCommand(".", 10),
      buildGoDeadcodeCommand("./..."),
    ];

    for (const command of commands) {
      expect(command.join(" ")).not.toContain(" dlx ");
      expect(command.join(" ")).not.toContain(" npx ");
      expect(command.join(" ")).not.toContain(" go install ");
      expect(command.join(" ")).not.toContain(" pip install ");
    }
  });
});
