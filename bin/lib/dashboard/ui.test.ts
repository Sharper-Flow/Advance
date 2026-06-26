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
    const changeStatusFunction = html.slice(
      html.indexOf("function changeStatusHtml"),
      html.indexOf("function sourceSummaryHtml"),
    );

    expect(html).toContain(
      "if (item.kind === 'adv_change_status') return changeStatusHtml(item, projectId)",
    );
    expect(html).toContain("Next gate");
    expect(changeStatusFunction).toContain("Gate progress");
    expect(changeStatusFunction).toContain("item.progress");
    expect(changeStatusFunction).not.toContain("<strong>Status</strong>");
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

    expect(html).toContain("if (item.kind === 'group') return groupHtml(item, projectId)");
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

  test("links ADV change cards to local same-origin detail path", () => {
    const html = renderDashboardHtml();

    // detail href is built from project id + change id, escaped, encoded
    expect(html).toContain("changeDetailHref");
    expect(html).toContain("'/change/'");
    expect(html).toContain("encodeURIComponent");
    // advChangeHtml and changeStatusHtml receive a project id from render scope
    expect(html).toContain("advChangeHtml(item, projectId)");
    expect(html).toContain("changeStatusHtml(item, projectId)");
    expect(html).toContain("itemHtml(item, projectId)");
    // class hook for the clickable change link
    expect(html).toContain("change-link");
    // links are local detail paths, never external, never to ADV state files
    expect(html).not.toContain("target=\"_blank\" rel=\"noreferrer noopener\">Open detail");
    expect(html).not.toContain("change.json");
  });

  test("renders detail mode by fetching the local detail endpoint", () => {
    const html = renderDashboardHtml();

    // path detection: detail mode when location starts with /change/
    expect(html).toContain("/change/");
    expect(html).toContain("isDetailPath");
    // detail fetch hits /api/change/, not /api/state
    expect(html).toContain("'/api/change/'");
    expect(html).toContain("renderDetail");
    // detail route still uses GET only
    expect(html).toContain("{ method: 'GET' }");
  });

  test("renders compact change detail fields read-only", () => {
    const html = renderDashboardHtml();
    const detailFn = html.slice(
      html.indexOf("function renderDetail"),
      html.indexOf("function loadDetail"),
    );

    expect(detailFn).toContain("detail.change");
    expect(detailFn).toContain("detail.command");
    // compact fields: title, id, gate, progress, lastActivity, status, branches, paths
    expect(detailFn).toContain("firstIncompleteGate");
    expect(detailFn).toContain("gateProgressStr");
    expect(detailFn).toContain("lastActivityAt");
    expect(detailFn).toContain("correlation_keys");
    expect(detailFn).toContain("branches");
    expect(detailFn).toContain("paths");
    // copyable command rendered in a code block, no execution control
    expect(detailFn).toContain("detail-command");
    expect(html).not.toContain(">Run command<");
  });

  test("renders deeper context only when present via disclosure", () => {
    const html = renderDashboardHtml();

    expect(html).toContain("function deeperHtml");
    expect(html).toContain("detail.deeper");
    expect(html).toContain("<details class=\"deeper\"");
    // deeper is rendered as escaped JSON text, never as raw HTML
    expect(html).toContain("JSON.stringify(detail.deeper");
  });

  test("renders detail-mode degraded sources as source-health context", () => {
    const html = renderDashboardHtml();

    // detail degraded sources reuse the source-health renderer
    expect(html).toContain("detail.degradedSources");
    expect(html).toContain("sourceHealthHtml");
    // source-health renders source, code, project/repo, remediation, last success
    expect(html).toContain("Source health");
    expect(html).toContain("source.affected");
    expect(html).toContain("source.remediation");
    expect(html).toContain("last_success_at");
    // it must read as source-health, not as ADV change failure
    expect(html).not.toContain("ADV change failed");
    expect(html).not.toContain("Change failure");
  });

  test("detail mode keeps escaping, safe URLs, and no mutation controls", () => {
    const html = renderDashboardHtml().toLowerCase();
    // no mutation verbs surface as control text in detail mode
    for (const forbidden of [
      "rerun",
      "approve",
      "merge",
      "deploy",
      "cancel",
      "archive",
    ]) {
      expect(html).not.toContain(`>${forbidden}<`);
    }
    expect(html).not.toContain("<form");
    expect(html).not.toContain('method="post"');
    // detail mode still routes external links through safeUrl
    expect(html).toContain("safeurl(");
    // never link to raw ADV state files
    expect(html).not.toContain("change.json");
    expect(html).not.toContain("agreement.md");
  });
});
