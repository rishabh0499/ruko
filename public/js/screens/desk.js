import { get, post } from '../api.js';
import { $, esc, inr, dt, outcomePill, toast, mocked } from '../ui.js';
import { go } from '../main.js';
import { icon } from '../icons.js';

export async function render(el, [caseId]) {
  const cases = await get('/cases');
  if (!caseId) {
    const open = cases.filter((c) => c.queue);
    el.innerHTML = `
      <div class="row between" style="margin-bottom:16px"><div><h2 style="margin:0">Fraud Desk</h2><div class="small muted">Bank staff console. Every hold and escalation lands here with the agent's reasoning.</div></div><div class="row"><select id="f" style="width:auto"><option value="">All cases</option><option value="escalated">Escalated</option><option value="held">Held</option><option value="sent">Sent / closed</option></select></div></div>
      <div class="grid g4" style="margin-bottom:18px">
        <div class="card kpi"><div class="num">${cases.length}</div><div class="lbl">Cases</div></div>
        <div class="card kpi"><div class="num" style="color:var(--bad)">${cases.filter((c) => c.queue === 'escalated').length}</div><div class="lbl">Escalated</div></div>
        <div class="card kpi"><div class="num" style="color:var(--warn)">${cases.filter((c) => c.paymentStatus === 'held').length}</div><div class="lbl">Payments on hold</div></div>
        <div class="card kpi"><div class="num">${inr(cases.filter((c) => c.paymentStatus === 'held').reduce((s, c) => s + (c.amountINR || 0), 0))}</div><div class="lbl">Value on hold</div></div>
      </div>
      <div class="tablewrap"><table class="t" id="tbl"><thead><tr><th>Case</th><th>Customer</th><th>Amount</th><th>Outcome</th><th>Score</th><th>Payment</th><th>Stage</th></tr></thead><tbody>
        ${cases.map((c) => `<tr class="click" data-id="${c.id}" data-q="${c.queue || ''}" data-p="${c.paymentStatus}"><td class="mono">${c.id}<div class="tiny muted">${dt(c.createdAt)}</div></td><td>${esc(c.name)}${c.door === 'frozen_holder' ? ' <span class="pill info">frozen-holder</span>' : ''}</td><td>${inr(c.amountINR)}</td><td>${outcomePill(c.outcome)}</td><td>${c.score ?? '—'}</td><td>${esc(c.paymentStatus)}</td><td>${esc(c.stage)}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">No cases yet. Run a scenario from the Demo Hub.</td></tr>'}
      </tbody></table></div>`;
    el.querySelectorAll('[data-id]').forEach((r) => r.addEventListener('click', () => go(`#/desk/${r.dataset.id}`)));
    $('#f', el).addEventListener('change', (e) => { const v = e.target.value; el.querySelectorAll('#tbl tbody tr').forEach((r) => { r.style.display = !v || r.dataset.q === v || (v === 'sent' && r.dataset.p === 'sent') ? '' : 'none'; }); });
    return;
  }
  let c = await get(`/cases/${caseId}`);
  const draw = () => {
    const iv = c.interview;
    el.innerHTML = `
      <div class="row between" style="margin-bottom:14px"><div><a href="#/desk" class="small">← All cases</a><h2 style="margin:4px 0 0">${esc(c.customer.name)} <span class="mono muted small">${c.id}</span></h2>
        <div class="row small muted">${c.customer.age} yrs · ${esc(c.customer.city)} · A/c ${esc(c.customer.accountMasked)} · ${outcomePill(iv?.outcome)} ${c.hold ? `<span class="pill ${c.hold.status === 'active' ? 'bad' : ''}">hold: ${esc(c.hold.status)}</span>` : ''}</div></div>
        <div class="row"><a class="btn" href="#/officer/${c.id}">Officer view</a>${c.door !== 'frozen_holder' ? `<a class="btn" href="#/bank/${c.id}">Customer app</a>` : ''}<a class="btn" href="#/case/${c.id}/${c.artefacts.length ? 6 : 1}">Case file</a></div></div>
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
              ${c.paymentStatus === 'cancelled' ? `<div class="callout ok">${icon('shieldCheck')}<span><b>The customer cancelled the payment</b> in their app. The money stayed in the account.</span></div>` : ''}
              ${c.hold?.status === 'active' ? `<button class="btn primary" data-a="call" type="button">${icon('phone', { size: 15 })}Log call to customer ${mocked()}</button><button class="btn" data-a="extend" type="button">Extend hold 24 h</button><button class="btn" data-a="confirm_scam" type="button">Confirm scam (keep hold)</button><button class="btn danger" data-a="release" type="button">Release payment</button>` : '<p class="small muted">No active hold.</p>'}
              <a class="btn" href="#/case/${c.id}/6">Draft 1930 / cybercrime.gov.in complaint</a>
            </div>
            ${(c.desk?.calls || []).map((x) => `<div class="tiny muted" style="margin-top:6px">${icon('phone', { size: 12 })} ${dt(x.at)}: ${esc(x.note)}</div>`).join('')}
          </div>
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
