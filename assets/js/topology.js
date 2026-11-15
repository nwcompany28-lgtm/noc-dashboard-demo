/* =========================================================
   Topology page
   - SVG diagram grouped by site (no library)
   - node & link colours follow device status
   - animated traffic flow, hover highlight of neighbours
   - pan (drag) and zoom (wheel / buttons / site focus)
   - drawer with device or link details
   ========================================================= */
(function () {
  'use strict';
  const { $, escapeHtml, toast } = App;
  const NS = 'http://www.w3.org/2000/svg';

  /* ---------- Layout constants ---------- */
  const SITE_W = 300, X0 = 20, NODE = 34;
  const W = X0 * 2 + SITE_W * NOC.SITES.length;
  const H = 590;
  const ROW_Y = { internet: 45, firewall: 165, router: 270, switch: 390, ap: 510 };
  const GLYPH = { router: 'R', switch: 'SW', ap: 'AP', firewall: 'FW' };

  const links = NOC.buildTopology();
  const pos = new Map(); // node name -> {x, y}
  let suppressClick = false;

  const shortName = n => n.split('-').slice(-2).join('-');
  const statusOf = name => (name === 'internet' ? 'up' : (NOC.deviceByName(name) || {}).status || 'up');
  function linkStatus(l) {
    const s = [statusOf(l.a), statusOf(l.b)];
    if (s.includes('down')) return 'down';
    if (s.includes('warning')) return 'warning';
    return 'up';
  }
  const fmtCap = c => (c >= 1000 ? `${c / 1000} Gbps` : `${c} Mbps`);
  const neighbours = name => links.filter(l => l.a === name || l.b === name);
  const other = (l, name) => (l.a === name ? l.b : l.a);

  /* ---------- Layout ---------- */
  function layout() {
    pos.set('internet', { x: W / 2, y: ROW_Y.internet });
    NOC.SITES.forEach((site, i) => {
      const colX = X0 + i * SITE_W;
      ['firewall', 'router', 'switch', 'ap'].forEach(type => {
        const devs = NOC.devices.filter(d => d.site === site && d.type === type);
        devs.forEach((d, k) => pos.set(d.name, { x: colX + ((k + 1) * SITE_W) / (devs.length + 1), y: ROW_Y[type] }));
      });
    });
  }

  /* ---------- Render ---------- */
  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    Object.entries(attrs || {}).forEach(([k, v]) => e.setAttribute(k, v));
    if (parent) parent.appendChild(e);
    return e;
  }

  function render() {
    const vp = $('viewport');
    vp.innerHTML = '';

    // Site group boxes
    const gSites = el('g', {}, vp);
    NOC.SITES.forEach((site, i) => {
      const x = X0 + i * SITE_W + 6;
      el('rect', { class: 'site-box', x, y: 110, width: SITE_W - 12, height: H - 125, rx: 14 }, gSites);
      const t = el('text', { class: 'site-label', x: x + 14, y: 132 }, gSites);
      t.textContent = site;
    });

    // Links (hit area + visible line + flow overlay)
    const gLinks = el('g', {}, vp);
    links.forEach(l => {
      const a = pos.get(l.a), b = pos.get(l.b);
      const st = linkStatus(l);
      const g = el('g', { 'data-link': l.id, 'data-a': l.a, 'data-b': l.b }, gLinks);
      // start below the label of the upper node so lines never cross text
      const coords = { x1: a.x, y1: a.y + NODE / 2 + 18, x2: b.x, y2: b.y - NODE / 2 };
      el('line', { ...coords, class: 'link-hit' }, g);
      el('line', { ...coords, class: `link ${st}`, 'stroke-width': l.capacity >= 10000 ? 2.6 : 1.4 }, g);
      if (st !== 'down') {
        const dur = (3.2 - l.util * 2.6).toFixed(2);
        el('line', { ...coords, class: 'flow', style: `animation-duration:${dur}s`, 'stroke-width': l.capacity >= 10000 ? 2 : 1.5 }, g);
      }
    });

    // Nodes
    const gNodes = el('g', {}, vp);
    const addNode = (name, label, glyph, cls) => {
      const p = pos.get(name);
      const g = el('g', { class: `node ${cls}`, 'data-node': name, transform: `translate(${p.x - NODE / 2},${p.y - NODE / 2})` }, gNodes);
      if (cls.includes('down')) el('rect', { class: 'pulse', x: 0, y: 0, width: NODE, height: NODE, rx: 9 }, g);
      el('rect', { class: 'box', x: 0, y: 0, width: NODE, height: NODE, rx: 9 }, g);
      const gl = el('text', { class: 'glyph', x: NODE / 2, y: NODE / 2 + 4, 'text-anchor': 'middle' }, g);
      gl.textContent = glyph;
      const lb = el('text', { class: 'lbl', x: NODE / 2, y: NODE + 14, 'text-anchor': 'middle' }, g);
      lb.textContent = label;
      const title = el('title', {}, g);
      title.textContent = name;
    };
    addNode('internet', 'Internet', 'WAN', 'cloud up');
    NOC.devices.forEach(d => addNode(d.name, shortName(d.name), GLYPH[d.type] || '?', d.status));

    $('topo').classList.toggle('no-labels', !$('tLabels').checked);
    $('topo').classList.toggle('no-flow', !$('tFlow').checked);
  }

  /* ---------- KPIs ---------- */
  function renderKPIs() {
    const st = links.map(linkStatus);
    const live = links.filter((l, i) => st[i] !== 'down');
    const avg = live.reduce((s, l) => s + l.util, 0) / live.length;
    const busy = live.reduce((m, l) => (l.util > m.util ? l : m), live[0]);
    $('kLinks').textContent = links.length;
    $('kNodes').textContent = `${NOC.devices.length + 1} nodes`;
    $('kDown').textContent = st.filter(s => s === 'down').length;
    $('kWarn').textContent = st.filter(s => s === 'warning').length;
    $('kUtil').innerHTML = `${(avg * 100).toFixed(0)}<small>%</small>`;
    $('kBusy').textContent = `${(busy.util * 100).toFixed(0)}%`;
    $('kBusyName').textContent = `${shortName(busy.a)} ↔ ${shortName(busy.b)}`;
    App.updateNavCount();
  }

  /* ---------- Pan & zoom (SVG viewBox) ---------- */
  const svg = $('topo');
  let vb = { x: 0, y: 0, w: W, h: H };
  const applyVB = () => svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  const fit = () => { vb = { x: 0, y: 0, w: W, h: H }; applyVB(); };

  function unitsPerPx() {
    return Math.max(vb.w / svg.clientWidth, vb.h / svg.clientHeight);
  }
  function zoom(factor, cx, cy) {
    const nw = Math.min(W * 2, Math.max(W / 8, vb.w * factor));
    const k = nw / vb.w;
    if (cx === undefined) { cx = vb.x + vb.w / 2; cy = vb.y + vb.h / 2; }
    vb = { x: cx - (cx - vb.x) * k, y: cy - (cy - vb.y) * k, w: vb.w * k, h: vb.h * k };
    applyVB();
  }
  function clientToSvg(e) {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  svg.addEventListener('wheel', e => {
    e.preventDefault();
    const p = clientToSvg(e);
    zoom(e.deltaY > 0 ? 1.12 : 1 / 1.12, p.x, p.y);
  }, { passive: false });

  let drag = null;
  svg.addEventListener('pointerdown', e => {
    drag = { x: e.clientX, y: e.clientY, vb: { ...vb }, moved: false };
  });
  window.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    if (!drag.moved) { drag.moved = true; svg.classList.add('panning'); }
    const u = unitsPerPx();
    vb = { ...drag.vb, x: drag.vb.x - dx * u, y: drag.vb.y - dy * u };
    applyVB();
  });
  window.addEventListener('pointerup', () => {
    if (drag && drag.moved) { suppressClick = true; setTimeout(() => { suppressClick = false; }, 0); }
    drag = null;
    svg.classList.remove('panning');
  });

  $('zIn').addEventListener('click', () => zoom(1 / 1.25));
  $('zOut').addEventListener('click', () => zoom(1.25));
  $('zFit').addEventListener('click', () => { $('fSite').value = 'all'; fit(); });

  $('fSite').innerHTML += NOC.SITES.map(s => `<option value="${s}">${s}</option>`).join('');
  $('fSite').addEventListener('change', e => {
    const i = NOC.SITES.indexOf(e.target.value);
    if (i < 0) { fit(); return; }
    vb = { x: X0 + i * SITE_W - 10, y: 100, w: SITE_W + 20, h: H - 95 };
    applyVB();
  });

  $('tLabels').addEventListener('change', e => svg.classList.toggle('no-labels', !e.target.checked));
  $('tFlow').addEventListener('change', e => svg.classList.toggle('no-flow', !e.target.checked));

  /* ---------- Hover highlight ---------- */
  function highlight(name) {
    const keep = new Set([name, ...neighbours(name).map(l => other(l, name))]);
    svg.querySelectorAll('.node').forEach(n => n.classList.toggle('dim', !keep.has(n.dataset.node)));
    svg.querySelectorAll('[data-link]').forEach(g => {
      const on = g.dataset.a === name || g.dataset.b === name;
      g.classList.toggle('dim', !on);
      g.querySelector('.link').classList.toggle('hl', on);
    });
  }
  function clearHighlight() {
    svg.querySelectorAll('.dim').forEach(n => n.classList.remove('dim'));
    svg.querySelectorAll('.link.hl').forEach(n => n.classList.remove('hl'));
  }
  svg.addEventListener('mouseover', e => {
    const n = e.target.closest('.node');
    if (n && !drag) highlight(n.dataset.node);
  });
  svg.addEventListener('mouseout', e => {
    const n = e.target.closest('.node');
    if (n && !n.contains(e.relatedTarget)) clearHighlight();
  });

  /* ---------- Drawer ---------- */
  let open = null; // { kind: 'node'|'link', key }
  const badge = s => `<span class="badge ${s}"><span class="dot ${s}"></span>${NOC.STATUS_LABEL[s]}</span>`;

  function renderDrawer() {
    if (!open) return;
    svg.querySelectorAll('.node.sel').forEach(n => n.classList.remove('sel'));

    if (open.kind === 'node') {
      const name = open.key;
      const sel = svg.querySelector(`.node[data-node="${name}"]`);
      if (sel) sel.classList.add('sel');
      const nb = neighbours(name).map(l => ({ l, n: other(l, name) }));
      const nbHtml = `<ul class="nb-list">${nb.map(({ l, n }) => `
          <li data-goto="${n}"><span class="dot ${statusOf(n)}"></span><span class="mono">${escapeHtml(n === 'internet' ? 'Internet' : n)}</span>
          <span class="u mono">${linkStatus(l) === 'down' ? 'down' : (l.util * 100).toFixed(0) + '%'} · ${fmtCap(l.capacity)}</span></li>`).join('')}</ul>`;

      if (name === 'internet') {
        $('dTitle').textContent = 'Internet';
        $('dSub').textContent = 'Upstream WAN (virtual node)';
        $('dBadge').innerHTML = badge('up');
        $('dBody').innerHTML = `<div><div class="section-title">Connected firewalls (${nb.length})</div>${nbHtml}</div>`;
        $('dFoot').innerHTML = '';
        return;
      }
      const d = NOC.deviceByName(name);
      $('dTitle').textContent = d.name;
      $('dSub').textContent = d.model;
      $('dBadge').innerHTML = badge(d.status);
      const lat = d.latency === null ? '<span class="lat-bad">timeout</span>' : `${d.latency.toFixed(0)} ms`;
      $('dBody').innerHTML = `
        <div><div class="section-title">Details</div>
          <dl class="kv">
            <dt>IP address</dt><dd class="mono">${d.ip}</dd>
            <dt>Type</dt><dd>${NOC.typeLabel(d.type)}</dd>
            <dt>Site</dt><dd>${d.site}</dd>
            <dt>Latency</dt><dd class="mono">${lat}</dd>
            <dt>Packet loss</dt><dd class="mono">${d.loss.toFixed(1)}%</dd>
          </dl></div>
        <div><div class="section-title">Connected links (${nb.length})</div>${nbHtml}</div>`;
      $('dFoot').innerHTML = `
        <button class="btn btn-lg" id="fPing">Ping</button>
        <a class="btn btn-lg btn-primary" style="margin-left:auto;text-decoration:none" href="devices.html?q=${encodeURIComponent(d.name)}">Open in Devices</a>`;
      $('fPing').addEventListener('click', () => toast(d.latency === null ? `Ping ${d.ip}: request timed out` : `Ping ${d.ip}: ${d.latency.toFixed(1)} ms`));
    } else {
      const l = links.find(x => x.id === open.key);
      const st = linkStatus(l);
      const u = st === 'down' ? 0 : l.util;
      const inMb = u * l.capacity, outMb = inMb * 0.55;
      const fmtMb = v => (v >= 1000 ? `${(v / 1000).toFixed(2)} Gbps` : `${v.toFixed(0)} Mbps`);
      const ucls = u >= 0.85 ? 'crit' : u >= 0.7 ? 'hi' : '';
      $('dTitle').textContent = `${l.a === 'internet' ? 'Internet' : shortName(l.a)} ↔ ${shortName(l.b)}`;
      $('dSub').textContent = `${fmtCap(l.capacity)} link`;
      $('dBadge').innerHTML = badge(st);
      $('dBody').innerHTML = `
        <div><div class="section-title">Utilisation</div>
          <div class="meter"><span class="muted">Load</span><div class="bar"><span class="${ucls}" style="width:${(u * 100).toFixed(0)}%"></span></div>
          <span class="mono" style="text-align:right">${(u * 100).toFixed(0)}%</span></div>
          <dl class="kv" style="margin-top:6px">
            <dt>Capacity</dt><dd class="mono">${fmtCap(l.capacity)}</dd>
            <dt>Downstream</dt><dd class="mono">${st === 'down' ? '—' : fmtMb(inMb)}</dd>
            <dt>Upstream</dt><dd class="mono">${st === 'down' ? '—' : fmtMb(outMb)}</dd>
          </dl></div>
        <div><div class="section-title">Endpoints</div>
          <ul class="nb-list">${[l.a, l.b].map(n => `<li data-goto="${n}"><span class="dot ${statusOf(n)}"></span><span class="mono">${escapeHtml(n === 'internet' ? 'Internet' : n)}</span></li>`).join('')}</ul></div>`;
      $('dFoot').innerHTML = '';
    }
  }

  function openDrawer(kind, key) {
    open = { kind, key };
    renderDrawer();
    $('drawer').classList.add('open');
    $('drawer').setAttribute('aria-hidden', 'false');
    $('drawerScrim').classList.add('show');
  }
  function closeDrawer() {
    open = null;
    svg.querySelectorAll('.node.sel').forEach(n => n.classList.remove('sel'));
    $('drawer').classList.remove('open');
    $('drawer').setAttribute('aria-hidden', 'true');
    $('drawerScrim').classList.remove('show');
  }

  svg.addEventListener('click', e => {
    if (suppressClick) return;
    const n = e.target.closest('.node');
    if (n) { openDrawer('node', n.dataset.node); return; }
    const l = e.target.closest('[data-link]');
    if (l) openDrawer('link', Number(l.dataset.link));
  });
  $('dBody').addEventListener('click', e => {
    const li = e.target.closest('[data-goto]');
    if (li) openDrawer('node', li.dataset.goto);
  });
  $('drawerClose').addEventListener('click', closeDrawer);
  $('drawerScrim').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && open) closeDrawer(); });

  /* ---------- Init + live loop ---------- */
  App.start();
  layout();
  render();
  fit();
  // On narrow screens start zoomed into the first site; users can pick others or press Fit
  if (svg.clientWidth < 600) { $('fSite').value = NOC.SITES[0]; $('fSite').dispatchEvent(new Event('change')); }
  renderKPIs();

  setInterval(() => {
    NOC.tickLatency();
    links.forEach(l => { l.util = Math.min(0.95, Math.max(0.02, l.util + NOC.rand(-0.03, 0.03))); });
    renderKPIs();
    if (open) renderDrawer();
  }, 2000);
})();
