import { describe, expect, test } from "bun:test";

import { renderDashboardHtml } from "./ui";

describe("dashboard UI", () => {
  test("renders read-only dashboard shell with ADV-centered status lanes", () => {
    const html = renderDashboardHtml();

    expect(html).toContain("ADV Local Dashboard");
    expect(html).toContain("project-stats");
    expect(html).toContain("lane-head");
    expect(html).toContain('data-lane="needs_attention"');
    expect(html).toContain('data-lane="running"');
    expect(html).toContain('data-lane="ready_landed"');
    expect(html).toContain('data-lane="backlog"');
    expect(html).toContain('data-lane="unmatched_source"');
    expect(html).toContain("Needs attention");
    expect(html).toContain("Running");
    expect(html).toContain("Ready / landed");
    expect(html).toContain("Backlog / inventory");
    expect(html).toContain("Unmatched source");
    expect(html).toContain("Evidence");
    expect(html).toContain("Status");
    expect(html).toContain("metadataHtml(item.metadata)");
    expect(html).toContain("item.url");
    expect(html).toContain("safeUrl(item.url)");
    expect(html).toContain("url.protocol === 'https:' || url.protocol === 'http:'");
    expect(html).toContain("item.updated_at");
    expect(html).toContain("Source states");
    expect(html).toContain("Degraded");
    expect(html).toContain("last successful refresh");
    expect(html).toContain("/api/state");
    expect(html).toContain("refresh_seconds");
  });

  test("renders ADV change status cards with latest source summaries", () => {
    const html = renderDashboardHtml();

    expect(html).toContain(
      "if (item.kind === 'adv_change_status') return changeStatusHtml(item)",
    );
    expect(html).toContain("Next gate");
    expect(html).toContain("Latest CI");
    expect(html).toContain("Latest deployment");
    expect(html).toContain("Latest PR");
    expect(html).toContain("sourceSummaryHtml");
    expect(html).toContain("Source details");
    expect(html).toContain("gate-badge");
    expect(html).toContain("gateClass(gate)");
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

  test("renders a safe inline GitHub setup card for auth-unavailable degraded state", () => {
    const html = renderDashboardHtml();

    expect(html).toContain("githubSetupHtml");
    expect(html).toContain("Connect GitHub locally");
    expect(html).toContain("gh auth login");
    expect(html).toContain("GITHUB_TOKEN");
    expect(html).not.toContain("stderr");
    expect(html).not.toContain("ghp_secret123");
  });

  test("distinguishes unmatched source from GitHub authentication", () => {
    const html = renderDashboardHtml();

    expect(html).toContain("Unmatched source item");
    expect(html).not.toContain("Unmatched GitHub auth");
  });

  test("renders grouped lane items through safe read-only disclosures", () => {
    const html = renderDashboardHtml();

    expect(html).toContain("if (item.kind === 'group') return groupHtml(item)");
    expect(html).toContain("<details class=\"group-card\"");
    expect(html).toContain("<summary>");
    expect(html).toContain("group.count");
    expect(html).toContain("group.latestUpdatedAt");
    expect(html).toContain("(group.items || []).slice(0, limit)");
    expect(html).toContain("hiddenCount");
    expect(html).toContain("safeUrl(item.url)");
    expect(html).toContain("escapeHtml(group.title");
    expect(html).not.toContain("'<summary><a");
    expect(html).not.toContain("method=\"post\"");
  });
});
