/* =========================================================
   Devices page
   - search, type/site filters, status chips
   - sortable columns, pagination
   - quick-view drawer with live latency sparkline
   - CSV export of the current (filtered) list
   ========================================================= */
(function () {
  'use strict';
  const { $, css, timeAgo, escapeHtml, toast } = App;

  const PER_PAGE = 12;
  const HISTORY = 30; // sparkline points (one every 2 s = 60 s)
  const STATUS_ORDER = { down: 0, warning: 1, up: 2 };

  const view = {
    q: '',
    status: 'all',
    type: 'all',
    site: 'all',
    sortKey: 'status',
    sortDir: 1,
    page: 1,
    selectedId: null,
  };

  // Latency history per device for the sparkline
  // (seeded with simulated values so the chart is full on first open;
  //  with a real API, load the last 60 s of samples here instead)
  const history = new Map();
  NOC.devices.forEach(d => {
    if (d.latency === null) { history.set(d.id, []); return; }
    const pts = [];
    let v = d.latency;
    for (let i = 0; i < HISTORY; i++) {
      v = Math.max(0.5, v + NOC.rand(-2, 2) + (d.latency - v) * 0.2);
      pts.push(v);
    }
    pts[HISTORY - 1] = d.latency;
    history.set(d.id, pts);
  });

  /* ---------- Helpers ---------- */
  const latClass = v => (v === null ? 'lat-bad' : v < 50 ? 'lat-good' : v < 150 ? 'lat-mid' : 'lat-bad');
  const fmtLat = v => (v === null ? 'timeout' : `${v.toFixed(0)} ms`);
  const fmtUptime = d => (d.status === 'down' ? '—' : `${d.uptimeDays} d`);
  const ipNum = ip => ip.split('.').reduce((n, o) => n * 256 + Number(o), 0);

  function compare(a, b) {
    const k = view.sortKey;
    let r;
    if (k === 'status') r = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    else if (k === 'ip') r = ipNum(a.ip) - ipNum(b.ip);
    else if (k === 'latency') r = (a.latency ?? Infinity) - (b.latency ?? Infinity);
    else if (typeof a[k] === 'number') r = a[k] - b[k];
    else r = String(a[k]).localeCompare(String(b[k]));
    if (r === 0) r = a.name.localeCompare(b.name);
    return r * view.sortDir;
  }

  function filtered() {
    const q = view.q.trim().toLowerCase();
    return NOC.devices
      .filter(d => view.status === 'all' || d.status === view.status)
      .filter(d => view.type === 'all' || d.type === view.type)
      .filter(d => view.site === 'all' || d.site === view.site)
      .filter(d => !q || d.name.includes(q) || d.ip.includes(q) || d.model.toLowerCase().includes(q))
      .sort(compare);
  }

  /* ---------- Filters UI ---------- */
  function initSelects() {
    $('fType').innerHTML += NOC.TYPES.map(t => `<option value="${t.key}">${t.label}</option>`).join('');
    $('fSite').innerHTML += NOC.SITES.map(s => `<option value="${s}">${s}</option>`).join('');
  }

  function renderChips() {
    // Counts respect search/type/site but not the status chip itself
    const q = view.q.trim().toLowerCase();
    const base = NOC.devices
      .filter(d => view.type === 'all' || d.type === view.type)
      .filter(d => view.site === 'all' || d.site === view.site)
      .filter(d => !q || d.name.includes(q) || d.ip.includes(q) || d.model.toLowerCase().includes(q));
    const chips = [
      { key: 'all', label: 'All', n: base.length },
      { key: 'up', label: 'Online', n: base.filter(d => d.status === 'up').length },
      { key: 'warning', label: 'Degraded', n: base.filter(d => d.status === 'warning').length },
      { key: 'down', label: 'Down', n: base.filter(d => d.status === 'down').length },
    ];
    $('chips').innerHTML = chips.map(c => `
      <button class="chip ${view.status === c.key ? 'active' : ''}" data-status="${c.key}">
        ${c.key !== 'all' ? `<span class="dot ${c.key}"></span>` : ''}${c.label} <span class="n">${c.n}</span>
      </button>`).join('');
  }

  /* ---------- Table ---------- */
  function renderTable() {
    const list = filtered();
    const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
    if (view.page > pages) view.page = pages;
    const start = (view.page - 1) * PER_PAGE;
    const pageRows = list.slice(start, start + PER_PAGE);

    $('rows').innerHTML = pageRows.map(d => `
      <tr data-id="${d.id}" class="${d.id === view.selectedId ? 'selected' : ''}">
        <td><span class="badge ${d.status}"><span class="dot ${d.status}"></span>${NOC.STATUS_LABEL[d.status]}</span></td>
        <td><div class="dev-name mono">${escapeHtml(d.name)}</div><div class="dev-sub">${escapeHtml(d.model)}</div></td>
        <td class="mono">${d.ip}</td>
        <td class="hide-sm">${NOC.typeLabel(d.type)}</td>
        <td class="hide-sm">${d.site}</td>
        <td class="num mono ${latClass(d.latency)}">${fmtLat(d.latency)}</td>
        <td class="num mono hide-sm">${d.loss.toFixed(1)}%</td>
        <td class="num mono hide-sm">${fmtUptime(d)}</td>
      </tr>`).join('');
    $('empty').hidden = list.length > 0;

    // Sort arrows
    document.querySelectorAll('.dev-table th.sortable').forEach(th => {
      const active = th.dataset.sort === view.sortKey;
      th.querySelector('.arrow').textContent = active ? (view.sortDir === 1 ? '▲' : '▼') : '';
      th.style.color = active ? 'var(--text)' : '';
    });

    // Pager
    const end = Math.min(start + PER_PAGE, list.length);
    $('pagerInfo').textContent = list.length
      ? `Showing ${start + 1}–${end} of ${list.length} devices`
      : 'No devices';
    let btns = `<button class="btn" data-page="${view.page - 1}" ${view.page === 1 ? 'disabled' : ''}>‹ Prev</button>`;
    for (let p = 1; p <= pages; p++) {
      btns += `<button class="btn ${p === view.page ? 'current' : ''}" data-page="${p}">${p}</button>`;
    }
    btns += `<button class="btn" data-page="${view.page + 1}" ${view.page === pages ? 'disabled' : ''}>Next ›</button>`;
    $('pages').innerHTML = btns;

    const total = NOC.devices.length;
    const down = NOC.devices.filter(d => d.status === 'down').length;
    $('pageSub').textContent = `${total} devices · ${down} down · live`;
  }

  function renderAll() { renderChips(); renderTable(); }

  /* ---------- Drawer ---------- */
  function meter(label, v) {
    const cls = v >= 85 ? 'crit' : v >= 70 ? 'hi' : '';
    return `<div class="meter"><span class="muted">${label}</span>
      <div class="bar"><span class="${cls}" style="width:${v}%"></span></div>
      <span class="mono" style="text-align:right">${v}%</span></div>`;
  }

  function renderSpark(d) {
    const svg = $('dSpark');
    const data = history.get(d.id) || [];
    if (data.length < 2) {
      svg.innerHTML = `<text x="150" y="40" text-anchor="middle" fill="${css('--muted')}" font-size="12">No data — device unreachable</text>`;
      $('dSparkInfo').textContent = '';
      return;
    }
    const lo = Math.min(...data), hi = Math.max(...data);
    const padV = Math.max((hi - lo) * 0.3, 2);
    const min = Math.max(0, lo - padV), max = hi + padV;
    const pts = data.map((v, i) => {
      const x = (i / (HISTORY - 1)) * 300;
      const y = 66 - ((v - min) / (max - min)) * 60;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const color = d.status === 'warning' ? css('--warn') : css('--ok');
    const lastX = ((data.length - 1) / (HISTORY - 1)) * 300;
    svg.innerHTML = `
      <polygon points="0,70 ${pts.join(' ')} ${lastX.toFixed(1)},70" fill="${color}" opacity="0.15"/>
      <polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>`;
    const avg = data.reduce((s, v) => s + v, 0) / data.length;
    $('dSparkInfo').textContent = `min ${Math.min(...data).toFixed(0)} ms · avg ${avg.toFixed(0)} ms · max ${Math.max(...data).toFixed(0)} ms`;
  }

  function renderDrawer() {
    const d = NOC.devices.find(x => x.id === view.selectedId);
    if (!d) return;
    $('dName').textContent = d.name;
    $('dModel').textContent = d.model;
    $('dBadge').innerHTML = `<span class="badge ${d.status}"><span class="dot ${d.status}"></span>${NOC.STATUS_LABEL[d.status]}</span>`;
    const rows = [
      ['IP address', `<span class="mono">${d.ip}</span>`],
      ['Type', NOC.typeLabel(d.type)],
      ['Site', d.site],
      ['Latency', `<span class="mono ${latClass(d.latency)}">${fmtLat(d.latency)}</span>`],
      ['Packet loss', `<span class="mono">${d.loss.toFixed(1)}%</span>`],
      ['Uptime', d.status === 'down' ? '—' : `${d.uptimeDays} days`],
      ['Last seen', d.status === 'down' ? timeAgo(d.lastSeen) : 'now'],
    ];
    $('dInfo').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    $('dMeters').innerHTML = d.status === 'down'
      ? '<div class="dev-sub">Not available while the device is down.</div>'
      : meter('CPU', d.cpu) + meter('Memory', d.mem);
    renderSpark(d);
  }

  function openDrawer(id) {
    view.selectedId = id;
    renderDrawer();
    $('drawer').classList.add('open');
    $('drawer').setAttribute('aria-hidden', 'false');
    $('drawerScrim').classList.add('show');
    renderTable();
  }
  function closeDrawer() {
    view.selectedId = null;
    $('drawer').classList.remove('open');
    $('drawer').setAttribute('aria-hidden', 'true');
    $('drawerScrim').classList.remove('show');
    renderTable();
  }

  /* ---------- CSV export ---------- */
  function exportCsv() {
    const list = filtered();
    const head = ['name', 'status', 'ip', 'type', 'site', 'model', 'latency_ms', 'loss_pct', 'uptime_days'];
    const esc = v => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [head.join(',')].concat(list.map(d => [
      d.name, NOC.STATUS_LABEL[d.status], d.ip, NOC.typeLabel(d.type), d.site, d.model,
      d.latency === null ? '' : d.latency.toFixed(1), d.loss.toFixed(1), d.status === 'down' ? '' : d.uptimeDays,
    ].map(esc).join(',')));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `devices-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`Exported ${list.length} devices to CSV`);
  }

  /* ---------- Events ---------- */
  $('q').addEventListener('input', e => { view.q = e.target.value; view.page = 1; renderAll(); });
  $('fType').addEventListener('change', e => { view.type = e.target.value; view.page = 1; renderAll(); });
  $('fSite').addEventListener('change', e => { view.site = e.target.value; view.page = 1; renderAll(); });

  $('chips').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    view.status = chip.dataset.status; view.page = 1; renderAll();
  });

  document.querySelector('.dev-table thead').addEventListener('click', e => {
    const th = e.target.closest('th.sortable');
    if (!th) return;
    const key = th.dataset.sort;
    if (view.sortKey === key) view.sortDir *= -1;
    else { view.sortKey = key; view.sortDir = 1; }
    renderTable();
  });

  $('rows').addEventListener('click', e => {
    const tr = e.target.closest('tr[data-id]');
    if (tr) openDrawer(Number(tr.dataset.id));
  });

  $('pages').addEventListener('click', e => {
    const b = e.target.closest('button[data-page]');
    if (!b || b.disabled) return;
    view.page = Number(b.dataset.page); renderTable();
  });

  $('drawerClose').addEventListener('click', closeDrawer);
  $('drawerScrim').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && view.selectedId !== null) closeDrawer(); });

  $('exportBtn').addEventListener('click', exportCsv);
  $('addBtn').addEventListener('click', () => toast('Demo: connect this button to your own "add device" form.'));
  $('pingBtn').addEventListener('click', () => {
    const d = NOC.devices.find(x => x.id === view.selectedId);
    if (d) toast(d.latency === null ? `Ping ${d.ip}: request timed out` : `Ping ${d.ip}: ${d.latency.toFixed(1)} ms`);
  });
  $('sshBtn').addEventListener('click', () => toast('Demo: link this to your SSH or web-terminal tool.'));
  $('detailBtn').addEventListener('click', () => toast('Device detail page — coming in the next release.'));

  /* ---------- Init + live loop ---------- */
  App.start({ onTheme: () => { if (view.selectedId !== null) renderDrawer(); } });
  initSelects();
  renderAll();

  setInterval(() => {
    NOC.tickLatency();
    NOC.devices.forEach(d => {
      if (d.latency === null) return;
      const h = history.get(d.id);
      h.push(d.latency);
      if (h.length > HISTORY) h.shift();
    });
    renderTable();
    if (view.selectedId !== null) renderDrawer();
  }, 2000);
})();
