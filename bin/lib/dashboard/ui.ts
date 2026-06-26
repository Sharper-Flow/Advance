export function renderDashboardHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ADV Local Dashboard</title>
  <style>
    :root {
      color-scheme: light dark;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --surface: color-mix(in srgb, CanvasText 4%, Canvas);
      --surface-strong: color-mix(in srgb, CanvasText 7%, Canvas);
      --border: color-mix(in srgb, CanvasText 16%, transparent);
      --muted: color-mix(in srgb, CanvasText 62%, transparent);
      --accent: #38bdf8;
      --warning: #f97316;
      --success: #22c55e;
    }
    body { margin: 0; padding: 1.4rem; background: radial-gradient(circle at top left, color-mix(in srgb, var(--accent) 10%, Canvas) 0, Canvas 24rem); color: CanvasText; font-size: 14px; line-height: 1.45; }
    header { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; margin: 0 auto 1.25rem; max-width: 96rem; }
    h1 { margin: 0 0 .45rem; font-size: clamp(1.55rem, 2vw, 2.05rem); letter-spacing: -.035em; }
    h2 { margin: 0; font-size: 1.15rem; letter-spacing: -.015em; }
    h3 { margin: 0; font-size: .76rem; text-transform: uppercase; letter-spacing: .09em; color: var(--muted); }
    .subtitle { max-width: 42rem; }
    #freshness { text-align: right; white-space: nowrap; font-size: .8rem; }
    #app { max-width: 96rem; margin: 0 auto; }
    .project { border: 1px solid var(--border); border-radius: 1rem; padding: 1rem; margin: 1rem 0; background: color-mix(in srgb, Canvas 84%, CanvasText 4%); box-shadow: 0 16px 50px color-mix(in srgb, CanvasText 8%, transparent); }
    .project-head { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; margin-bottom: 1rem; }
    .project-path { margin: .35rem 0 0; font-size: .82rem; color: var(--muted); }
    .project-stats { display: flex; flex-wrap: wrap; gap: .45rem; justify-content: flex-end; }
    .stat { min-width: 4.5rem; padding: .45rem .55rem; border: 1px solid var(--border); border-radius: .75rem; background: var(--surface); text-align: right; }
    .stat-value { display: block; font-size: 1.05rem; font-weight: 720; line-height: 1; }
    .stat-label { display: block; margin-top: .2rem; font-size: .68rem; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
    .lanes { display: grid; grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr)); gap: .85rem; }
    .lane { min-height: 8rem; border: 1px solid color-mix(in srgb, var(--border) 70%, transparent); border-radius: .85rem; padding: .8rem; background: var(--surface); }
    .lane-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: .7rem; }
    .lane-count { font-size: .72rem; color: var(--muted); }
    .item { margin: .55rem 0; padding: .6rem .7rem; border: 1px solid color-mix(in srgb, var(--border) 60%, transparent); border-left: 3px solid currentColor; border-radius: .65rem; background: color-mix(in srgb, Canvas 72%, CanvasText 5%); }
    .group-card { margin: .55rem 0; padding: .6rem .7rem; border: 1px solid color-mix(in srgb, var(--border) 60%, transparent); border-left: 3px solid var(--accent); border-radius: .65rem; background: color-mix(in srgb, Canvas 76%, CanvasText 4%); }
    .group-card summary { cursor: pointer; font-weight: 680; }
    .group-meta { margin: .35rem 0 .2rem; color: var(--muted); font-size: .78rem; }
    .group-items { margin-top: .5rem; }
    .hidden-count { margin: .45rem 0 0; font-size: .78rem; color: var(--muted); }
    .setup-card { border-left-color: var(--warning); background: color-mix(in srgb, var(--warning) 10%, Canvas); }
    .setup-card ul { margin: .45rem 0 0; padding-left: 1.1rem; }
    .adv-change { display: grid; gap: .45rem; border-left-color: var(--accent); }
    .change-title { font-weight: 650; line-height: 1.25; letter-spacing: -.01em; }
    .change-id { font-size: .76rem; color: var(--muted); }
    .gate-row { display: flex; align-items: center; justify-content: space-between; gap: .75rem; margin-top: .15rem; }
    .gate-label { font-size: .68rem; text-transform: uppercase; letter-spacing: .09em; color: var(--muted); }
    .gate-badge { font-size: 1.08rem; line-height: 1; padding: .42rem .68rem; border-radius: .8rem; background: color-mix(in srgb, var(--accent) 18%, transparent); color: color-mix(in srgb, var(--accent) 76%, CanvasText); font-weight: 760; letter-spacing: -.02em; }
    .gate-acceptance, .gate-release { background: color-mix(in srgb, var(--warning) 18%, transparent); color: color-mix(in srgb, var(--warning) 82%, CanvasText); }
    .gate-complete { background: color-mix(in srgb, var(--success) 18%, transparent); color: color-mix(in srgb, var(--success) 82%, CanvasText); }
    .muted { opacity: .72; }
    .degraded { color: #b45309; }
    .change-link { color: inherit; text-decoration: none; border-bottom: 1px solid color-mix(in srgb, var(--accent) 55%, transparent); }
    .change-link:hover, .change-link:focus-visible { border-bottom-color: var(--accent); outline: none; }
    .detail { max-width: 60rem; margin: 0 auto; }
    .detail-back { display: inline-block; margin-bottom: 1rem; font-size: .82rem; }
    .detail-card { border: 1px solid var(--border); border-radius: 1rem; padding: 1.1rem 1.2rem; background: var(--surface); }
    .detail-grid { display: grid; grid-template-columns: max-content 1fr; gap: .35rem .9rem; margin: .8rem 0; }
    .detail-grid dt { color: var(--muted); font-size: .72rem; text-transform: uppercase; letter-spacing: .08em; }
    .detail-grid dd { margin: 0; }
    .detail-command { display: block; margin: .4rem 0 0; padding: .55rem .7rem; border: 1px solid var(--border); border-radius: .6rem; background: var(--surface-strong); overflow-x: auto; }
    .detail-list { margin: .25rem 0 0; padding-left: 1.05rem; }
    .deeper { margin-top: 1rem; }
    .deeper pre { margin: .5rem 0 0; padding: .65rem .75rem; border: 1px solid var(--border); border-radius: .6rem; background: var(--surface-strong); overflow-x: auto; white-space: pre-wrap; word-break: break-word; }
    .source-health { margin: .55rem 0; padding: .6rem .7rem; border: 1px solid color-mix(in srgb, var(--warning) 40%, var(--border)); border-left: 3px solid var(--warning); border-radius: .65rem; background: color-mix(in srgb, var(--warning) 8%, Canvas); }
    .source-health-head { font-weight: 650; }
    code { font-size: .9em; }
    @media (max-width: 760px) {
      body { padding: .9rem; }
      header, .project-head { display: block; }
      #freshness { text-align: left; white-space: normal; }
      .project-stats { justify-content: flex-start; margin-top: .75rem; }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>ADV Local Dashboard</h1>
      <p class="muted">Read-only local view of ADV, GitHub, deployment, and ops state.</p>
    </div>
    <p id="freshness" class="muted">Loading…</p>
  </header>
  <main id="app" aria-live="polite"></main>
  <template id="lane-template">
    <section class="lane" data-lane="needs_attention"></section>
    <section class="lane" data-lane="running"></section>
    <section class="lane" data-lane="ready_landed"></section>
    <section class="lane" data-lane="backlog"></section>
    <section class="lane" data-lane="unmatched_source"></section>
  </template>
  <template id="empty-template"><p class="muted">No items.</p></template>
  <script>
    const app = document.getElementById('app');
    const freshness = document.getElementById('freshness');
    const laneDefinitions = [
      { name: 'needs_attention', label: 'Needs attention' },
      { name: 'running', label: 'Running' },
      { name: 'ready_landed', label: 'Ready / landed' },
      { name: 'backlog', label: 'Backlog / inventory' },
      { name: 'unmatched_source', label: 'Unmatched source' },
    ];
    const laneNames = laneDefinitions.map((lane) => lane.name);
    let lastSuccessfulRefreshAt = '';

    function text(value) { return value == null ? '' : String(value); }
    function changeDetailHref(projectId, changeId) {
      const pid = text(projectId).trim();
      const cid = text(changeId).trim();
      if (!pid || !cid) return '';
      return '/change/' + encodeURIComponent(pid) + '/' + encodeURIComponent(cid);
    }
    function changeLink(projectId, changeId, label) {
      const href = changeDetailHref(projectId, changeId);
      if (!href) return escapeHtml(label);
      return '<a class="change-link" href="' + escapeHtml(href) + '">' + escapeHtml(label) + '</a>';
    }
    function itemHtml(item, projectId) {
      if (item.kind === 'group') return groupHtml(item, projectId);
      if (item.kind === 'adv_change_status') return changeStatusHtml(item, projectId);
      if (item.kind === 'adv_change') return advChangeHtml(item, projectId);
      const title = '<div class="item-title">' + escapeHtml(item.title || item.kind || 'Item') + '</div>';
      const subtitle = item.subtitle ? '<div class="item-subtitle">' + escapeHtml(item.subtitle) + '</div>' : '';
      const safeItemUrl = safeUrl(item.url);
      const url = safeItemUrl ? '<a class="item-link" href="' + escapeHtml(safeItemUrl) + '" target="_blank" rel="noreferrer noopener">Source</a>' : '';
      const updated = item.updated_at ? '<div><strong>Updated</strong>: <code>' + escapeHtml(item.updated_at) + '</code></div>' : '';
      const evidence = item.evidence ? '<div><strong>Evidence</strong>: <code>' + escapeHtml(item.evidence) + '</code></div>' : '';
      const reason = item.reason ? '<div><strong>Unmatched source item</strong>: ' + escapeHtml(item.reason) + '</div>' : '';
      const status = item.status ? '<div><strong>Status</strong>: <code>' + escapeHtml(item.status) + '</code></div>' : '';
      const states = item.source_states ? '<div><strong>Source states</strong>: ' + Object.entries(item.source_states).map(([key, value]) => escapeHtml(key) + '=<code>' + escapeHtml(value) + '</code>').join(' ') + '</div>' : '';
      return '<article class="item"><div><strong>' + escapeHtml(item.kind) + '</strong> ' + escapeHtml(item.changeId || '') + '</div>' + title + subtitle + url + updated + metadataHtml(item.metadata) + evidence + reason + status + states + '</article>';
    }
    function advChangeHtml(item, projectId) {
      const gate = item.source_states && item.source_states.gate ? item.source_states.gate : 'unknown';
      const progress = item.source_states && item.source_states.progress ? '<div><strong>Gate progress</strong>: <code>' + escapeHtml(item.source_states.progress) + '</code></div>' : '';
      const titleLink = changeLink(projectId, item.changeId, item.title || item.changeId || 'ADV change');
      return '<article class="item adv-change"><div class="change-title">' + titleLink + '</div><div class="change-id"><code>' + escapeHtml(item.changeId || '') + '</code></div><div class="gate-row"><span class="gate-label">Next gate</span><strong class="gate-badge ' + gateClass(gate) + '">' + escapeHtml(gate) + '</strong></div>' + progress + '</article>';
    }
    function changeStatusHtml(item, projectId) {
      const gate = item.gate || 'unknown';
      const progress = item.progress ? '<div><strong>Gate progress</strong>: <code>' + escapeHtml(item.progress) + '</code></div>' : '';
      const latest = item.latest || {};
      const summaries = [
        sourceSummaryHtml('Latest PR', latest.pr),
        sourceSummaryHtml('Latest CI', latest.ci),
        sourceSummaryHtml('Latest deployment', latest.deployment),
      ].join('');
      const details = sourceDetailsHtml(item.sources || {}, projectId);
      const titleLink = changeLink(projectId, item.changeId, item.title || item.changeId || 'ADV change');
      return '<article class="item adv-change status-card"><div class="change-title">' + titleLink + '</div><div class="change-id"><code>' + escapeHtml(item.changeId || '') + '</code></div><div class="gate-row"><span class="gate-label">Next gate</span><strong class="gate-badge ' + gateClass(gate) + '">' + escapeHtml(gate) + '</strong></div>' + progress + '<div><strong>Overall</strong>: <code>' + escapeHtml(latest.overall || 'unknown') + '</code></div>' + summaries + details + '</article>';
    }
    function sourceSummaryHtml(label, summary) {
      if (!summary) return '';
      const safeItemUrl = safeUrl(summary.url);
      const url = safeItemUrl ? ' <a class="item-link" href="' + escapeHtml(safeItemUrl) + '" target="_blank" rel="noreferrer noopener">Source</a>' : '';
      const updated = summary.updated_at ? ' <span class="muted">' + escapeHtml(summary.updated_at) + '</span>' : '';
      const status = summary.status ? ' <code>' + escapeHtml(summary.status) + '</code>' : '';
      return '<div class="source-summary"><strong>' + escapeHtml(label) + '</strong>: ' + escapeHtml(summary.title || summary.kind || 'source') + status + updated + url + metadataHtml(summary.metadata) + '</div>';
    }
    function sourceDetailsHtml(sources, projectId) {
      const members = [ ...(sources.prs || []), ...(sources.workflow_runs || []), ...(sources.deployments || []) ];
      if (!members.length) return '';
      return '<details class="source-details"><summary>Source details <span class="muted">×' + escapeHtml(members.length) + '</span></summary>' + members.map((member) => itemHtml(member, projectId)).join('') + '</details>';
    }
    function groupHtml(group, projectId) {
      const limit = groupPreviewLimit(group);
      const members = (group.items || []).slice(0, limit);
      const hiddenCount = Math.max(0, Number(group.count || 0) - members.length);
      const latest = group.latestUpdatedAt ? ' · latest <code>' + escapeHtml(group.latestUpdatedAt) + '</code>' : '';
      const status = group.status ? ' · status <code>' + escapeHtml(group.status) + '</code>' : '';
      const summary = '<summary>' + escapeHtml(group.title || 'Grouped items') + ' <span class="muted">×' + escapeHtml(group.count || members.length) + status + latest + '</span></summary>';
      const metadata = metadataHtml(group.metadata);
      const memberHtml = members.map((member) => itemHtml(member, projectId)).join('');
      const hidden = hiddenCount ? '<p class="hidden-count">' + escapeHtml(hiddenCount) + ' more item' + (hiddenCount === 1 ? '' : 's') + ' hidden from preview.</p>' : '';
      return '<details class="group-card"' + (group.collapsedByDefault === false ? ' open' : '') + '>' + summary + '<div class="group-meta">Grouped ' + escapeHtml(group.groupKind || 'items') + '</div>' + metadata + '<div class="group-items">' + memberHtml + hidden + '</div></details>';
    }
    function groupPreviewLimit(group) {
      return group.groupKind === 'inventory' ? 5 : Math.max(1, Number(group.count || 0));
    }
    function metadataHtml(metadata) {
      if (!metadata || !metadata.length) return '';
      return '<dl class="metadata">' + metadata.map((entry) => '<div><dt>' + escapeHtml(entry.label) + '</dt><dd><code>' + escapeHtml(entry.value) + '</code></dd></div>').join('') + '</dl>';
    }
    function degradedHtml(source) {
      if (source && source.source === 'github' && source.code === 'GITHUB_AUTH_UNAVAILABLE') return githubSetupHtml(source);
      const lastSuccess = source.last_success_at ? '<div>Last successful refresh: ' + escapeHtml(source.last_success_at) + '</div>' : '';
      return '<article class="item degraded"><strong>Degraded</strong>: ' + escapeHtml(source.source || '') + ' <code>' + escapeHtml(source.code || '') + '</code><div>' + escapeHtml(source.message || '') + '</div>' + lastSuccess + '</article>';
    }
    function githubSetupHtml(source) {
      const setup = source.setup || { title: 'Connect GitHub locally', message: 'Run GitHub CLI login or set GITHUB_TOKEN for pull request, Actions, and deployment data.', commands: ['gh auth login'], env_vars: ['GITHUB_TOKEN'] };
      const commands = (setup.commands || []).map((command) => '<li><code>' + escapeHtml(command) + '</code></li>').join('');
      const envVars = (setup.env_vars || []).map((name) => '<li><code>' + escapeHtml(name) + '</code></li>').join('');
      return '<article class="item degraded setup-card"><strong>' + escapeHtml(setup.title || 'Connect GitHub locally') + '</strong><div>' + escapeHtml(setup.message || source.message || '') + '</div><ul>' + commands + envVars + '</ul></article>';
    }
    function renderLane(name, items, projectId) {
      return '<section class="lane" data-lane="' + name + '"><div class="lane-head"><h3>' + laneLabel(name) + '</h3><span class="lane-count">' + items.length + '</span></div>' + (items.length ? items.map((item) => item.kind === 'degraded_source' ? degradedHtml(item) : itemHtml(item, projectId)).join('') : document.getElementById('empty-template').innerHTML) + '</section>';
    }
    function render(state) {
      lastSuccessfulRefreshAt = text(state.generated_at) || lastSuccessfulRefreshAt;
      freshness.textContent = 'Updated ' + text(state.generated_at) + ' · refresh_seconds=' + text(state.refresh_seconds);
      app.innerHTML = (state.projects || []).map((project) => {
        const lanesByName = project.lanes || {};
        const projectId = project.id;
        const lanes = laneNames.map((name) => renderLane(name, lanesByName[name] || [], projectId)).join('');
        return '<section class="project">' + projectHeader(project, lanesByName) + '<div class="lanes">' + lanes + '</div></section>';
      }).join('') || '<p class="muted">No configured projects.</p>';
    }
    function projectHeader(project, lanesByName) {
      return '<div class="project-head"><div><h2>' + escapeHtml(project.label || project.id) + '</h2><p class="project-path">' + escapeHtml(project.path || '') + '</p></div><div class="project-stats">' + statHtml('Needs attention', laneCount(lanesByName, 'needs_attention')) + statHtml('Running', laneCount(lanesByName, 'running')) + statHtml('Ready / landed', laneCount(lanesByName, 'ready_landed')) + statHtml('Backlog / inventory', laneCount(lanesByName, 'backlog')) + statHtml('Unmatched source', laneCount(lanesByName, 'unmatched_source')) + '</div></div>';
    }
    function laneLabel(name) {
      const found = laneDefinitions.find((lane) => lane.name === name);
      return found ? found.label : name;
    }
    function statHtml(label, value) {
      return '<div class="stat"><span class="stat-value">' + escapeHtml(value) + '</span><span class="stat-label">' + escapeHtml(label) + '</span></div>';
    }
    function laneCount(lanesByName, name) {
      return ((lanesByName && lanesByName[name]) || []).length;
    }
    function gateClass(gate) {
      const slug = text(gate).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      return 'gate-' + (slug || 'unknown');
    }
    function escapeHtml(value) {
      return text(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    }
    function safeUrl(value) {
      const candidate = text(value).trim();
      if (!candidate) return '';
      try {
        const url = new URL(candidate);
        return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
      } catch (_error) {
        return '';
      }
    }
    function isDetailPath(pathname) {
      const parts = text(pathname).split('/').filter(Boolean);
      return parts.length === 3 && parts[0] === 'change';
    }
    function detailApiPath(pathname) {
      const parts = text(pathname).split('/').filter(Boolean);
      if (parts.length !== 3 || parts[0] !== 'change') return '';
      return '/api/change/' + parts[1] + '/' + parts[2];
    }
    function sourceHealthHtml(source) {
      if (!source) return '';
      const code = source.code ? ' <code>' + escapeHtml(source.code) + '</code>' : '';
      const affected = source.affected || source.project || source.repo;
      const affectedRow = affected ? '<div><strong>Affected</strong>: <code>' + escapeHtml(affected) + '</code></div>' : '';
      const remediation = source.remediation || source.message;
      const remediationRow = remediation ? '<div>' + escapeHtml(remediation) + '</div>' : '';
      const lastSuccess = source.last_success_at ? '<div class="muted">Last successful refresh: <code>' + escapeHtml(source.last_success_at) + '</code></div>' : '';
      return '<article class="source-health"><div class="source-health-head">Source health</div><div><strong>Source</strong>: ' + escapeHtml(source.source || 'unknown') + code + '</div>' + affectedRow + remediationRow + lastSuccess + '</article>';
    }
    function deeperHtml(detail) {
      if (detail.deeper == null) return '';
      const body = '<pre>' + escapeHtml(JSON.stringify(detail.deeper, null, 2)) + '</pre>';
      return '<details class="deeper"><summary>Deeper context</summary>' + body + '</details>';
    }
    function renderDetail(detail) {
      const change = detail.change || {};
      const project = detail.project || {};
      const keys = change.correlation_keys || {};
      const branches = (keys.branches || []).map((value) => '<li><code>' + escapeHtml(value) + '</code></li>').join('');
      const paths = (keys.paths || []).map((value) => '<li><code>' + escapeHtml(value) + '</code></li>').join('');
      const branchesRow = branches ? '<dt>Branches</dt><dd><ul class="detail-list">' + branches + '</ul></dd>' : '';
      const pathsRow = paths ? '<dt>Worktrees</dt><dd><ul class="detail-list">' + paths + '</ul></dd>' : '';
      const command = detail.command ? '<code class="detail-command">' + escapeHtml(detail.command) + '</code>' : '';
      const degraded = (detail.degradedSources || []).map((source) => sourceHealthHtml(source)).join('');
      lastSuccessfulRefreshAt = text(detail.generated_at) || lastSuccessfulRefreshAt;
      freshness.textContent = 'Updated ' + text(detail.generated_at);
      app.innerHTML = '<div class="detail">'
        + '<a class="detail-back change-link" href="/">← All projects</a>'
        + '<article class="detail-card">'
        + '<h2>' + escapeHtml(change.title || change.id || 'ADV change') + '</h2>'
        + '<div class="change-id"><code>' + escapeHtml(change.id || '') + '</code></div>'
        + '<dl class="detail-grid">'
        + '<dt>Project</dt><dd>' + escapeHtml(project.label || project.id || '') + '</dd>'
        + '<dt>Next gate</dt><dd><code>' + escapeHtml(change.firstIncompleteGate || 'unknown') + '</code></dd>'
        + '<dt>Progress</dt><dd><code>' + escapeHtml(change.gateProgressStr || '') + '</code></dd>'
        + '<dt>Status</dt><dd><code>' + escapeHtml(change.status || '') + '</code></dd>'
        + '<dt>Last activity</dt><dd><code>' + escapeHtml(change.lastActivityAt || '') + '</code></dd>'
        + branchesRow + pathsRow
        + '</dl>'
        + '<div><strong>Inspect with</strong>:' + command + '</div>'
        + deeperHtml(detail)
        + degraded
        + '</article></div>';
    }
    async function loadDetail() {
      try {
        const response = await fetch(detailApiPath(location.pathname), { method: 'GET' });
        if (!response.ok) throw new Error('detail unavailable (' + response.status + ')');
        const detail = await response.json();
        renderDetail(detail);
      } catch (error) {
        freshness.textContent = 'Degraded: ' + text(error && error.message ? error.message : error) + ' · last successful refresh: ' + (lastSuccessfulRefreshAt || 'none');
        app.innerHTML = '<div class="detail"><a class="detail-back change-link" href="/">← All projects</a><p class="muted">Detail unavailable.</p></div>';
      }
    }
    async function refresh() {
      try {
        const response = await fetch('/api/state', { method: 'GET' });
        const state = await response.json();
        render(state);
        setTimeout(refresh, Math.max(30, Math.min(60, Number(state.refresh_seconds) || 45)) * 1000);
      } catch (error) {
        freshness.textContent = 'Degraded: ' + text(error && error.message ? error.message : error) + ' · last successful refresh: ' + (lastSuccessfulRefreshAt || 'none');
        setTimeout(refresh, 45000);
      }
    }
    if (isDetailPath(location.pathname)) {
      loadDetail();
    } else {
      refresh();
    }
  </script>
</body>
</html>`;
}
