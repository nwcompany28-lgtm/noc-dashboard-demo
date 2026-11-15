/* =========================================================
   DATA LAYER (mock)
   Every page reads its data from the global `NOC` object.
   To connect real data, replace the mock generators below
   with calls to your own API, for example:

     const res = await fetch('/api/devices');
     NOC.devices = await res.json();

   Device object shape:
   { id, name, type, site, ip, model, status: 'up'|'warning'|'down',
     latency (ms or null), loss (%), uptimeDays, cpu (%), mem (%), lastSeen (ms timestamp) }
   ========================================================= */
(function (global) {
  'use strict';

  // Seeded random so every page shows the same demo fleet
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const seeded = mulberry32(28);
  const srand = (min, max) => seeded() * (max - min) + min;
  const rand = (min, max) => Math.random() * (max - min) + min;

  const SITES = ['HQ', 'Branch-A', 'Branch-B', 'DataCenter'];
  const TYPES = [
    { key: 'router',   label: 'Routers',       single: 'Router',       prefix: 'rtr', n: 6,  models: ['Cisco ISR 4331', 'MikroTik CCR2004', 'Juniper MX204'] },
    { key: 'switch',   label: 'Switches',      single: 'Switch',       prefix: 'sw',  n: 18, models: ['Cisco C9200-48P', 'Aruba 2930F', 'MikroTik CRS326'] },
    { key: 'ap',       label: 'Access Points', single: 'Access Point', prefix: 'ap',  n: 20, models: ['Ubiquiti U6-Pro', 'Aruba AP-515', 'Ruckus R650'] },
    { key: 'firewall', label: 'Firewalls',     single: 'Firewall',     prefix: 'fw',  n: 4,  models: ['FortiGate 100F', 'Palo Alto PA-440'] },
  ];
  const STATUS_LABEL = { up: 'Online', warning: 'Degraded', down: 'Down' };

  function makeDevices() {
    const now = Date.now();
    const list = [];
    let id = 1, host = 10;
    TYPES.forEach(t => {
      for (let i = 1; i <= t.n; i++) {
        const site = SITES[i % SITES.length];
        list.push({
          id: id++,
          name: `${site.toLowerCase()}-${t.prefix}-${String(i).padStart(2, '0')}`,
          type: t.key,
          site,
          ip: `10.${SITES.indexOf(site) + 10}.0.${host++}`,
          model: t.models[i % t.models.length],
          status: 'up',
          latency: srand(1, 18),
          loss: 0,
          uptimeDays: Math.round(srand(3, 240)),
          cpu: Math.round(srand(8, 55)),
          mem: Math.round(srand(25, 70)),
          lastSeen: now,
        });
      }
    });
    // A few devices with problems so the demo looks realistic
    const set = (i, patch) => Object.assign(list[i], patch);
    set(7,  { status: 'down', latency: null, loss: 100, uptimeDays: 0, cpu: 0, mem: 0, lastSeen: now - 4 * 60e3 });
    set(29, { status: 'down', latency: null, loss: 100, uptimeDays: 0, cpu: 0, mem: 0, lastSeen: now - 11 * 60e3 });
    set(12, { status: 'warning', latency: 142, loss: 3.2, cpu: 64 });
    set(33, { status: 'warning', latency: 96, loss: 1.1, cpu: 85, mem: 81 });
    set(41, { status: 'warning', latency: 210, loss: 6.5, cpu: 71 });
    return list;
  }

  /*
    Alarm object shape:
    { id, sev: 'critical'|'major'|'minor', device, msg, t (raised, ms),
      status: 'active'|'acked'|'resolved', ackBy, resolvedAt,
      notes: [{ t, by, text }], events: [{ t, text }] }
  */
  function makeAlarms(devices) {
    const now = Date.now();
    const M = 60e3, H = 60 * M;
    const down = devices.filter(d => d.status === 'down');
    const warn = devices.filter(d => d.status === 'warning');
    const raw = [
      // Active
      { sev: 'critical', device: down[0].name, msg: 'Device unreachable (ICMP timeout)', t: now - 4 * M },
      { sev: 'critical', device: down[1].name, msg: 'Interface Gi0/1 link down', t: now - 11 * M },
      { sev: 'major', device: warn[2].name, msg: 'High latency > 200 ms', t: now - 17 * M },
      { sev: 'major', device: warn[0].name, msg: 'Packet loss above 3%', t: now - 26 * M },
      { sev: 'minor', device: warn[1].name, msg: 'CPU utilisation 85%', t: now - 42 * M },
      { sev: 'minor', device: 'hq-fw-01', msg: 'Config changed by admin', t: now - 68 * M },
      // Acknowledged
      { sev: 'major', device: 'datacenter-sw-03', msg: 'Power supply 2 failure', t: now - 2.5 * H, status: 'acked', ackBy: 'r.santos', ackAfter: 9 * M },
      { sev: 'minor', device: 'branch-a-ap-05', msg: 'Client count above threshold (85)', t: now - 3.2 * H, status: 'acked', ackBy: 'admin', ackAfter: 21 * M },
      // Resolved
      { sev: 'critical', device: 'hq-rtr-02', msg: 'BGP session to ISP-1 down', t: now - 5 * H, status: 'resolved', ackBy: 'admin', ackAfter: 3 * M, resolveAfter: 38 * M },
      { sev: 'major', device: 'branch-b-sw-06', msg: 'Spanning-tree topology change', t: now - 7.5 * H, status: 'resolved', ackBy: 'r.santos', ackAfter: 12 * M, resolveAfter: 25 * M },
      { sev: 'minor', device: 'datacenter-fw-02', msg: 'SSL certificate expires in 14 days', t: now - 20 * H, status: 'resolved', ackBy: 'admin', ackAfter: 2 * H, resolveAfter: 3 * H },
      { sev: 'major', device: 'hq-sw-12', msg: 'Interface Te1/0/1 CRC errors rising', t: now - 26 * H, status: 'resolved', ackBy: 'admin', ackAfter: 15 * M, resolveAfter: 50 * M },
    ];
    return raw.map((a, i) => {
      const status = a.status || 'active';
      const events = [{ t: a.t, text: `Alarm raised: ${a.msg}` }];
      if (status !== 'active') events.push({ t: a.t + a.ackAfter, text: `Acknowledged by ${a.ackBy}` });
      if (status === 'resolved') events.push({ t: a.t + a.resolveAfter, text: 'Condition cleared — alarm resolved' });
      const notes = status !== 'active'
        ? [{ t: a.t + a.ackAfter + 60e3, by: a.ackBy, text: 'Checking with on-site team.' }]
        : [];
      return {
        id: i + 1, sev: a.sev, device: a.device, msg: a.msg, t: a.t, status,
        ackBy: status !== 'active' ? a.ackBy : null,
        resolvedAt: status === 'resolved' ? a.t + a.resolveAfter : null,
        notes, events,
      };
    });
  }

  const NEW_ALARM_POOL = [
    { sev: 'major', msg: 'High latency > 150 ms' },
    { sev: 'minor', msg: 'Memory utilisation 82%' },
    { sev: 'critical', msg: 'Interface uplink down' },
    { sev: 'minor', msg: 'Fan speed above normal' },
    { sev: 'major', msg: 'Packet loss above 2%' },
  ];

  // Traffic: 60 points, one every 2 s (= 2 minutes of history)
  const POINTS = 60;
  function nextTraffic(prev, base, swing) {
    const v = prev + rand(-swing, swing) + (base - prev) * 0.08;
    return Math.max(5, Math.min(980, v));
  }

  const NOC = {
    SITES, TYPES, STATUS_LABEL, POINTS, rand,
    devices: makeDevices(),
    alarms: [],
    trafficIn: [],
    trafficOut: [],

    typeLabel(key) { const t = TYPES.find(x => x.key === key); return t ? t.single : key; },

    /** Simulated live update of latency values (replace with polling your API). */
    tickLatency() {
      this.devices.forEach(d => {
        if (d.latency === null) return;
        const base = d.status === 'warning' ? d.latency : 8;
        d.latency = Math.max(0.5, d.latency + rand(-2, 2) + (base - d.latency) * 0.1);
        d.lastSeen = Date.now();
      });
    },

    /* ---------- Alarm actions (replace with POST requests to your API) ---------- */
    CURRENT_USER: 'admin',
    findAlarm(id) { return this.alarms.find(a => a.id === id); },
    activeAlarms() { return this.alarms.filter(a => a.status === 'active'); },

    ackAlarm(id) {
      const a = this.findAlarm(id);
      if (!a || a.status !== 'active') return false;
      a.status = 'acked'; a.ackBy = this.CURRENT_USER;
      a.events.push({ t: Date.now(), text: `Acknowledged by ${this.CURRENT_USER}` });
      this.save();
      return true;
    },
    resolveAlarm(id) {
      const a = this.findAlarm(id);
      if (!a || a.status === 'resolved') return false;
      if (a.status === 'active') { a.ackBy = this.CURRENT_USER; a.events.push({ t: Date.now(), text: `Acknowledged by ${this.CURRENT_USER}` }); }
      a.status = 'resolved'; a.resolvedAt = Date.now();
      a.events.push({ t: Date.now(), text: `Resolved manually by ${this.CURRENT_USER}` });
      this.save();
      return true;
    },
    addNote(id, text) {
      const a = this.findAlarm(id);
      if (!a || !text.trim()) return false;
      const note = { t: Date.now(), by: this.CURRENT_USER, text: text.trim() };
      a.notes.push(note);
      a.events.push({ t: note.t, text: `Note added by ${note.by}` });
      this.save();
      return true;
    },

    /** Demo only: raise a random new alarm on a random online device. */
    simulateAlarm() {
      const online = this.devices.filter(d => d.status !== 'down');
      const dev = online[Math.floor(Math.random() * online.length)];
      const tpl = NEW_ALARM_POOL[Math.floor(Math.random() * NEW_ALARM_POOL.length)];
      const a = {
        id: Math.max(0, ...this.alarms.map(x => x.id)) + 1,
        sev: tpl.sev, device: dev.name, msg: tpl.msg, t: Date.now(),
        status: 'active', ackBy: null, resolvedAt: null, notes: [],
        events: [{ t: Date.now(), text: `Alarm raised: ${tpl.msg}` }],
      };
      this.alarms.unshift(a);
      this.save();
      return a;
    },

    deviceByName(name) { return this.devices.find(d => d.name === name); },

    /*
      Topology links. Replace with data from LLDP/CDP or your CMDB.
      Link shape: { id, a, b, capacity (Mbps), util (0–1) }
      'internet' is a virtual node (not a device).
    */
    buildTopology() {
      const rng = mulberry32(99);
      const links = [];
      let id = 1;
      const L = (a, b, capacity) => links.push({ id: id++, a, b, capacity, util: 0.05 + rng() * 0.65 });
      const by = (site, type) => this.devices.filter(d => d.site === site && d.type === type);
      SITES.forEach(site => {
        const fw = by(site, 'firewall'), rt = by(site, 'router'), sw = by(site, 'switch'), ap = by(site, 'ap');
        fw.forEach(f => L('internet', f.name, 1000));
        rt.forEach(r => fw.forEach(f => L(f.name, r.name, 10000)));
        sw.forEach((s, i) => L(rt[i % rt.length].name, s.name, 10000));
        ap.forEach((a, i) => L(sw[i % sw.length].name, a.name, 1000));
      });
      return links;
    },

    /** Simulated live traffic sample (replace with your interface counters). */
    tickTraffic() {
      this.trafficIn.push(nextTraffic(this.trafficIn[POINTS - 1], 430, 40));
      this.trafficOut.push(nextTraffic(this.trafficOut[POINTS - 1], 190, 25));
      this.trafficIn.shift(); this.trafficOut.shift();
    },
  };

  NOC.alarms = makeAlarms(NOC.devices);

  // Demo convenience: keep alarm changes while moving between pages (this browser tab only).
  // Remove this block when alarms come from a real API.
  NOC.save = function () {
    try { sessionStorage.setItem('uplink-noc-alarms', JSON.stringify(this.alarms)); } catch (e) { /* ignore */ }
  };
  try {
    const saved = JSON.parse(sessionStorage.getItem('uplink-noc-alarms') || 'null');
    if (Array.isArray(saved) && saved.length) NOC.alarms = saved;
  } catch (e) { /* ignore */ }
  (function seedTraffic() {
    let a = 420, b = 180;
    for (let i = 0; i < POINTS; i++) {
      a = nextTraffic(a, 430, 40); b = nextTraffic(b, 190, 25);
      NOC.trafficIn.push(a); NOC.trafficOut.push(b);
    }
  })();

  global.NOC = NOC;
})(window);
