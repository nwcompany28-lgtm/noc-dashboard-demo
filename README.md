# Uplink NOC — Network Monitoring Dashboard Template

A clean, fast NOC (Network Operations Center) dashboard built with **plain HTML, CSS and JavaScript**.
No frameworks, no build step, no external libraries. Open `index.html` and it runs.

Designed by a working network/telecom engineer, for teams who monitor routers, switches,
access points and firewalls every day.

---

## What's included

| Page | File | Highlights |
|---|---|---|
| **Overview** | `index.html` | KPI cards, live WAN traffic chart, device status donut, recent alarms, highest-latency table |
| **Devices** | `devices.html` | Search, type/site filters, status chips, sortable columns, pagination, quick-view drawer with live latency sparkline, CSV export |
| **Alarms** | `alarms.html` | Severity summary cards, status filters, acknowledge/resolve (single or bulk), detail drawer with timeline and team notes, simulated incoming alarms |
| **Topology** | `topology.html` | Site-grouped network diagram, status-coloured nodes and links, animated traffic flow, hover highlighting, pan and zoom, device and link details |

**On every page:** dark and light theme (remembered per browser), responsive layout for
desktop, tablet and phone, and a collapsible sidebar on small screens.

---

## Quick start

1. Unzip the package.
2. Open `index.html` in any modern browser (Chrome, Edge, Firefox, Safari).

That's it. To put it online, upload the whole folder to any static host
(GitHub Pages, Netlify, Vercel, cPanel shared hosting, Nginx, Apache…).

---

## Folder structure

```
uplink-noc/
├── index.html          Overview page
├── devices.html        Devices page
├── alarms.html         Alarms page
├── topology.html       Topology page
├── assets/
│   ├── css/
│   │   └── style.css   All styles + theme colours
│   └── js/
│       ├── data.js     DATA LAYER — mock data and actions (replace with your API)
│       ├── app.js      Shared shell: theme, menu, clock, toast, helpers
│       ├── overview.js
│       ├── devices.js
│       ├── alarms.js
│       └── topology.js
├── README.md
├── LICENSE.md
└── CHANGELOG.md
```

---

## Connecting your real data

Every page reads its data from one global object, `NOC`, defined in **`assets/js/data.js`**.
The page scripts never generate data themselves, so you only need to change one file.

### 1. Devices

Replace `makeDevices()` with data from your monitoring system. Each device must look like this:

```js
{
  id: 1,
  name: 'hq-sw-01',
  type: 'switch',          // 'router' | 'switch' | 'ap' | 'firewall'
  site: 'HQ',              // must exist in NOC.SITES
  ip: '10.10.0.11',
  model: 'Cisco C9200-48P',
  status: 'up',            // 'up' | 'warning' | 'down'
  latency: 4.2,            // ms, or null when unreachable
  loss: 0,                 // packet loss %
  uptimeDays: 120,
  cpu: 23, mem: 41,        // %
  lastSeen: Date.now()     // ms timestamp
}
```

Example with a REST API — each page script is wrapped in a function, so make it `async`
and load the data before anything is rendered:

```js
// assets/js/devices.js (same idea in the other page scripts)
(async function () {
  'use strict';
  NOC.devices = await (await fetch('/api/devices')).json();
  // ...rest of the file unchanged
})();
```

### 2. Alarms

Replace `makeAlarms()`. Alarm shape:

```js
{
  id: 7, sev: 'major',          // 'critical' | 'major' | 'minor'
  device: 'hq-sw-01', msg: 'Power supply 2 failure', t: 1731650000000,
  status: 'active',             // 'active' | 'acked' | 'resolved'
  ackBy: null, resolvedAt: null,
  notes: [ { t, by, text } ],
  events: [ { t, text } ]
}
```

The actions `NOC.ackAlarm()`, `NOC.resolveAlarm()` and `NOC.addNote()` update the local object.
Add a `fetch(..., { method: 'POST' })` inside each one to save changes on your server.

### 3. Topology links

Replace `NOC.buildTopology()` with your LLDP/CDP neighbour data or CMDB export:

```js
{ id: 1, a: 'hq-fw-01', b: 'hq-rtr-01', capacity: 10000, util: 0.42 }  // capacity in Mbps, util 0–1
```

`'internet'` is a virtual node that represents your upstream WAN.

### 4. Live updates

The demo simulates live data with `NOC.tickLatency()` and `NOC.tickTraffic()`, called every
2 seconds by each page. Replace them with polling (`setInterval` + `fetch`) or a WebSocket.

### 5. Remove demo-only code

- `simulateAlarm()` in `data.js` and the "Simulate new alarms" toggle in `alarms.html`
- The `sessionStorage` block in `data.js` (keeps alarm changes between pages in the demo)
- The `toast('Demo: …')` messages on the *Add device*, *Open SSH* and *View details* buttons

---

## Customising

### Colours and theme

All colours are CSS variables at the top of `assets/css/style.css`, one block per theme:

```css
:root[data-theme="dark"]  { --accent: #3b82f6; --ok: #22c55e; --warn: #f59e0b; --crit: #ef4444; … }
:root[data-theme="light"] { … }
```

Change `--accent` to your brand colour and the whole dashboard follows.

### Brand name and logo

Search all `.html` files for `Uplink NOC` and replace the text. The logo is the small inline
SVG inside `.brand-mark`; swap it for your own SVG or an `<img>`.

### Sites and device types

Edit `SITES` and `TYPES` at the top of `data.js`. Filters, charts and the topology layout
update automatically.

### Default theme

The dashboard opens in dark mode. To start in light mode, change `'dark'` to `'light'`
in the small `<script>` inside each page's `<head>` and in `App.start()` in `app.js`.

---

## Browser support

Latest versions of Chrome, Edge, Firefox and Safari (desktop and mobile).
Uses `color-mix()` in CSS, which is supported by all of these.

## Third-party assets

None. All icons are inline SVG drawn for this template, and all charts are drawn with
native Canvas/SVG code. Device models and names in the demo data are fictional examples.

## Support

Questions or bug reports: **[your support email]**
Please include your order number and a short description or screenshot.

---

© 2026 NW Company. See `LICENSE.md` for usage terms.
