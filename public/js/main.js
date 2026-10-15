import { $, $$, esc } from './ui.js';
import { get } from './api.js';
import { state, t, setLang } from './i18n.js';
import { startTour } from './tour.js';
import { icon } from './icons.js';
import { sound, onSoundChange } from './voice.js';

const screens = {
  hub: () => import('./screens/hub.js'),
  bank: () => import('./screens/bank.js'),
  case: () => import('./screens/returnpath.js'),
  scamcheck: () => import('./screens/scamcheck.js'),
  desk: () => import('./screens/desk.js'),
  officer: () => import('./screens/officer.js'),
  eval: () => import('./screens/eval.js'),
  studio: () => import('./screens/studio.js'),
  real: () => import('./screens/real.js'),
  security: () => import('./screens/security.js'),
};
const META = {
  hub: ['Demo Hub', 'home', 'Customer'], bank: ['Bharat Bank + Ruko', 'bank', 'Customer'], case: ['ReturnPath', 'file', 'Customer'], scamcheck: ['Scam Check', 'search', 'Customer'],
  desk: ['Fraud Desk', 'desk', 'Bank'], officer: ['Officer View', 'badge', 'Police'], eval: ['Evaluation', 'chart', 'Judges'], studio: ['Evidence Studio', 'flask', 'Judges'], real: ['Real vs Mocked', 'scale', 'Judges'], security: ['Security · IDS/IPS', 'shield', 'Platform'],
};

export const app = { config: null, current: null, cleanup: null };

// Routing: URL hash on localhost and Firebase. Inside a Claude artifact the host does not pass
// "#/path" hashes through to the page, so that build keeps the route in memory and handles
// in-app "#/…" links itself.
const STATIC = !!window.RUKO_ARTIFACT;
let memHash = '#/';
export const currentHash = () => (STATIC ? memHash : location.hash || '#/');

export const hydrateIcons = (root = document) => $$('[data-icon]', root).forEach((el) => { if (!el.firstElementChild) el.innerHTML = icon(el.dataset.icon, { size: el.classList.contains('brand-mark') ? 20 : 18 }); });

export async function refreshConfig() {
  app.config = await get('/config');
  const p = $('#aiPill');
  const live = app.config.aiMode === 'gemini';
  p.className = 'ai-chip' + (live ? ' live' : '');
  p.innerHTML = `<span class="dot" aria-hidden="true"></span>${live ? 'Gemini live' : app.config.static ? 'Offline demo' : 'Offline rules'}${live ? ` <span class="model">${esc(app.config.models.fast)}</span>` : ''}`;
  p.title = live ? `Live Gemini (${app.config.models.fast}) with model fallback and cached responses` : app.config.static ? 'Shareable demo: runs fully in your browser with the offline rules engine' : 'No GEMINI_API_KEY: deterministic rules and cached responses';
}

function applyI18n() {
  $$('[data-i]').forEach((el) => { el.textContent = t(el.dataset.i); });
  $$('[data-lang]').forEach((b) => { b.classList.toggle('on', b.dataset.lang === state.lang); b.setAttribute('aria-pressed', b.dataset.lang === state.lang); });
}

