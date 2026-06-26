import { describe, expect, test } from "bun:test";

import { renderDashboardHtml } from "./ui";

describe("dashboard UI", () => {
  test("renders read-only dashboard shell with lanes, evidence, degraded labels, and polling", () => {
    const html = renderDashboardHtml();

    expect(html).toContain("ADV Local Dashboard");
    expect(html).toContain("project-stats");
    expect(html).toContain("lane-head");
    expect(html).toContain('data-lane="attention"');
    expect(html).toContain('data-lane="running"');
    expect(html).toContain('data-lane="linked"');
    expect(html).toContain('data-lane="unlinked"');
    expect(html).toContain("Evidence");
    expect(html).toContain("Status");
    expect(html).toContain("Source states");
    expect(html).toContain("Degraded");
    expect(html).toContain("last successful refresh");
    expect(html).toContain("/api/state");
    expect(html).toContain("refresh_seconds");
  });

  test("keeps ADV change cards compact and degraded sources single-lane", () => {
    const html = renderDashboardHtml();

    expect(html).toContain(
      "if (item.kind === 'adv_change') return advChangeHtml(item)",
    );
    expect(html).toContain("Next gate");
    expect(html).toContain("gate-badge");
    expect(html).toContain("gateClass(gate)");
    expect(html).not.toContain("status <code>' + escapeHtml(item.status");
    expect(html).not.toContain(
      "(project.degradedSources || []).map(degradedHtml)",
    );
  });

  test("does not render mutation controls", () => {
    const html = renderDashboardHtml().toLowerCase();
    for (const forbidden of [
      "rerun",
      "approve",
      "merge",
      "deploy",
      "cancel",
      "archive",
    ]) {
      expect(html).not.toContain(`>${forbidden}<`);
      expect(html).not.toContain(`aria-label=\"${forbidden}`);
    }
    expect(html).not.toContain("<form");
    expect(html).not.toContain('method="post"');
  });
});
