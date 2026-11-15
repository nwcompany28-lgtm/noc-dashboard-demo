/* =========================================================
   Alarms page
   - severity summary cards (click to filter)
   - search, severity filter, status chips
   - bulk acknowledge / resolve
   - detail drawer with timeline and team notes
   - simulated incoming alarms (toggle in toolbar)
   ========================================================= */
(function () {
  'use strict';
  const { $, timeAgo, escapeHtml, toast } = App;

  const SEV_RANK = { critical: 0, major: 1, minor: 2 };
  const STATUS_RANK = { active: 0, acked: 1, resolved: 2 };
  const STATUS_LABEL = { active: 'Active', acked: 'Acknowledged', resolved: 'Resolved' };
  const STATUS_BADGE = { active: 'down', acked: 'warning', resolved: 'up' }; // reuse badge colours
  const SIM_INTERVAL = 20000;

  const view = {
    q: '',
    sev: 'all',
    status: 'open', // open = active + acknowledged
    selected: new Set(),
    openId: null,
    flashId: null,
  };

  /* ---------- Helpers ---------- */
  function fmtDuration(ms) {
    const m = Math.max(1, Math.round(ms / 60e3));
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} h ${m % 60} min`;
    return `${Math.floor(h / 24)} d ${h % 24} h`;
  }
  const duration = a => fmtDuration((a.resolvedAt || Date.now()) - a.t);
  const fmtTime = t => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  const statusBadge = a => `<span class="badge ${STATUS_BADGE[a.status]}"><span class="dot ${STATUS_BADGE[a.status]}"></span>${STATUS_LABEL[a.status]}</span>`;
  const siteOf = a => { const d = NOC.deviceByName(a.device); return d ? d.site : '—'; };

  function matchesStatus(a, s) {
    if (s === 'all') return true;
    if (s === 'open') return a.status !== 'resolved';
    return a.status === s;
  }

  function baseFiltered() {
    const q = view.q.trim().toLowerCase();
    return NOC.alarms
      .filter(a => view.sev === 'all' || a.sev === view.sev)
      .filter(a => !q || a.msg.toLowerCase().includes(q) || a.device.includes(q));
  }

  function filtered() {
    return baseFiltered()
      .filter(a => matchesStatus(a, view.status))
      .sort((a, b) =>
        STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
        SEV_RANK[a.sev] - SEV_RANK[b.sev] ||
        b.t - a.t);
  }

  /* ---------- Summary cards ---------- */
  function renderCards() {
    const active = NOC.activeAlarms();
    const dayAgo = Date.now() - 24 * 3600e3;
    const cards = [
      { key: 'critical', label: 'Critical', n: active.filter(a => a.sev === 'critical').length, sub: 'active', dot: 'var(--crit)' },
      { key: 'major', label: 'Major', n: active.filter(a => a.sev === 'major').length, sub: 'active', dot: 'var(--warn)' },
      { key: 'minor', label: 'Minor', n: active.filter(a => a.sev === 'minor').length, sub: 'active', dot: 'var(--in)' },
      { key: 'acked', label: 'Acknowledged', n: NOC.alarms.filter(a => a.status === 'acked').length, sub: 'being handled', dot: 'var(--warn)' },
      { key: 'resolved', label: 'Resolved', n: NOC.alarms.filter(a => a.status === 'resolved' && a.resolvedAt > dayAgo).length, sub: 'last 24 hours', dot: 'var(--ok)' },
    ];
    const isActive = k => (SEV_RANK[k] !== undefined ? view.sev === k && view.status === 'active' : view.status === k && view.sev === 'all');
    $('sevCards').innerHTML = cards.map(c => `
      <button class="card sev-card ${c.key} ${isActive(c.key) ? 'active' : ''}" data-card="${c.key}">
        <div class="label"><span class="dot" style="background:${c.dot}"></span>${c.label}</div>
        <div class="value mono">${c.n}</div>
        <div class="delta">${c.sub}</div>
      </button>`).join('');
  }

  /* ---------- Status chips ---------- */
  function renderChips() {
    const base = baseFiltered();
    const chips = [
      { key: 'open', label: 'Open' },
      { key: 'active', label: 'Active' },
      { key: 'acked', label: 'Acknowledged' },
      { key: 'resolved', label: 'Resolved' },
      { key: 'all', label: 'All' },
    ];
    $('chips').innerHTML = chips.map(c => `
      <button class="chip ${view.status === c.key ? 'active' : ''}" data-status="${c.key}">
        ${c.label} <span class="n">${base.filter(a => matchesStatus(a, c.key)).length}</span>
      </button>`).join('');
  }

  /* ---------- Table ---------- */
  function renderTable() {
    const list = filtered();
    // Drop selections that are no longer visible
    const visible = new Set(list.map(a => a.id));
    view.selected.forEach(id => { if (!visible.has(id)) view.selected.delete(id); });

    $('rows').innerHTML = list.map(a => {
      let actions = '<span class="muted">—</span>';
      if (a.status === 'active') actions = `<button class="btn" data-act="ack" data-id="${a.id}">Ack</button><button class="btn" data-act="resolve" data-id="${a.id}">Resolve</button>`;
      else if (a.status === 'acked') actions = `<button class="btn" data-act="resolve" data-id="${a.id}">Resolve</button>`;
      const cls = [a.status === 'resolved' ? 'resolved' : '', a.id === view.openId ? 'selected' : '', a.id === view.flashId ? 'flash' : ''].join(' ');
      return `
      <tr data-id="${a.id}" class="${cls}">
        <td><input type="checkbox" class="cb" data-sel="${a.id}" ${view.selected.has(a.id) ? 'checked' : ''} aria-label="Select alarm"></td>
        <td><span class="sev ${a.sev}">${a.sev}</span></td>
        <td><div class="msg">${escapeHtml(a.msg)}</div><div class="dev-sub mono">${escapeHtml(a.device)}</div>
          <div class="show-sm dev-sub" style="margin-top:4px">${timeAgo(a.t)} · ${statusBadge(a)}</div></td>
        <td class="hide-sm">${siteOf(a)}</td>
        <td class="hide-sm"><span title="${fmtTime(a.t)}">${timeAgo(a.t)}</span></td>
        <td class="hide-sm mono">${duration(a)}</td>
        <td class="hide-sm">${statusBadge(a)}</td>
        <td class="actions hide-sm">${actions}</td>
      </tr>`;
    }).join('');

    $('empty').hidden = list.length > 0;
    $('pagerInfo').textContent = `${list.length} alarm${list.length === 1 ? '' : 's'} shown · sorted by status, severity, newest`;
    $('selAll').checked = list.length > 0 && list.every(a => view.selected.has(a.id));

    const n = view.selected.size;
    $('bulkbar').hidden = n === 0;
    $('bulkCount').textContent = `${n} selected`;

    const act = NOC.activeAlarms().length;
    $('pageSub').textContent = `${act} active · ${NOC.alarms.filter(a => a.status === 'acked').length} acknowledged`;
    App.updateNavCount();
  }

  function renderAll() { renderCards(); renderChips(); renderTable(); if (view.openId !== null) renderDrawer(); }

  /* ---------- Drawer ---------- */
  function renderDrawer() {
    const a = NOC.findAlarm(view.openId);
    if (!a) return;
    const dev = NOC.deviceByName(a.device);
    $('dSev').innerHTML = `<span class="sev ${a.sev}">${a.sev}</span> ${statusBadge(a)}`;
    $('dMsg').textContent = a.msg;
    $('dDevice').textContent = a.device;
    const rows = [
      ['Device', `<span class="mono">${escapeHtml(a.device)}</span>`],
      ['IP address', dev ? `<span class="mono">${dev.ip}</span>` : '—'],
      ['Site', dev ? dev.site : '—'],
      ['Raised', `${fmtTime(a.t)} <span class="muted">(${timeAgo(a.t)})</span>`],
      ['Duration', duration(a)],
      ['Handled by', a.ackBy ? escapeHtml(a.ackBy) : '<span class="muted">nobody yet</span>'],
    ];
    $('dInfo').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');

    $('dTimeline').innerHTML = [...a.events].sort((x, y) => x.t - y.t).map(e =>
      `<li>${escapeHtml(e.text)}<div class="when">${fmtTime(e.t)}</div></li>`).join('');

    $('dNotes').innerHTML = a.notes.length
      ? a.notes.map(n => `<div class="note"><div class="by">${escapeHtml(n.by)} · ${timeAgo(n.t)}</div>${escapeHtml(n.text)}</div>`).join('')
      : '<div class="dev-sub" style="margin-bottom:8px">No notes yet.</div>';

    $('dAck').disabled = a.status !== 'active';
    $('dResolve').disabled = a.status === 'resolved';
  }

  function openDrawer(id) {
    view.openId = id;
    renderDrawer();
    $('drawer').classList.add('open');
    $('drawer').setAttribute('aria-hidden', 'false');
    $('drawerScrim').classList.add('show');
    renderTable();
  }
  function closeDrawer() {
    view.openId = null;
    $('drawer').classList.remove('open');
    $('drawer').setAttribute('aria-hidden', 'true');
    $('drawerScrim').classList.remove('show');
    renderTable();
  }

  /* ---------- Actions ---------- */
  function doAck(ids) {
    let n = 0;
    ids.forEach(id => { if (NOC.ackAlarm(id)) n++; });
    toast(n ? `${n} alarm${n > 1 ? 's' : ''} acknowledged` : 'Nothing to acknowledge');
    renderAll();
  }
  function doResolve(ids) {
    let n = 0;
    ids.forEach(id => { if (NOC.resolveAlarm(id)) n++; });
    toast(n ? `${n} alarm${n > 1 ? 's' : ''} resolved` : 'Nothing to resolve');
    renderAll();
  }

  /* ---------- Events ---------- */
  $('q').addEventListener('input', e => { view.q = e.target.value; renderAll(); });
  $('fSev').addEventListener('change', e => { view.sev = e.target.value; renderAll(); });

  $('chips').addEventListener('click', e => {
    const c = e.target.closest('.chip');
    if (c) { view.status = c.dataset.status; renderAll(); }
  });

  $('sevCards').addEventListener('click', e => {
    const c = e.target.closest('[data-card]');
    if (!c) return;
    const k = c.dataset.card;
    if (SEV_RANK[k] !== undefined) {
      const same = view.sev === k && view.status === 'active';
      view.sev = same ? 'all' : k; view.status = same ? 'open' : 'active';
    } else {
      const same = view.status === k && view.sev === 'all';
      view.sev = 'all'; view.status = same ? 'open' : k;
    }
    $('fSev').value = view.sev;
    renderAll();
  });

  $('rows').addEventListener('click', e => {
    const sel = e.target.closest('[data-sel]');
    if (sel) {
      const id = Number(sel.dataset.sel);
      sel.checked ? view.selected.add(id) : view.selected.delete(id);
      renderTable();
      return;
    }
    const btn = e.target.closest('[data-act]');
    if (btn) {
      const id = Number(btn.dataset.id);
      btn.dataset.act === 'ack' ? doAck([id]) : doResolve([id]);
      return;
    }
    const tr = e.target.closest('tr[data-id]');
    if (tr) openDrawer(Number(tr.dataset.id));
  });

  $('selAll').addEventListener('change', e => {
    const ids = filtered().map(a => a.id);
    if (e.target.checked) ids.forEach(id => view.selected.add(id));
    else view.selected.clear();
    renderTable();
  });

  $('bulkAck').addEventListener('click', () => { doAck([...view.selected]); view.selected.clear(); renderTable(); });
  $('bulkResolve').addEventListener('click', () => { doResolve([...view.selected]); view.selected.clear(); renderTable(); });
  $('bulkClear').addEventListener('click', () => { view.selected.clear(); renderTable(); });

  $('drawerClose').addEventListener('click', closeDrawer);
  $('drawerScrim').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && view.openId !== null) closeDrawer(); });
  $('dAck').addEventListener('click', () => doAck([view.openId]));
  $('dResolve').addEventListener('click', () => doResolve([view.openId]));
  $('noteBtn').addEventListener('click', () => {
    const input = $('noteInput');
    if (NOC.addNote(view.openId, input.value)) {
      input.value = '';
      renderDrawer();
      toast('Note added');
    }
  });

  /* ---------- Simulated incoming alarms ---------- */
  setInterval(() => {
    if (!$('simToggle').checked) return;
    const a = NOC.simulateAlarm();
    view.flashId = a.id;
    toast(`New ${a.sev} alarm: ${a.msg} on ${a.device}`);
    renderAll();
    setTimeout(() => { view.flashId = null; }, 2500);
  }, SIM_INTERVAL);

  // Keep "time ago" and durations fresh
  setInterval(() => { renderTable(); if (view.openId !== null) renderDrawer(); }, 30000);

  /* ---------- Init ---------- */
  App.start();
  renderAll();
})();
