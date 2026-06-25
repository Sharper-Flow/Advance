export function renderDashboardHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ADV Local Dashboard</title>
  <style>
    :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
    body { margin: 0; padding: 1rem; background: Canvas; color: CanvasText; }
    header { display: flex; justify-content: space-between; gap: 1rem; align-items: baseline; }
    .project { border: 1px solid color-mix(in srgb, CanvasText 20%, transparent); border-radius: .75rem; padding: 1rem; margin: 1rem 0; }
    .lanes { display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: .75rem; }
    .lane { border-radius: .5rem; padding: .75rem; background: color-mix(in srgb, CanvasText 6%, transparent); }
    .item { margin: .5rem 0; padding: .5rem; border-left: 3px solid currentColor; }
    .muted { opacity: .72; }
    .degraded { color: #b45309; }
    code { font-size: .9em; }
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
    <section class="lane" data-lane="running"></section>
    <section class="lane" data-lane="linked"></section>
    <section class="lane" data-lane="unlinked"></section>
  </template>
  <template id="empty-template"><p class="muted">No items.</p></template>
  <script>
    const app = document.getElementById('app');
    const freshness = document.getElementById('freshness');
    const laneNames = ['attention', 'running', 'linked', 'unlinked'];
    let lastSuccessfulRefreshAt = '';

    function text(value) { return value == null ? '' : String(value); }
    function itemHtml(item) {
      if (item.kind === 'adv_change') return advChangeHtml(item);
      const title = item.title ? '<div>' + escapeHtml(item.title) + '</div>' : '';
      const evidence = item.evidence ? '<div><strong>Evidence</strong>: <code>' + escapeHtml(item.evidence) + '</code></div>' : '';
      const reason = item.reason ? '<div><strong>Unlinked</strong>: ' + escapeHtml(item.reason) + '</div>' : '';
      const status = item.status ? '<div><strong>Status</strong>: <code>' + escapeHtml(item.status) + '</code></div>' : '';
      const states = item.source_states ? '<div><strong>Source states</strong>: ' + Object.entries(item.source_states).map(([key, value]) => escapeHtml(key) + '=<code>' + escapeHtml(value) + '</code>').join(' ') + '</div>' : '';
      return '<article class="item"><div><strong>' + escapeHtml(item.kind) + '</strong> ' + escapeHtml(item.changeId || '') + '</div>' + title + evidence + reason + status + states + '</article>';
    }
    function advChangeHtml(item) {
      const gate = item.source_states && item.source_states.gate ? item.source_states.gate : 'unknown';
      return '<article class="item"><div><strong>' + escapeHtml(item.title || item.changeId || 'ADV change') + '</strong></div><div class="muted"><code>' + escapeHtml(item.changeId || '') + '</code> · status <code>' + escapeHtml(item.status || '') + '</code> · gate <code>' + escapeHtml(gate) + '</code></div></article>';
    }
    function degradedHtml(source) {
      const lastSuccess = source.last_success_at ? '<div>Last successful refresh: ' + escapeHtml(source.last_success_at) + '</div>' : '';
      return '<article class="item degraded"><strong>Degraded</strong>: ' + escapeHtml(source.source || '') + ' <code>' + escapeHtml(source.code || '') + '</code><div>' + escapeHtml(source.message || '') + '</div>' + lastSuccess + '</article>';
    }
    function renderLane(name, items) {
      return '<section class="lane" data-lane="' + name + '"><h3>' + name + '</h3>' + (items.length ? items.map((item) => item.kind === 'degraded_source' ? degradedHtml(item) : itemHtml(item)).join('') : document.getElementById('empty-template').innerHTML) + '</section>';
    }
    function render(state) {
      lastSuccessfulRefreshAt = text(state.generated_at) || lastSuccessfulRefreshAt;
      freshness.textContent = 'Updated ' + text(state.generated_at) + ' · refresh_seconds=' + text(state.refresh_seconds);
      app.innerHTML = (state.projects || []).map((project) => {
        const lanes = laneNames.map((name) => renderLane(name, (project.lanes && project.lanes[name]) || [])).join('');
        return '<section class="project"><h2>' + escapeHtml(project.label || project.id) + '</h2><p class="muted">' + escapeHtml(project.path || '') + '</p><div class="lanes">' + lanes + '</div></section>';
      }).join('') || '<p class="muted">No configured projects.</p>';
    }
    function escapeHtml(value) {
      return text(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
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