let firstRender = true;
async function render() {
  const [, name = '', ...rest] = currentHash().replace(/^#/, '').split('/');
  const key = screens[name] ? name : 'hub';
  app.cleanup?.(); app.cleanup = null;
  $$('#nav [data-r]').forEach((a) => { const on = a.dataset.r === key; a.classList.toggle('active', on); on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'); });
  const [title, , group] = META[key];
  $('#crumb').innerHTML = `<span class="root">${group}</span><span class="sep" aria-hidden="true">/</span><span>${title}</span>`;
  document.title = `${title} · Ruko`;
  const view = $('#view');
  try {
    // Keep a visible loading state while the screen and its data load, never a blank area.
    if (!view.querySelector('.boot')) view.innerHTML = '<div class="boot" role="status"><span class="spinner" aria-hidden="true"></span>Loading…</div>';
    const mod = await screens[key]();
    view.classList.remove('enter');
    app.cleanup = (await mod.render(view, rest.filter(Boolean))) || null;
    void view.offsetWidth; view.classList.add('enter');
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="callout bad">${icon('alert')}<div><b>Something went wrong.</b> ${esc(e.message)}</div></div>`;
  }
  hydrateIcons(view);
  applyI18n();
  if (!firstRender) view.focus({ preventScroll: true });
  firstRender = false;
}

export const go = (hash) => {
  if (STATIC) { memHash = hash; window.scrollTo(0, 0); render(); return; }
  if (location.hash === hash) render(); else location.hash = hash;
};
window.__rukoNav = { go, currentHash };
if (STATIC) {
  // The artifact host handles clicks on every <a> itself (a "#/…" link reloads the page), so
  // in-app links become <span role="link" data-route> that the router handles. Keyboard works.
  const toSpan = (a) => {
    const s = document.createElement('span');
    for (const { name, value } of a.attributes) if (name !== 'href' && name !== 'target' && name !== 'rel') s.setAttribute(name, value);
    s.dataset.route = a.getAttribute('href');
    s.setAttribute('role', 'link');
    s.tabIndex = 0;
    s.style.cursor = 'pointer';
    while (a.firstChild) s.appendChild(a.firstChild);
    a.replaceWith(s);
  };
  const convert = (root) => { if (root?.matches?.('a[href^="#/"]')) toSpan(root); else root?.querySelectorAll?.('a[href^="#/"]').forEach(toSpan); };
  convert(document);
  new MutationObserver((muts) => muts.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1 && n.isConnected) convert(n); }))).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('click', (e) => { const a = e.target.closest?.('[data-route]'); if (!a) return; e.preventDefault(); go(a.dataset.route); }, true);
  document.addEventListener('keydown', (e) => { if (e.key !== 'Enter') return; const a = e.target.closest?.('[data-route]'); if (a) { e.preventDefault(); go(a.dataset.route); } });
}
export const rerender = () => render();

// ---------- command palette (⌘K) ----------
const COMMANDS = () => [
  ...Object.entries(META).map(([k, [title, ic, group]]) => ({ label: title, hint: group, ic, run: () => go(k === 'hub' ? '#/' : `#/${k}`) })),
  { label: 'Start Scenario A · digital-arrest scam', hint: 'Scenario', ic: 'stop', run: async () => (await import('./screens/hub.js')).startScenario('A') },
  { label: 'Start Scenario B · legitimate payment', hint: 'Scenario', ic: 'shieldCheck', run: async () => (await import('./screens/hub.js')).startScenario('B') },
  { label: 'Start Scenario C · wrongly frozen account', hint: 'Scenario', ic: 'snow', run: async () => (await import('./screens/hub.js')).startScenario('C') },
  { label: 'Take the guided tour (Hinglish)', hint: 'Tour', ic: 'play', run: () => startTour() },
  { label: 'Judge demo (hands-free)', hint: 'Tour', ic: 'sparkles', run: () => startTour({ auto: true }) },
  { label: 'Switch language', hint: state.lang === 'hi' ? 'English' : 'हिंदी', ic: 'languages', run: () => { setLang(state.lang === 'hi' ? 'en' : 'hi'); render(); } },
  { label: 'Sound on / off', hint: 'Voices and call audio', ic: 'volume', run: () => { sound.on = !sound.on; } },
  { label: 'Larger text on / off', hint: 'Accessibility', ic: 'eye', run: () => $('#textBtn').click() },
  { label: 'Light theme', hint: 'Theme', ic: 'sun', run: () => setTheme('light') },
  { label: 'Dark theme', hint: 'Theme', ic: 'moon', run: () => setTheme('dark') },
  { label: 'Follow system theme', hint: 'Theme', ic: 'monitor', run: () => setTheme('system') },
];
function openPalette() {
  if ($('.palette-wrap')) return;
  const prevFocus = document.activeElement;
  const wrap = document.createElement('div');
  wrap.className = 'palette-wrap';
  wrap.innerHTML = `<div class="palette" role="dialog" aria-modal="true" aria-label="Command palette"><input type="text" placeholder="Jump to a screen, start a scenario…" aria-label="Search commands" aria-controls="palList" autocomplete="off"><ul id="palList" role="listbox"></ul><div class="foot"><span><span class="kbd">↑↓</span> move</span><span><span class="kbd">↵</span> open</span><span><span class="kbd">esc</span> close</span></div></div>`;
  document.body.appendChild(wrap);
  const input = $('input', wrap), list = $('ul', wrap);
  let items = [], sel = 0;
  const close = () => { wrap.remove(); prevFocus?.focus?.(); };
  const draw = () => {
    const q = input.value.toLowerCase().trim();
    items = COMMANDS().filter((c) => !q || (c.label + ' ' + c.hint).toLowerCase().includes(q));
    sel = Math.min(sel, Math.max(0, items.length - 1));
    list.innerHTML = items.map((c, i) => `<li><button type="button" role="option" aria-selected="${i === sel}" data-i="${i}">${icon(c.ic)}<span>${esc(c.label)}</span><span class="hint">${esc(c.hint)}</span></button></li>`).join('') || '<li class="muted small" style="padding:12px">No match</li>';
    list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  };
  const run = (i) => { const c = items[i]; if (!c) return; close(); c.run(); };
  input.addEventListener('input', () => { sel = 0; draw(); });
  wrap.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % items.length; draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + items.length) % items.length; draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); run(sel); }
  });
  list.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) run(Number(b.dataset.i)); });
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
  draw(); input.focus();
}
// Theme: explicit light, explicit dark, or follow the system. Stored per browser.
function currentThemePref() { try { return localStorage.getItem('ruko_theme') || 'system'; } catch { return 'system'; } }
export function setTheme(pref) {
  const r = document.documentElement;
  if (pref === 'light' || pref === 'dark') r.dataset.theme = pref; else delete r.dataset.theme;
  try { localStorage.setItem('ruko_theme', pref); } catch {}
  const dark = pref === 'dark' || (pref === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0a0e16' : '#f5f3ee');
  const b = $('#themeBtn');
  if (b) {
    const name = { light: 'Light', dark: 'Dark', system: 'Auto (follows your device)' }[pref] || 'Auto';
    b.innerHTML = icon(pref === 'light' ? 'sun' : pref === 'dark' ? 'moon' : 'monitor');
    b.title = `Theme: ${name}. Click to change.`; b.setAttribute('aria-label', `Theme: ${name}. Click to change.`);
  }
}
const THEME_ORDER = ['light', 'dark', 'system'];
$$('[data-lang]').forEach((b) => b.addEventListener('click', () => { setLang(b.dataset.lang); render(); }));
$('#themeBtn').addEventListener('click', () => setTheme(THEME_ORDER[(THEME_ORDER.indexOf(currentThemePref()) + 1) % THEME_ORDER.length]));
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (currentThemePref() === 'system') setTheme('system'); });
$('#tourBtn').addEventListener('click', () => startTour());
$('#palBtn').addEventListener('click', openPalette);
window.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); } });
if (!STATIC) window.addEventListener('hashchange', render);
const drawSound = () => { const b = $('#soundBtn'); b.innerHTML = icon(sound.on ? 'volume' : 'volumeOff'); b.setAttribute('aria-pressed', sound.on); b.setAttribute('aria-label', sound.on ? 'Sound on: click to mute' : 'Sound off: click to turn on'); b.title = sound.on ? 'Voices and call audio: on' : 'Voices and call audio: off'; };
$('#soundBtn').addEventListener('click', () => { sound.on = !sound.on; });
// Larger text: older customers are the people Ruko protects. Scales the content area only.
const drawText = () => { const on = document.documentElement.classList.contains('big-text'); const b = $('#textBtn'); b.setAttribute('aria-pressed', on); b.classList.toggle('on', on); b.title = on ? 'Larger text: on' : 'Larger text (for older customers)'; };
$('#textBtn').addEventListener('click', () => { const on = document.documentElement.classList.toggle('big-text'); try { localStorage.setItem('ruko_bigtext', on ? '1' : '0'); } catch {} drawText(); });
drawText();
onSoundChange(drawSound);
hydrateIcons();
drawSound();
setTheme(currentThemePref());
setLang(state.lang);
await refreshConfig();
render();
