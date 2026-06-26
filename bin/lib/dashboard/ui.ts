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
    <section class="lane" data-lane="attention"></section>
    <section class="lane" data-lane="active"></section>
    <section class="lane" data-lane="unmatched"></section>
    <section class="lane" data-lane="inventory"></section>
  </template>
  <template id="empty-template"><p class="muted">No items.</p></template>
  <script>
    const app = document.getElementById('app');
    const freshness = document.getElementById('freshness');
    const laneDefinitions = [
      { name: 'attention', label: 'Attention' },
      { name: 'active', label: 'Active work' },
      { name: 'unmatched', label: 'Unmatched source' },
      { name: 'inventory', label: 'Inventory' },
    ];
    const laneNames = laneDefinitions.map((lane) => lane.name);
    let lastSuccessfulRefreshAt = '';

    function text(value) { return value == null ? '' : String(value); }
    function itemHtml(item) {
      if (item.kind === 'group') return groupHtml(item);
      if (item.kind === 'adv_change') return advChangeHtml(item);
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
    function advChangeHtml(item) {
      const gate = item.source_states && item.source_states.gate ? item.source_states.gate : 'unknown';
      const status = item.status ? '<div><strong>Status</strong>: <code>' + escapeHtml(item.status) + '</code></div>' : '';
      return '<article class="item adv-change"><div class="change-title">' + escapeHtml(item.title || item.changeId || 'ADV change') + '</div><div class="change-id"><code>' + escapeHtml(item.changeId || '') + '</code></div>' + status + '<div class="gate-row"><span class="gate-label">Next gate</span><strong class="gate-badge ' + gateClass(gate) + '">' + escapeHtml(gate) + '</strong></div></article>';
    }
    function groupHtml(group) {
      const limit = groupPreviewLimit(group);
      const members = (group.items || []).slice(0, limit);
      const hiddenCount = Math.max(0, Number(group.count || 0) - members.length);
      const latest = group.latestUpdatedAt ? ' · latest <code>' + escapeHtml(group.latestUpdatedAt) + '</code>' : '';
      const status = group.status ? ' · status <code>' + escapeHtml(group.status) + '</code>' : '';
      const summary = '<summary>' + escapeHtml(group.title || 'Grouped items') + ' <span class="muted">×' + escapeHtml(group.count || members.length) + status + latest + '</span></summary>';
      const metadata = metadataHtml(group.metadata);
      const memberHtml = members.map((member) => itemHtml(member)).join('');
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
    function renderLane(name, items) {
      return '<section class="lane" data-lane="' + name + '"><div class="lane-head"><h3>' + laneLabel(name) + '</h3><span class="lane-count">' + items.length + '</span></div>' + (items.length ? items.map((item) => item.kind === 'degraded_source' ? degradedHtml(item) : itemHtml(item)).join('') : document.getElementById('empty-template').innerHTML) + '</section>';
    }
    function render(state) {
      lastSuccessfulRefreshAt = text(state.generated_at) || lastSuccessfulRefreshAt;
      freshness.textContent = 'Updated ' + text(state.generated_at) + ' · refresh_seconds=' + text(state.refresh_seconds);
      app.innerHTML = (state.projects || []).map((project) => {
        const lanesByName = project.lanes || {};
        const lanes = laneNames.map((name) => renderLane(name, lanesByName[name] || [])).join('');
        return '<section class="project">' + projectHeader(project, lanesByName) + '<div class="lanes">' + lanes + '</div></section>';
      }).join('') || '<p class="muted">No configured projects.</p>';
    }
    function projectHeader(project, lanesByName) {
      return '<div class="project-head"><div><h2>' + escapeHtml(project.label || project.id) + '</h2><p class="project-path">' + escapeHtml(project.path || '') + '</p></div><div class="project-stats">' + statHtml('Attention', laneCount(lanesByName, 'attention')) + statHtml('Active work', laneCount(lanesByName, 'active')) + statHtml('Unmatched source', laneCount(lanesByName, 'unmatched')) + statHtml('Inventory', laneCount(lanesByName, 'inventory')) + '</div></div>';
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
    refresh();
  </script>
</body>
</html>`;
}
