/* =========================================================
   Shared app shell: theme toggle, mobile menu, clock,
   alarm counter in the sidebar, toast and small helpers.
   Each page calls App.start({ onTheme }) once at the end.
   ========================================================= */
const App = (function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  function timeAgo(t) {
    const s = Math.round((Date.now() - t) / 1000);
    if (s < 10) return 'just now';
    if (s < 60) return `${s} s ago`;
    const m = Math.round(s / 60);
    if (m < 60) return `${m} min ago`;
    return `${Math.floor(m / 60)} h ${m % 60} min ago`;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  const SUN = '<circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="4.9" y1="4.9" x2="6.3" y2="6.3"/><line x1="17.7" y1="17.7" x2="19.1" y2="19.1"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.9" y1="19.1" x2="6.3" y2="17.7"/><line x1="17.7" y1="6.3" x2="19.1" y2="4.9"/>';
  const MOON = '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>';

  const themeListeners = [];
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    const icon = $('themeIcon');
    if (icon) icon.innerHTML = t === 'dark' ? SUN : MOON;
    try { localStorage.setItem('sb-theme', t); } catch (e) { /* storage unavailable */ }
    themeListeners.forEach(fn => fn(t));
  }

  function updateNavCount() {
    const el = $('navAlarmCount');
    if (el && window.NOC) el.textContent = NOC.activeAlarms().length;
  }

  let toastTimer;
  function toast(msg) {
    let el = $('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast'; el.className = 'toast'; el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  function setMenu(open) {
    const sb = $('sidebar'), scrim = $('scrim');
    if (sb) sb.classList.toggle('open', open);
    if (scrim) scrim.classList.toggle('show', open);
  }

  function start(opts = {}) {
    if (opts.onTheme) themeListeners.push(opts.onTheme);

    const themeBtn = $('themeBtn');
    if (themeBtn) themeBtn.addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme');
      applyTheme(cur === 'dark' ? 'light' : 'dark');
    });

    const menuBtn = $('menuBtn');
    if (menuBtn) menuBtn.addEventListener('click', () => setMenu(true));
    const scrim = $('scrim');
    if (scrim) scrim.addEventListener('click', () => setMenu(false));

    const clock = $('clock');
    const tickClock = () => { if (clock) clock.textContent = new Date().toLocaleTimeString([], { hour12: false }); };
    tickClock(); setInterval(tickClock, 1000);

    let saved = 'dark';
    try { saved = localStorage.getItem('sb-theme') || 'dark'; } catch (e) { /* ignore */ }
    applyTheme(saved);
    updateNavCount();
  }

  return { $, css, timeAgo, escapeHtml, toast, applyTheme, updateNavCount, start };
})();
