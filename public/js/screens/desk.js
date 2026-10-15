import { get, post } from '../api.js';
import { $, esc, inr, dt, outcomePill, toast, mocked, pageHead, emptyState, statusPill, STAGE } from '../ui.js';
import { go } from '../main.js';
import { icon } from '../icons.js';

export async function render(el, [caseId]) {
  const cases = await get('/cases');
  if (!caseId) {
    const held = cases.filter((c) => c.paymentStatus === 'held');
    const lost = cases.filter((c) => c.paymentStatus === 'sent' && c.overridden);
    const FILTERS = [['', 'All', cases.length], ['escalated', 'Escalated', cases.filter((c) => c.queue === 'escalated').length], ['held', 'On hold', held.length], ['lost', 'Sent after warning', lost.length], ['closed', 'Closed', cases.filter((c) => ['cancelled', 'sent'].includes(c.paymentStatus) && !c.overridden).length]];
    el.innerHTML = `
      ${pageHead({ eyebrow: 'Bank staff', title: 'Fraud Desk', desc: "Every hold and escalation lands here with Ruko's reasoning, the transcript and the evidence.", actions: '<input id="q" type="search" placeholder="Search name or case" aria-label="Search cases" style="width:240px">' })}
      <section class="stats-band desk-kpis">
        <div><div class="num">${cases.length}</div><div class="lbl">Cases</div></div>
        <div><div class="num" style="color:var(--bad)">${cases.filter((c) => c.queue === 'escalated').length}</div><div class="lbl">Escalated to the desk</div></div>
        <div><div class="num" style="color:var(--warn)">${held.length}</div><div class="lbl">Payments on hold</div></div>
        <div><div class="num">${inr(held.reduce((s, c) => s + (c.amountINR || 0), 0))}</div><div class="lbl">Money on hold</div></div>
      </section>
      <div class="seg" role="radiogroup" aria-label="Filter cases" id="f" style="margin:var(--s5) 0 var(--s3)">${FILTERS.map(([k, l, n]) => `<button type="button" role="radio" data-k="${k}" class="${k ? '' : 'on'}" aria-checked="${!k}">${l} <span class="muted">${n}</span></button>`).join('')}</div>
      ${cases.length ? `<div class="tablewrap"><table class="t" id="tbl"><thead><tr><th>Case</th><th>Customer</th><th>Amount</th><th>Ruko's decision</th><th title="Risk score from the interview. 9 or more means hold.">Risk</th><th>Status</th><th>Step</th></tr></thead><tbody>
        ${cases.map((c) => {
          const k = [c.queue === 'escalated' && 'escalated', c.paymentStatus === 'held' && 'held', c.paymentStatus === 'sent' && c.overridden && 'lost', ['cancelled', 'sent'].includes(c.paymentStatus) && !c.overridden && 'closed'].filter(Boolean).join(' ');
          return `<tr class="click" tabindex="0" data-id="${c.id}" data-k="${k}" data-s="${esc(`${c.id} ${c.name}`.toLowerCase())}"><td class="mono" style="white-space:nowrap">${c.id}<div class="tiny muted">${dt(c.createdAt)}</div></td><td><b style="font-weight:600">${esc(c.name)}</b>${c.door === 'frozen_holder' ? '<div class="tiny muted">Frozen account holder</div>' : ''}</td><td>${c.amountINR ? inr(c.amountINR) : '<span class="muted">—</span>'}</td><td>${c.outcome ? outcomePill(c.outcome) : c.riskTier != null ? `<span class="pill ${c.riskTier >= 4 ? 'bad' : c.riskTier >= 2 ? 'warn' : 'ok'}">T${c.riskTier} · ${esc(c.riskName)}</span>` : '<span class="muted small">No check</span>'}</td><td>${c.score ?? '<span class="muted">—</span>'}</td><td>${statusPill(c)}</td><td class="small">${esc(STAGE[c.stage] || c.stage)}</td></tr>`;
        }).join('')}
      </tbody></table></div>` : emptyState({ ic: 'desk', title: 'No cases yet', body: 'When Ruko holds or escalates a payment, the case shows up here with the reasoning and the evidence.', actions: '<a class="btn primary" href="#/">Run a scenario</a>' })}`;
    const rows = [...el.querySelectorAll('#tbl tbody tr')];
    let k = '', q = '';
    const apply = () => rows.forEach((r) => { r.style.display = (!k || r.dataset.k.split(' ').includes(k)) && (!q || r.dataset.s.includes(q)) ? '' : 'none'; });
    rows.forEach((r) => { r.addEventListener('click', () => go(`#/desk/${r.dataset.id}`)); r.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(`#/desk/${r.dataset.id}`); }); });
    el.querySelectorAll('#f [data-k]').forEach((b) => b.addEventListener('click', () => { k = b.dataset.k; el.querySelectorAll('#f [data-k]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); }); apply(); }));
    $('#q', el).addEventListener('input', (e) => { q = e.target.value.trim().toLowerCase(); apply(); });
    return;
  }
  let c = await get(`/cases/${caseId}`);
  const draw = () => {
    const iv = c.interview;
    el.innerHTML = `
      <div class="row between" style="margin-bottom:14px"><div><a href="#/desk" class="small">← All cases</a><h2 style="margin:4px 0 0">${esc(c.customer.name)} <span class="mono muted small">${c.id}</span></h2>
        <div class="row small muted">${c.customer.age} yrs · ${esc(c.customer.city)} · A/c ${esc(c.customer.accountMasked)} · ${outcomePill(iv?.outcome)} ${c.hold ? `<span class="pill ${c.hold.status === 'active' ? 'bad' : ''}">hold: ${esc(c.hold.status)}</span>` : ''}</div></div>
        <div class="row"><a class="btn" href="#/officer/${c.id}">Officer view</a>${c.door !== 'frozen_holder' && c.source !== 'simulator' ? `<a class="btn" href="#/bank/${c.id}">Customer app</a>` : ''}<a class="btn" href="#/case/${c.id}/${c.artefacts.length ? 6 : 1}">Case file</a></div></div>
      <div class="grid" style="grid-template-columns:minmax(0,1.4fr) minmax(0,1fr)">
        <div class="stack">
          ${c.payment ? `<div class="card"><h3>Payment</h3><div class="grid g3"><div><div class="tiny muted">Amount</div><b>${inr(c.payment.amountINR)}</b> <span class="small">${esc(c.payment.rail)}</span></div><div><div class="tiny muted">Payee</div><b>${esc(c.payment.payeeName)}</b><div class="mono">${esc(c.payment.payeeAccount)}</div></div><div><div class="tiny muted">Status</div><b>${esc(c.paymentStatus)}</b>${c.hold ? `<div class="tiny muted">until ${dt(c.hold.until)}</div>` : ''}</div></div>
            ${c.trigger ? `<div class="group-h">Trigger</div>${c.trigger.reasons.map((r) => `<span class="pill" style="margin:0 6px 6px 0">${esc(r.text)}</span>`).join('') || 'none'}` : ''}</div>` : ''}
          ${iv ? `<div class="card"><h3>Interview transcript</h3><div class="stack">${iv.turns.map((m) => `<div class="small"><b style="color:${m.role === 'ruko' ? 'var(--accent)' : 'var(--text)'}">${m.role === 'ruko' ? 'Ruko' : esc(c.customer.name.split(' ')[0])}:</b> ${esc(m.text)}${m.latencyMs ? ` <span class="tiny muted">(${(m.latencyMs / 1000).toFixed(1)} s)</span>` : ''}${(m.attached || []).length ? ` <span class="pill">${icon('clip', { size: 12 })}${m.attached.length}</span>` : ''}</div>`).join('')}</div></div>` : ''}
          ${c.evidence.length ? `<div class="card"><h3>Evidence</h3><div class="ev-grid">${c.evidence.map((e) => `<a class="ev-tile" href="${e.url}" target="_blank" rel="noopener"><img src="${e.url}" alt="${esc(e.title)}"><div class="cap">${esc(e.title)}<div class="tiny muted">${e.extraction ? `${e.extraction.added} facts · ${e.extraction.engine}` : 'not read yet'}</div></div></a>`).join('')}</div></div>` : ''}
          <div class="card"><h3>Audit log</h3><div class="tablewrap"><table class="t"><tbody>${c.audit.slice().reverse().map((a) => `<tr><td class="tiny muted" style="white-space:nowrap">${dt(a.at)}</td><td><span class="pill">${esc(a.actor)}</span></td><td class="small"><b>${esc(a.action)}</b> ${esc(a.detail)}</td></tr>`).join('')}</tbody></table></div></div>
        </div>
        <div class="stack">
          <div class="card"><h3>Actions</h3>
            <div class="stack">
              ${c.trustedAdvice ? `<div class="callout ${c.trustedAdvice.verdict === 'scam' ? 'bad' : 'info'}">${icon(c.trustedAdvice.verdict === 'scam' ? 'alert' : 'info')}<span><b>Trusted contact (${esc(c.trustedAdvice.by)}, ${esc(c.trustedAdvice.relation)}):</b> ${c.trustedAdvice.verdict === 'scam' ? 'says this is a scam.' : 'says they know about this payment.'} The decision stays with the customer.</span></div>` : ''}
              ${c.complaint ? `<div class="callout info">${icon('check')}<span><b>1930 / NCRP complaint filed</b> by the customer from ReturnPath. Acknowledgement <span class="mono">${esc(c.complaint.ack)}</span>.</span></div>` : ''}
              ${c.paymentStatus === 'stopped' ? `<div class="callout ok">${icon('shieldCheck')}<span><b>Stopped by the bank</b> before any money left.</span></div>` : ''}
              ${c.paymentStatus === 'cancelled' ? `<div class="callout ok">${icon('shieldCheck')}<span><b>The customer cancelled the payment</b> in their app. The money stayed in the account.</span></div>` : ''}
              ${c.hold?.status === 'active' ? `<button class="btn primary" data-a="call" type="button">${icon('phone', { size: 15 })}Log call to customer ${mocked()}</button><button class="btn" data-a="extend" type="button">Extend hold 24 h</button><button class="btn" data-a="confirm_scam" type="button">Confirm scam (keep hold)</button><button class="btn danger" data-a="release" type="button">Release payment</button>` : '<p class="small muted">No active hold.</p>'}
              <a class="btn" href="#/case/${c.id}/6">Draft 1930 / cybercrime.gov.in complaint</a>
            </div>
            ${(c.desk?.calls || []).map((x) => `<div class="tiny muted" style="margin-top:6px">${icon('phone', { size: 12 })} ${dt(x.at)}: ${esc(x.note)}</div>`).join('')}
          </div>
          ${!iv?.decision && c.risk ? `<div class="card"><h3>Why Ruko decided this</h3><div class="row between small"><span class="pill ${c.risk.tier >= 4 ? 'bad' : 'warn'}">T${c.risk.tier} · ${esc(c.risk.name)}</span><span>Risk score <b>${c.risk.score}</b></span></div>
            <table class="t" style="margin-top:8px"><tbody>${c.risk.reasons.slice(0, 7).map((x) => `<tr><td class="small">${esc(x.label)}</td><td style="text-align:right;font-weight:700;color:${x.points > 0 ? 'var(--bad)' : 'var(--ok)'}">${x.points > 0 ? '+' : ''}${x.points}</td></tr>`).join('')}</tbody></table>
            ${(c.risk.patterns || []).map((pt) => `<div class="small" style="margin-top:6px"><b>${esc(pt.name)}</b> · ${Math.round(pt.confidence * 100)}% <span class="tiny muted">${esc(pt.evidence?.join(', ') || '')}</span></div>`).join('')}</div>` : ''}
          ${iv?.decision ? `<div class="card"><h3>Why the agent decided this</h3><div class="row between small"><span>Risk score</span><b>${iv.decision.score}</b></div>
            <table class="t" style="margin-top:8px"><tbody>${iv.decision.contributions.map((x) => `<tr><td class="small">${esc(x.label)}${x.quote ? `<div class="tiny muted"><i>“${esc(String(x.quote).slice(0, 140))}”</i></div>` : ''}</td><td style="text-align:right;font-weight:700;color:${x.points > 0 ? 'var(--bad)' : 'var(--ok)'}">${x.points > 0 ? '+' : ''}${x.points}</td></tr>`).join('')}</tbody></table>
            ${(iv.scriptMatches || []).length ? `<div class="group-h">Script matches</div>${iv.scriptMatches.map((s) => `<div class="small"><b>${esc(s.scriptId)}</b> ${esc(s.name)}<div class="tiny muted">source: ${esc(s.source)}</div></div>`).join('')}` : ''}</div>` : ''}
          ${c.notifications.length ? `<div class="card"><h3>Trusted contact ${mocked()}</h3>${c.notifications.map((n) => `<div class="small"><b>${esc(n.to.name)}</b> (${esc(n.to.relation)}) · ${dt(n.at)}<div class="muted">${esc(n.text)}</div></div>`).join('')}</div>` : ''}
          ${c.artefacts.length ? `<div class="card"><h3>Documents</h3>${c.artefacts.map((a) => `<div class="row between small" style="padding:6px 0;border-bottom:1px dashed var(--border)"><span>${esc(a.kind)}</span><span class="row"><span class="pill ${a.status === 'approved' ? 'ok' : a.status === 'blocked' ? 'bad' : 'warn'}">${a.status}</span>${a.status === 'draft' ? `<button class="btn sm" data-approve="${a.kind}" type="button">Approve</button>` : ''}</span></div>`).join('')}</div>` : ''}
        </div>
      </div>`;
    el.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', async () => { c = await post(`/cases/${c.id}/desk`, { action: b.dataset.a }); toast(`Done: ${b.dataset.a}`); draw(); }));
    el.querySelectorAll('[data-approve]').forEach((b) => b.addEventListener('click', async () => { c = await post(`/cases/${c.id}/desk`, { action: 'approve_artefact', kind: b.dataset.approve }); draw(); }));
  };
  draw();
}
