import { get, post } from '../api.js';
import { $, esc, dt, toast } from '../ui.js';
import { icon } from '../icons.js';

const SEV = { critical: 'bad', high: 'bad', medium: 'warn', low: 'info' };
const OUT = { blocked: ['bad', 'stop'], banned: ['bad', 'lock'], 'rate-limited': ['warn', 'clock'], alert: ['warn', 'alert'] };
const ACT = { block: 'Block', ban: 'Block + ban IP', ratelimit: 'Rate-limit', alert: 'Alert only' };

export async function render(el) {
  const sims = await get('/security/sims');
  const results = [];
  el.innerHTML = `
    <div class="rp-head page-head"><div><div class="eyebrow">Platform security</div><h1>IDS / IPS</h1>
      <p class="muted small" style="max-width:760px;margin:6px 0 0">Ruko holds victims' screenshots, bank details and an AI pipeline, and sits in a bank's payment flow, so the platform itself is a target. Every API request is inspected before it reaches a route. <b>Detect</b> mode records (IDS); <b>Prevent</b> mode also blocks, rate-limits and bans (IPS).</p>
      ${window.RUKO_STATIC ? `<p class="muted small" style="max-width:760px;margin:8px 0 0">${icon('info', { size: 14 })} <b>On this website</b> the app runs in your browser, so the same IDS/IPS engine inspects every in-app request here, and the flood and AI-cost rules protect the shared Gemini quota. Network-level protection comes from Google's edge (TLS, HSTS, DDoS), a strict Content-Security-Policy with no inline scripts except two hashed ones, frame-ancestors none, and a Gemini key limited to the Gemini API on a project with no billing, so misuse can at most use up free quota (the app then falls back to offline rules). Production moves the key server-side (Firebase AI Logic with App Check).</p>` : ''}</div>
      <div class="seg" role="radiogroup" aria-label="Mode" id="mode"><button type="button" data-m="detect" role="radio">${icon('eye', { size: 15 })} Detect (IDS)</button><button type="button" data-m="prevent" role="radio">${icon('shield', { size: 15 })} Prevent (IPS)</button></div></div>
    <section class="stats-band" id="kpis"></section>
    <div class="grid" style="grid-template-columns:minmax(0,1fr) minmax(0,1.35fr);margin-top:18px;gap:18px">
      <div class="card"><div class="card-head"><h3>${icon('zap')}Attack simulator</h3><span class="tiny muted">from 203.0.113.0/24 (TEST-NET)</span></div>
        <p class="small muted">Replays real attack traffic through the same inspection path as a real request. You are never banned: the simulator uses reserved documentation addresses.</p>
        <div class="stack" id="sims">${sims.map((s) => `<button class="btn" data-sim="${s.id}" type="button" style="justify-content:space-between;width:100%"><span class="row" style="gap:8px">${icon('play', { size: 14 })}${esc(s.label)}</span><span class="tiny muted" data-res="${s.id}"></span></button>`).join('')}</div>
        <div class="row" style="margin-top:12px"><button class="btn primary" id="all" type="button">${icon('zap', { size: 15 })}Run all</button><button class="btn ghost sm" id="reset" type="button">${icon('trash', { size: 14 })}Clear events</button></div>
      </div>
      <div class="card"><div class="card-head"><h3>${icon('message')}Live events</h3><span class="pill" id="live"><span class="dot"></span>polling</span></div><div id="events"></div></div>
    </div>
    <div class="grid g2" style="margin-top:18px">
      <div class="card"><div class="card-head"><h3>${icon('layers')}Rules</h3><span class="tiny muted">OWASP Top 10 · OWASP API · OWASP LLM · MITRE ATT&amp;CK</span></div><div id="rules"></div></div>
      <div class="stack">
        <div class="card"><div class="card-head"><h3>${icon('lock')}Active bans</h3></div><div id="bans"></div></div>
        <div class="card"><h3>${icon('cpu')}Production path</h3><ul class="small" style="margin:0;padding-left:18px">
          <li><b>Cloud Armor</b> in front of Cloud Run: OWASP CRS WAF rules, per-IP rate limits, adaptive DDoS protection (the IPS edge).</li>
          <li><b>Cloud IDS</b> on the VPC for network-level threats between services (Palo Alto threat signatures).</li>
          <li>Events to <b>Security Command Center</b> and Cloud Logging; alerts to the bank's SOC.</li>
          <li>This in-app layer stays: it understands Ruko's own payloads (evidence files, prompts, case state) that a generic WAF cannot.</li></ul></div>
      </div>
    </div>`;

  let snap;
  const draw = () => {
    $$('#mode button', el).forEach((b) => { const on = b.dataset.m === snap.mode; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
    $('#kpis', el).innerHTML = `
      <div><div class="num">${snap.counters.inspected.toLocaleString('en-IN')}</div><div class="lbl">Requests inspected</div></div>
      <div><div class="num" style="color:var(--bad)">${snap.counters.blocked.toLocaleString('en-IN')}</div><div class="lbl">Blocked / rate-limited</div></div>
      <div><div class="num" style="color:var(--warn)">${snap.counters.alerted.toLocaleString('en-IN')}</div><div class="lbl">Alerts (detected, allowed)</div></div>
      <div><div class="num">${snap.bans.length}</div><div class="lbl">IPs banned now · mode <b>${snap.mode === 'prevent' ? 'IPS' : 'IDS'}</b></div></div>`;
    $('#events', el).innerHTML = snap.events.length ? `<div class="tablewrap" style="max-height:640px"><table class="t"><thead><tr><th>Time</th><th>Rule</th><th>Source</th><th>Outcome</th></tr></thead><tbody>
      ${snap.events.slice(0, 40).map((e) => { const o = OUT[e.outcome] || ['', 'info']; return `<tr><td class="tiny muted" style="white-space:nowrap">${dt(e.at)}</td><td><span class="pill ${SEV[e.sev]}">${esc(e.sev)}</span> <b class="small">${esc(e.name)}</b><div class="mono tiny muted">${esc(e.rule)} · ${esc(e.map)}</div><div class="tiny muted" style="overflow-wrap:anywhere">${esc(e.detail)}</div></td><td class="mono tiny">${esc(e.ip)}<div class="muted">${esc(e.method)} ${esc(e.path)}</div>${e.caseId ? `<a class="tiny" href="#/desk/${esc(e.caseId)}">${esc(e.caseId)}</a>` : ''}</td><td><span class="pill ${o[0]}">${icon(o[1], { size: 12 })}${esc(e.outcome)}</span></td></tr>`; }).join('')}
      </tbody></table></div>` : `<div class="callout info">${icon('info')}<span>No events yet. Run an attack from the simulator.</span></div>`;
    $('#rules', el).innerHTML = `<div class="tablewrap" style="max-height:none"><table class="t"><thead><tr><th>Rule</th><th>Severity</th><th>Action</th><th>Hits</th></tr></thead><tbody>
      ${snap.rules.map((r) => `<tr><td><b class="small">${esc(r.name)}</b><div class="mono tiny muted">${esc(r.id)} · ${esc(r.map)}</div></td><td><span class="pill ${SEV[r.sev]}">${esc(r.sev)}</span></td><td class="small">${ACT[r.action]}</td><td class="num" style="font-weight:700">${r.hits}</td></tr>`).join('')}
      </tbody></table></div>`;
    $('#bans', el).innerHTML = snap.bans.length ? snap.bans.map((b) => `<div class="row between" style="padding:8px 0;border-bottom:1px dashed var(--border)"><span><span class="mono">${esc(b.ip)}</span> <span class="tiny muted">${esc(b.rule)} · ${b.secondsLeft}s left</span></span><button class="btn sm" data-unban="${esc(b.ip)}" type="button">Unblock</button></div>`).join('') : '<p class="small muted" style="margin:0">None. Loopback (the local operator) is never banned.</p>';
    el.querySelectorAll('[data-unban]').forEach((b) => b.addEventListener('click', async () => { snap = await post('/security/unblock', { ip: b.dataset.unban }); draw(); }));
    results.forEach((r) => { const n = el.querySelector(`[data-res="${r.attack}"]`); if (n) n.innerHTML = r.html; });
  };
  const $$ = (q, r) => [...r.querySelectorAll(q)];
  const refresh = async () => { snap = await get('/security'); draw(); };

  const runSim = async (id) => {
    const btn = el.querySelector(`[data-sim="${id}"]`);
    btn.classList.add('loading'); btn.disabled = true;
    try {
      const r = await post('/security/simulate', { attack: id });
      const ev = r.events[0];
      const stopped = r.final.status >= 400;
      const html = ev ? `<span class="pill ${stopped ? 'bad' : 'warn'}">${icon(stopped ? 'shieldCheck' : 'alert', { size: 12 })}${esc(ev.outcome)} · HTTP ${r.final.status}</span>` : `<span class="pill">HTTP ${r.final.status}</span>`;
      const i = results.findIndex((x) => x.attack === id); const rec = { attack: id, html };
      i >= 0 ? (results[i] = rec) : results.push(rec);
    } catch (e) { toast(e.message); }
    btn.classList.remove('loading'); btn.disabled = false;
    await refresh();
  };
  el.querySelectorAll('[data-sim]').forEach((b) => b.addEventListener('click', () => runSim(b.dataset.sim)));
  $('#all', el).addEventListener('click', async () => { for (const s of sims) await runSim(s.id); });
  $('#reset', el).addEventListener('click', async () => { snap = await post('/security/reset'); results.length = 0; draw(); });
  $$('#mode button', el).forEach((b) => b.addEventListener('click', async () => { snap = await post('/security/mode', { mode: b.dataset.m }); draw(); toast(snap.mode === 'prevent' ? 'IPS: attacks are now blocked' : 'IDS: attacks are recorded but allowed'); }));
  await refresh();
  const timer = setInterval(refresh, 2500);
  window.ruko = { ...(window.ruko || {}), runAllAttacks: async () => { for (const s of sims) await runSim(s.id); } };
  return () => clearInterval(timer);
}
