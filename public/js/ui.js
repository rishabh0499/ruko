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
// Where a case stands, in words a person uses (rows from GET /api/cases).
export function caseStatus(c, lang = 'en') {
  const hi = lang === 'hi';
  const S = (en, h, tone) => ({ label: hi ? h : en, tone });
  if (c.door === 'frozen_holder') return c.docs ? S('Release papers drafted', 'रिलीज़ के कागज़ तैयार', 'info') : S('Frozen account: building the case', 'फ़्रीज़ खाता: केस बन रहा है', 'info');
  if (c.paymentStatus === 'cancelled') return S('Cancelled by the customer', 'ग्राहक ने रद्द किया', 'ok');
  if (c.paymentStatus === 'held') return S('On hold (24 h)', 'रोका गया (24 घंटे)', 'warn');
  if (c.paymentStatus === 'pending_check') return S('Ruko is checking', 'Ruko जाँच रहा है', 'warn');
  if (c.paymentStatus === 'sent' && c.overridden) return S('Sent after a warning', 'चेतावनी के बाद भेजा', 'bad');
  if (c.paymentStatus === 'sent' && c.holdStatus === 'released') return S('Released by the bank', 'बैंक ने छोड़ा', '');
  if (c.paymentStatus === 'sent') return S('Paid', 'भेजा गया', 'ok');
  return S('Not paid yet', 'अभी भेजा नहीं', '');
}
export const statusPill = (c, lang) => { const s = caseStatus(c, lang); return `<span class="pill ${s.tone}">${s.label}</span>`; };
export const STAGE = { new: 'Started', interview: 'Ruko check', held: 'On hold', paid: 'Paid', cancelled: 'Cancelled', overridden: 'Sent anyway', evidence: 'Adding evidence', facts: 'Checking facts', trail: 'Money trail built', artefacts: 'Case file ready' };

// One header pattern for every screen: eyebrow, title, one line of context, actions on the right.
export const pageHead = ({ eyebrow = '', title, desc = '', actions = '' }) =>
  `<header class="page-head"><div>${eyebrow ? `<div class="eyebrow">${eyebrow}</div>` : ''}<h1>${title}</h1>${desc ? `<p>${desc}</p>` : ''}</div>${actions ? `<div class="actions">${actions}</div>` : ''}</header>`;
// Empty states say what the screen is for and offer the next step.
export const emptyState = ({ ic = 'info', title, body = '', actions = '', steps = [] }) =>
  `<section class="empty"><div class="ic-wrap">${icon(ic, { size: 26 })}</div><h2>${title}</h2>${body ? `<p>${body}</p>` : ''}${actions ? `<div class="row">${actions}</div>` : ''}${steps.length ? `<ol class="steps">${steps.map((s, i) => `<li><b>${i + 1}</b>${s}</li>`).join('')}</ol>` : ''}</section>`;
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
