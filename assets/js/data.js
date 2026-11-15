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

  function makeAlarms(devices) {
    const now = Date.now();
    const down = devices.filter(d => d.status === 'down');
    const warn = devices.filter(d => d.status === 'warning');
    return [
      { id: 1, sev: 'critical', device: down[0].name, msg: 'Device unreachable (ICMP timeout)', t: now - 4 * 60e3 },
      { id: 2, sev: 'critical', device: down[1].name, msg: 'Interface Gi0/1 link down', t: now - 11 * 60e3 },
      { id: 3, sev: 'major', device: warn[2].name, msg: 'High latency > 200 ms', t: now - 17 * 60e3 },
      { id: 4, sev: 'major', device: warn[0].name, msg: 'Packet loss above 3%', t: now - 26 * 60e3 },
      { id: 5, sev: 'minor', device: warn[1].name, msg: 'CPU utilisation 85%', t: now - 42 * 60e3 },
      { id: 6, sev: 'minor', device: 'hq-fw-01', msg: 'Config changed by admin', t: now - 68 * 60e3 },
    ].map(a => ({ ...a, acked: false }));
  }

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

    /** Simulated live traffic sample (replace with your interface counters). */
    tickTraffic() {
      this.trafficIn.push(nextTraffic(this.trafficIn[POINTS - 1], 430, 40));
      this.trafficOut.push(nextTraffic(this.trafficOut[POINTS - 1], 190, 25));
      this.trafficIn.shift(); this.trafficOut.shift();
    },
  };

  NOC.alarms = makeAlarms(NOC.devices);
  (function seedTraffic() {
    let a = 420, b = 180;
    for (let i = 0; i < POINTS; i++) {
      a = nextTraffic(a, 430, 40); b = nextTraffic(b, 190, 25);
      NOC.trafficIn.push(a); NOC.trafficOut.push(b);
    }
  })();

  global.NOC = NOC;
})(window);
