/* =========================================================
   Overview page
   ========================================================= */
(function () {
  'use strict';
  const { $, css, timeAgo } = App;
  const fmtMbps = v => `${v.toFixed(0)} Mbps`;

  /* ---------- KPIs ---------- */
  function renderKPIs() {
    const d = NOC.devices;
    const up = d.filter(x => x.status === 'up').length;
    const warn = d.filter(x => x.status === 'warning').length;
    const down = d.filter(x => x.status === 'down').length;
    const online = d.filter(x => x.latency !== null);
    const avg = online.reduce((s, x) => s + x.latency, 0) / online.length;
    const active = NOC.alarms.filter(a => !a.acked);

    $('kpiTotal').textContent = d.length;
    $('kpiSites').textContent = `across ${NOC.SITES.length} sites`;
    $('kpiUp').textContent = up + warn;
    $('kpiUpPct').textContent = `${(((up + warn) / d.length) * 100).toFixed(1)}% of fleet`;
    $('kpiDown').textContent = down;
    $('kpiWarn').textContent = `${warn} degraded`;
    $('kpiAlarms').textContent = active.length;
    $('kpiCrit').textContent = `${active.filter(a => a.sev === 'critical').length} critical`;
    $('kpiLatency').innerHTML = `${avg.toFixed(1)}<small>ms</small>`;
    App.updateNavCount();
  }

  /* ---------- Traffic line chart (canvas, no library) ---------- */
  function drawTraffic() {
    const canvas = $('trafficChart');
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr; canvas.height = h * dpr;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const P = NOC.POINTS;
    const pad = { l: 44, r: 8, t: 10, b: 22 };
    const cw = w - pad.l - pad.r, ch = h - pad.t - pad.b;
    const maxData = Math.max(...NOC.trafficIn, ...NOC.trafficOut);
    const yMax = Math.ceil((maxData * 1.15) / 100) * 100;

    ctx.font = '11px ui-monospace, Menlo, Consolas, monospace';
    ctx.fillStyle = css('--muted');
    ctx.strokeStyle = css('--grid');
    ctx.lineWidth = 1;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + ch - (ch * i) / 4;
      ctx.beginPath(); ctx.moveTo(pad.l, y + 0.5); ctx.lineTo(w - pad.r, y + 0.5); ctx.stroke();
      ctx.fillText(`${Math.round((yMax * i) / 4)}`, pad.l - 8, y);
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ['-2m', '-90s', '-60s', '-30s', 'now'].forEach((lbl, i) => {
      ctx.fillText(lbl, pad.l + (cw * i) / 4, pad.t + ch + 6);
    });

    const x = i => pad.l + (cw * i) / (P - 1);
    const y = v => pad.t + ch - (v / yMax) * ch;

    function series(data, color) {
      const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + ch);
      grad.addColorStop(0, color + '55');
      grad.addColorStop(1, color + '00');
      ctx.beginPath();
      ctx.moveTo(x(0), y(data[0]));
      data.forEach((v, i) => ctx.lineTo(x(i), y(v)));
      ctx.lineTo(x(data.length - 1), pad.t + ch);
      ctx.lineTo(x(0), pad.t + ch);
      ctx.closePath();
      ctx.fillStyle = grad; ctx.fill();
      ctx.beginPath();
      data.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))));
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
      const lx = x(data.length - 1), ly = y(data[data.length - 1]);
      ctx.beginPath(); ctx.arc(lx, ly, 3.5, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
    }
    series(NOC.trafficIn, css('--in'));
    series(NOC.trafficOut, css('--out'));

    $('tIn').textContent = fmtMbps(NOC.trafficIn[P - 1]);
    $('tOut').textContent = fmtMbps(NOC.trafficOut[P - 1]);
    $('tPeak').textContent = fmtMbps(Math.max(...NOC.trafficIn));
  }

  /* ---------- Status donut + device types ---------- */
  function renderStatus() {
    const d = NOC.devices;
    const parts = [
      { label: 'Online', n: d.filter(x => x.status === 'up').length, color: css('--ok') },
      { label: 'Degraded', n: d.filter(x => x.status === 'warning').length, color: css('--warn') },
      { label: 'Down', n: d.filter(x => x.status === 'down').length, color: css('--crit') },
    ];
    const r = 48, c = 2 * Math.PI * r;
    let offset = 0;
    let svg = `<circle cx="60" cy="60" r="${r}" fill="none" stroke="${css('--panel-2')}" stroke-width="14"/>`;
    parts.forEach(p => {
      const len = (p.n / d.length) * c;
      svg += `<circle cx="60" cy="60" r="${r}" fill="none" stroke="${p.color}" stroke-width="14"
        stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 60 60)"/>`;
      offset += len;
    });
    const health = ((parts[0].n / d.length) * 100).toFixed(0);
    svg += `<text x="60" y="58" text-anchor="middle" class="donut-center">${health}%</text>
            <text x="60" y="74" text-anchor="middle" class="donut-sub">HEALTHY</text>`;
    $('donut').innerHTML = svg;

    $('statusList').innerHTML = parts.map(p =>
      `<li><span class="dot" style="background:${p.color}"></span><span>${p.label}</span><span class="mono">${p.n}</span></li>`
    ).join('');

    const maxN = Math.max(...NOC.TYPES.map(t => t.n));
    $('typeBars').innerHTML = NOC.TYPES.map(t => {
      const n = d.filter(x => x.type === t.key).length;
      return `<div class="type-row"><span>${t.label}</span>
        <div class="bar"><span style="width:${(n / maxN) * 100}%"></span></div>
        <span class="n mono">${n}</span></div>`;
    }).join('');
  }

  /* ---------- Alarms ---------- */
  function renderAlarms() {
    $('alarmList').innerHTML = NOC.alarms.map(a => `
      <li class="alarm ${a.acked ? 'acked' : ''}">
        <span class="sev ${a.sev}">${a.sev}</span>
        <div>
          <div class="msg">${a.msg}</div>
          <div class="meta"><span class="mono">${a.device}</span> · ${timeAgo(a.t)}</div>
        </div>
        <button class="btn" data-ack="${a.id}" ${a.acked ? 'disabled' : ''}>${a.acked ? 'Acked' : 'Ack'}</button>
      </li>`).join('');
    $('alarmHint').textContent = `${NOC.alarms.filter(a => !a.acked).length} unacknowledged`;
  }

  $('alarmList').addEventListener('click', e => {
    const id = e.target.getAttribute('data-ack');
    if (!id) return;
    const a = NOC.alarms.find(x => x.id === Number(id));
    if (a) { a.acked = true; renderAlarms(); renderKPIs(); }
  });

  /* ---------- Latency table ---------- */
  const latClass = v => (v === null ? 'lat-bad' : v < 50 ? 'lat-good' : v < 150 ? 'lat-mid' : 'lat-bad');

  function renderLatency() {
    const rows = [...NOC.devices]
      .sort((a, b) => (b.latency ?? 9999) - (a.latency ?? 9999))
      .slice(0, 6);
    $('latencyTable').innerHTML = rows.map(d => `
      <tr>
        <td><div class="dev-name mono">${d.name}</div><div class="dev-sub">${d.ip} · ${d.site}</div></td>
        <td class="num mono ${latClass(d.latency)}">${d.latency === null ? 'timeout' : d.latency.toFixed(0) + ' ms'}</td>
        <td class="num mono">${d.loss.toFixed(1)}%</td>
      </tr>`).join('');
  }

  /* ---------- Init + live loop ---------- */
  App.start({ onTheme: () => { drawTraffic(); renderStatus(); } });
  renderKPIs(); renderAlarms(); renderLatency();
  window.addEventListener('resize', drawTraffic);

  setInterval(() => {
    NOC.tickTraffic(); NOC.tickLatency();
    drawTraffic(); renderKPIs(); renderLatency();
  }, 2000);
  setInterval(renderAlarms, 60e3);
})();
