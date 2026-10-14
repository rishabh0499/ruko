import { get } from '../api.js';
import { $, esc, inr, dt, outcomePill, mocked } from '../ui.js';
import { go } from '../main.js';
import { icon } from '../icons.js';

// Read-only console for a cyber-cell investigating officer: every case first (what happened,
// how, and what the police can act on), then one case in detail. No edit controls.

// Where a case stands from the police side. "resolved" means no police action is pending.
export function result(c) {
  if (c.door === 'frozen_holder') return c.docs ? { k: 'frozen', tone: 'info', label: 'Frozen holder: release papers drafted', next: 'Verify the bona fide trail; respond to the release application' } : { k: 'frozen', tone: 'info', label: 'Frozen holder: papers in progress', next: 'Wait for the account holder\'s documents' };
  if (c.paymentStatus === 'cancelled') return { k: 'prevented', tone: 'ok', resolved: true, label: 'Prevented: customer cancelled', next: 'None. Optional: add the payee to the suspect registry' };
  if (c.paymentStatus === 'held') return { k: 'prevented', tone: 'ok', resolved: true, label: 'Prevented: payment on hold', next: 'None while the hold lasts; the bank desk is on it' };
  if (c.paymentStatus === 'sent' && (c.overridden || c.lostINR)) return c.annexure ? { k: 'lost', tone: 'bad', label: 'Money lost: annexure ready', next: 'Request a lien on the receiving account; trace onward transfers' } : { k: 'lost', tone: 'bad', label: 'Money lost: complaint in progress', next: 'Victim is building the case file; 1930 complaint pending' };
  if (c.paymentStatus === 'sent' && c.holdStatus === 'released') return { k: 'closed', tone: '', resolved: true, label: 'Released after bank review', next: 'None' };
  if (c.paymentStatus === 'sent') return { k: 'closed', tone: '', resolved: true, label: 'Legitimate payment, no offence', next: 'None' };
  return { k: 'open', tone: 'warn', label: 'Ruko check in progress', next: 'Wait for the interview to finish' };
}
const pill = (r) => `<span class="pill ${r.tone}">${esc(r.label)}</span>`;
const chain = (steps) => (steps.length ? `<div class="journey">${steps.map((s) => `<span>${esc(s)}</span>`).join(`<i aria-hidden="true">${icon('chevronRight', { size: 11 })}</i>`)}</div>` : '<span class="tiny muted">Not started</span>');
const banner = `<div class="callout warn" style="margin-bottom:16px">${icon('badge')}<span><b>Read-only view for a cyber-cell investigating officer.</b> ${mocked('Demo only')} In production this sits behind police authentication, and every view is logged. No edit controls.</span></div>`;

export async function render(el, [caseId]) {
  if (!caseId) return renderList(el);
  const c = await get(`/cases/${caseId}`).catch(() => null);
  if (!c) { el.innerHTML = `${banner}<div class="card"><p class="muted">Case ${esc(caseId)} not found. <a href="#/officer">All cases</a></p></div>`; return; }
  const row = (await get('/cases')).find((x) => x.id === c.id);
  renderCase(el, c, row);
}

