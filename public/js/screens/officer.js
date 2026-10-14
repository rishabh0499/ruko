import { get } from '../api.js';
import { esc, inr, mocked } from '../ui.js';
import { go } from '../main.js';
import { icon } from '../icons.js';

export async function render(el, [caseId]) {
  caseId = caseId || localStorage.getItem('ruko_case');
  const c = caseId ? await get(`/cases/${caseId}`).catch(() => null) : null;
  if (!c) { el.innerHTML = '<div class="card"><h2>Officer View</h2><p class="muted">Open a case first (Demo Hub → a scenario).</p></div>'; return; }
  const conf = c.facts.filter((f) => f.state === 'confirmed');
  const claims = conf.filter((f) => f.group === 'claim');
  el.innerHTML = `
    <div class="callout warn" style="margin-bottom:16px">${icon('badge')}<span><b>Read-only view for a cyber-cell investigating officer.</b> ${mocked('Demo only')} In production this would sit behind police authentication. No edit controls.</span></div>
    <div class="row between"><div><h2 style="margin:0">Case ${c.id}</h2><div class="small muted">${esc(c.customer.name)}, ${c.customer.age} · ${esc(c.customer.city)} · ${c.door === 'frozen_holder' ? 'Bona fide account holder (frozen)' : 'Victim of official impersonation'}</div></div>
      <div style="min-width:220px"><div class="row between small"><span>Completeness</span><b>${c.statusLine.completeness}%</b></div><div class="meter"><div style="width:${c.statusLine.completeness}%;background:var(--ok)"></div></div></div></div>
    <div class="grid g2" style="margin-top:18px">
      <div class="card"><h3>Summary</h3><p class="small">${esc(c.story || 'No statement yet.')}</p>
        ${claims.length ? `<div class="group-h">Suspect identifiers</div>${claims.map((f) => `<div class="row between small" style="border-bottom:1px dashed var(--border);padding:6px 0"><span class="muted">${esc(f.type.replace(/_/g, ' '))}</span><b>${esc(f.value)}</b></div>`).join('')}` : ''}</div>
      <div class="card"><h3>${c.door === 'frozen_holder' ? 'Freeze' : 'Money trail'}</h3>
        ${c.moneyTrail ? c.moneyTrail.legs.map((l) => `<div style="padding:8px 0;border-bottom:1px dashed var(--border)"><b>${inr(l.amountINR)}</b> → <span class="mono">${esc(l.to)}</span> ${l.toName ? esc(l.toName) : ''}<div class="tiny muted">${esc(l.date || '')} · UTR ${esc(l.utr || 'missing')} · ${l.confirmed ? 'confirmed' : 'gap'}${l.flagged ? ' · reported account' : ''}</div><div class="tiny">Next decision: receiving bank (lien) · cyber cell (trace onward) · magistrate (release)</div></div>`).join('') + `<div class="small" style="margin-top:8px">Total ${inr(c.moneyTrail.totals.lost)} · traced ${inr(c.moneyTrail.totals.traced)}</div>`
          : c.frozen ? `<div class="small">Frozen ${inr(c.frozen.frozenINR)} · disputed ${inr(c.frozen.disputedINR)} · excess ${inr(c.frozen.excessINR)}</div>` : '<p class="small muted">Not built yet.</p>'}</div>
    </div>
    <div class="card" style="margin-top:16px"><h3>Evidence annexure</h3>
      ${c.artefacts.find((a) => a.kind === 'cyber_cell_annexure') ? `<div class="doc">${esc(c.artefacts.find((a) => a.kind === 'cyber_cell_annexure').body)}</div>` : `<div class="ev-grid">${c.evidence.map((e) => `<div class="ev-tile"><img src="${e.url}" alt="${esc(e.title)}"><div class="cap">${esc(e.title)}</div></div>`).join('') || '<p class="muted small">No evidence yet.</p>'}</div>`}
    </div>`;
}
