import { icon } from './icons.js';
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const inr = (n) => (n == null || n === '' ? '—' : '₹' + Number(n).toLocaleString('en-IN'));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const time = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '');
export const dt = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

let toastTimer;
export function toast(msg, ms = 2600) {
  let el = $('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = msg; el.classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.add('hidden'), ms);
}

export const OUTCOME = {
  proceed: { en: 'Proceed', hi: 'आगे बढ़ें', cls: 'ok', ic: '✓' },
  proceed_with_warning: { en: 'Proceed with warning', hi: 'चेतावनी के साथ आगे', cls: 'warn', ic: '!' },
  hold_trusted_contact: { en: 'Hold + trusted contact', hi: 'रोका गया + भरोसेमंद व्यक्ति', cls: 'bad', ic: '⏸' },
  escalate: { en: 'Hold + fraud desk', hi: 'रोका गया + फ़्रॉड डेस्क', cls: 'bad', ic: '⛔' },
};
const OIC = { proceed: 'check', proceed_with_warning: 'alert', hold_trusted_contact: 'pause', escalate: 'stop' };
export const outcomePill = (o, lang = 'en') => (o ? `<span class="pill ${OUTCOME[o].cls}">${icon(OIC[o], { size: 13 })}${OUTCOME[o][lang] || OUTCOME[o].en}</span>` : '<span class="pill">—</span>');
export const mocked = (label = 'Mocked') => `<span class="mocked" title="This part is simulated for the demo">${icon('flag', { size: 10 })}${label}</span>`;

export function download(name, text, type = 'text/plain') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function fileToDataUrl(file) {
  return new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = bad; r.readAsDataURL(file); });
}