async function renderList(el) {
  const cases = (await get('/cases')).map((c) => ({ ...c, r: result(c) }));
  const by = (k) => cases.filter((c) => c.r.k === k);
  const sum = (arr, f) => arr.reduce((s, c) => s + (f(c) || 0), 0);
  const prevented = by('prevented'), lost = by('lost'), frozen = by('frozen');
  const resolved = cases.filter((c) => c.r.resolved).length;
  el.innerHTML = `
    ${banner}
    <div class="row between" style="margin-bottom:16px;align-items:flex-end"><div><div class="eyebrow">Police</div><h2 style="margin:4px 0 0">Officer View</h2><div class="small muted">Every case Ruko opened: what happened, how it happened, and what the police can act on.</div></div>
      <div class="row"><input id="q" type="search" placeholder="Search case, name, city" aria-label="Search cases" style="width:220px"></div></div>
    <section class="stats-band officer-kpis">
      <div><div class="num">${cases.length}</div><div class="lbl">Cases · ${resolved} need no police action</div></div>
      <div><div class="num" style="color:var(--ok)">${prevented.length}</div><div class="lbl">Prevented · ${inr(sum(prevented, (c) => c.amountINR))} kept</div></div>
      <div><div class="num" style="color:var(--bad)">${lost.length}</div><div class="lbl">Money lost · ${inr(sum(lost, (c) => c.lostINR || c.amountINR))}${sum(lost, (c) => c.tracedINR) ? ` · ${inr(sum(lost, (c) => c.tracedINR))} traced` : ''}</div></div>
      <div><div class="num" style="color:var(--info)">${frozen.length}</div><div class="lbl">Frozen-account holders${sum(frozen, (c) => c.frozenINR) ? ` · ${inr(sum(frozen, (c) => c.frozenINR))} frozen` : ''}</div></div>
      <div><div class="num">${cases.filter((c) => c.annexure).length}</div><div class="lbl">Evidence annexures ready</div></div>
    </section>
    <div class="seg" role="radiogroup" aria-label="Filter cases" id="f" style="margin:18px 0 12px">
      ${[['', 'All', cases.length], ['lost', 'Money lost', lost.length], ['prevented', 'Prevented', prevented.length], ['frozen', 'Frozen holder', frozen.length], ['closed', 'Closed', by('closed').length], ['open', 'In progress', by('open').length]]
        .map(([k, l, n]) => `<button type="button" role="radio" data-k="${k}" class="${k ? '' : 'on'}" aria-checked="${!k}">${l} <span class="muted">${n}</span></button>`).join('')}
    </div>
    <div class="tablewrap"><table class="t" id="tbl"><thead><tr><th>Case</th><th>Person</th><th>Amount</th><th>Result</th><th>How it happened</th><th>Police action</th><th>Evidence</th></tr></thead><tbody>
      ${cases.map((c) => `<tr class="click" tabindex="0" data-id="${c.id}" data-k="${c.r.k}" data-s="${esc(`${c.id} ${c.name} ${c.city}`.toLowerCase())}">
        <td class="mono" style="white-space:nowrap">${c.id}<div class="tiny muted">${dt(c.createdAt)}</div></td>
        <td>${esc(c.name)}<div class="tiny muted">${c.age} · ${esc(c.city)} · ${c.door === 'frozen_holder' ? 'account holder' : 'payer'}</div></td>
        <td>${inr(c.door === 'frozen_holder' ? c.frozenINR : c.amountINR)}${c.r.k === 'lost' ? `<div class="tiny" style="color:var(--bad)">lost ${inr(c.lostINR || c.amountINR)}</div>` : ''}</td>
        <td>${pill(c.r)}${c.outcome ? `<div style="margin-top:4px">${outcomePill(c.outcome)}</div>` : ''}</td>
        <td>${chain(c.journey)}</td>
        <td class="small">${esc(c.r.next)}</td>
        <td class="small">${c.evidence} file${c.evidence === 1 ? '' : 's'}${c.suspects ? ` · ${c.suspects} suspect ID${c.suspects === 1 ? '' : 's'}` : ''}${c.annexure ? `<div><span class="pill ok">${icon('check', { size: 12 })}annexure</span></div>` : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">No cases yet. Run a scenario from the Demo Hub.</td></tr>'}
    </tbody></table></div>`;
  const rows = [...el.querySelectorAll('#tbl tbody tr[data-id]')];
  let k = '', q = '';
  const apply = () => rows.forEach((r) => { r.style.display = (!k || r.dataset.k === k) && (!q || r.dataset.s.includes(q)) ? '' : 'none'; });
  rows.forEach((r) => { r.addEventListener('click', () => go(`#/officer/${r.dataset.id}`)); r.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(`#/officer/${r.dataset.id}`); }); });
  el.querySelectorAll('#f [data-k]').forEach((b) => b.addEventListener('click', () => { k = b.dataset.k; el.querySelectorAll('#f [data-k]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); }); apply(); }));
  $('#q', el).addEventListener('input', (e) => { q = e.target.value.trim().toLowerCase(); apply(); });
}

function renderCase(el, c, row) {
  const r = result(row || { door: c.door, paymentStatus: c.paymentStatus, docs: c.artefacts.length });
  const iv = c.interview;
  const conf = c.facts.filter((f) => f.state === 'confirmed');
  const claims = conf.filter((f) => f.group === 'claim');
  const annex = c.artefacts.find((a) => a.kind === 'cyber_cell_annexure');
  const lost = r.k === 'lost' ? (c.moneyTrail?.totals?.lost || c.payment?.amountINR) : null, traced = c.moneyTrail?.totals?.traced;
  const kept = r.k === 'prevented' ? c.payment?.amountINR : null;
  el.innerHTML = `
    ${banner}
    <div class="row between" style="margin-bottom:14px;align-items:flex-end"><div><a href="#/officer" class="small">${icon('arrowLeft', { size: 13 })} All cases</a>
      <h2 style="margin:4px 0 0">${esc(c.customer.name)} <span class="mono muted small">${c.id}</span></h2>
      <div class="row small muted" style="flex-wrap:wrap">${c.customer.age} yrs · ${esc(c.customer.city)} · A/c ${esc(c.customer.accountMasked)} · ${c.door === 'frozen_holder' ? 'Bona fide account holder (frozen)' : r.k === 'lost' || r.k === 'prevented' ? 'Suspected victim of official impersonation' : 'Payer'} · ${pill(r)}</div></div>
      <div class="row no-print"><a class="btn" href="#/desk/${c.id}">${icon('desk', { size: 15 })}Fraud desk</a><a class="btn" href="#/case/${c.id}/${c.artefacts.length ? 6 : 1}">${icon('file', { size: 15 })}Case file</a><button class="btn" id="print" type="button">${icon('printer', { size: 15 })}Print</button></div></div>

    <section class="stats-band officer-kpis">
      <div><div class="num">${inr(c.door === 'frozen_holder' ? c.frozen?.frozenINR : c.payment?.amountINR)}</div><div class="lbl">${c.door === 'frozen_holder' ? 'Frozen' : 'Payment at stake'}</div></div>
      <div><div class="num" style="color:var(--ok)">${kept ? inr(kept) : '—'}</div><div class="lbl">Kept by the customer</div></div>
      <div><div class="num" style="color:var(--bad)">${lost ? inr(lost) : '—'}</div><div class="lbl">Lost</div></div>
      <div><div class="num">${traced ? inr(traced) : '—'}</div><div class="lbl">Traced to a receiving account</div></div>
      <div><div class="num">${c.statusLine.completeness}%</div><div class="lbl">Case file complete</div></div>
    </section>

    <div class="callout ${r.tone || 'info'}" style="margin-top:16px">${icon(r.k === 'lost' ? 'alert' : r.k === 'prevented' ? 'shieldCheck' : 'info')}<span><b>Police action:</b> ${esc(r.next)}.</span></div>

    <div class="grid officer-grid" style="margin-top:16px">
      <div class="stack">
        <div class="card"><h3>${icon('branch')}How it happened</h3>${row ? chain(row.journey) : ''}
          <ol class="timeline">${c.audit.map((a) => `<li><span class="tiny muted">${dt(a.at)}</span> <span class="pill">${esc(a.actor)}</span> <b class="small">${esc(a.action.replace(/_/g, ' '))}</b>${a.detail ? `<div class="small muted">${esc(a.detail)}</div>` : ''}</li>`).join('')}</ol></div>
        ${c.story ? `<div class="card"><h3>${icon('message')}Statement</h3><p class="small" style="margin:0">${esc(c.story)}</p></div>` : ''}
        ${iv ? `<div class="card"><details><summary><b>${icon('mic', { size: 15 })} Ruko interview transcript</b> <span class="tiny muted">${iv.turns.length} turns · ${iv.lang === 'hi' ? 'Hindi' : 'English'}</span></summary><div class="stack" style="margin-top:10px">${iv.turns.map((m) => `<div class="small"><b style="color:${m.role === 'ruko' ? 'var(--accent)' : 'var(--text)'}">${m.role === 'ruko' ? 'Ruko' : esc(c.customer.name.split(' ')[0])}:</b> ${esc(m.text)}</div>`).join('')}</div></details></div>` : ''}
        <div class="card"><h3>${icon('clip')}Evidence</h3>
          ${c.evidence.length ? `<div class="ev-grid">${c.evidence.map((e) => `<div class="ev-tile"><img src="${e.url}" alt="${esc(e.title)}"><div class="cap">${esc(e.title)}<div class="tiny muted">${e.extraction ? `${e.extraction.added} facts · ${e.extraction.engine}` : 'not read yet'}</div></div></div>`).join('')}</div>` : '<p class="muted small">No evidence yet.</p>'}
          ${annex ? `<div class="group-h">Evidence annexure</div><div class="doc">${esc(annex.body)}</div>` : ''}</div>
      </div>
      <div class="stack">
        <div class="card"><h3>${icon('fingerprint')}Suspect identifiers</h3>
          ${c.payment && c.door !== 'frozen_holder' ? `<div class="row between small" style="border-bottom:1px dashed var(--border);padding:6px 0"><span class="muted">payee</span><b>${esc(c.payment.payeeName)} <span class="mono">${esc(c.payment.payeeAccount)}</span></b></div>` : ''}
          ${claims.map((f) => `<div class="row between small" style="border-bottom:1px dashed var(--border);padding:6px 0"><span class="muted">${esc(f.type.replace(/_/g, ' '))}</span><b>${esc(f.value)}</b></div>`).join('') || '<p class="small muted">None confirmed yet.</p>'}</div>
        <div class="card"><h3>${icon(c.door === 'frozen_holder' ? 'snow' : 'link')}${c.door === 'frozen_holder' ? 'Freeze' : 'Money trail'}</h3>
          ${c.moneyTrail?.legs?.length ? c.moneyTrail.legs.map((l) => `<div style="padding:8px 0;border-bottom:1px dashed var(--border)"><b>${inr(l.amountINR)}</b> → <span class="mono">${esc(l.to)}</span> ${l.toName ? esc(l.toName) : ''}<div class="tiny muted">${esc(l.date || '')} · UTR ${esc(l.utr || 'missing')} · ${l.confirmed ? 'confirmed' : 'gap'}${l.flagged ? ' · reported account' : ''}</div><div class="tiny">Next: receiving bank (lien) · cyber cell (trace onward) · magistrate (release)</div></div>`).join('') + `<div class="small" style="margin-top:8px">Total ${inr(c.moneyTrail.totals.lost)} · traced ${inr(c.moneyTrail.totals.traced)}</div>`
            : c.frozen ? `<div class="small">Frozen ${inr(c.frozen.frozenINR)} · disputed ${inr(c.frozen.disputedINR)} · excess ${inr(c.frozen.excessINR)}</div>` : '<p class="small muted">Not built yet (no money left the account, or the victim has not reached this step).</p>'}</div>
        ${iv?.decision ? `<div class="card"><h3>${icon('shield')}${['hold_trusted_contact', 'escalate'].includes(iv.outcome) ? 'Why Ruko stopped it' : 'Why Ruko let it through'}</h3><div class="row between small"><span>${outcomePill(iv.outcome)}</span><span>Risk score <b>${iv.decision.score}</b></span></div>
          <table class="t" style="margin-top:8px"><tbody>${iv.decision.contributions.slice(0, 6).map((x) => `<tr><td class="small">${esc(x.label)}${x.quote ? `<div class="tiny muted"><i>“${esc(String(x.quote).slice(0, 140))}”</i></div>` : ''}</td><td style="text-align:right;font-weight:700;color:${x.points > 0 ? 'var(--bad)' : 'var(--ok)'}">${x.points > 0 ? '+' : ''}${x.points}</td></tr>`).join('')}</tbody></table>
          ${(iv.scriptMatches || []).length ? `<div class="group-h">Known scam scripts matched</div>${iv.scriptMatches.map((s) => `<div class="small"><b>${esc(s.scriptId)}</b> ${esc(s.name)}<div class="tiny muted">source: ${esc(s.source)}</div></div>`).join('')}` : ''}</div>` : ''}
        ${c.trustedAdvice || c.paymentStatus === 'cancelled' || iv?.overridden ? `<div class="card"><h3>${icon('users')}Trusted contact and the customer's decision</h3><div class="stack small">
          ${c.trustedAdvice ? `<div>${esc(c.trustedAdvice.by)} (${esc(c.trustedAdvice.relation)}): <b>${c.trustedAdvice.verdict === 'scam' ? 'said it is a scam' : 'said they know about this payment'}</b> <span class="tiny muted">${dt(c.trustedAdvice.at)}</span></div>` : ''}
          ${c.paymentStatus === 'cancelled' ? '<div style="color:var(--ok)"><b>Customer cancelled the payment.</b> The money stayed in the account.</div>' : ''}
          ${iv?.overridden ? '<div style="color:var(--bad)"><b>Customer chose "Send anyway"</b> after the warning (possible coercion; Ruko had already captured the case).</div>' : ''}</div></div>` : ''}
        ${c.clocks?.list?.length ? `<div class="card"><h3>${icon('clock')}Deadlines</h3>${c.clocks.list.map((k) => `<div class="row between small" style="border-bottom:1px dashed var(--border);padding:6px 0"><span>${esc(k.label)}${k.value ? `<div class="tiny muted">${esc(k.value)}</div>` : ''}</span><b class="mono">${esc(k.date || '')}</b></div>`).join('')}</div>` : ''}
        <div class="card"><h3>${icon('file')}Documents</h3>${c.artefacts.map((a) => `<div class="row between small" style="padding:6px 0;border-bottom:1px dashed var(--border)"><span>${esc(a.kind.replace(/_/g, ' '))}</span><span class="pill ${a.status === 'approved' ? 'ok' : a.status === 'blocked' ? 'bad' : 'warn'}">${esc(a.status)}</span></div>`).join('') || '<p class="small muted">No documents drafted yet.</p>'}</div>
      </div>
    </div>`;
  $('#print', el).addEventListener('click', () => window.print());
}
