import { get, post } from '../api.js';
import { $, esc, sleep, download, toast, outcomePill, pageHead } from '../ui.js';
import { app } from '../main.js';
import { specs, pngOf } from '../evidence-render.js';

const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);
const runs = [];

export async function render(el) {
  el.innerHTML = `
    ${pageHead({ eyebrow: 'For judges', title: 'Evaluation', desc: 'How well Ruko decides. Interview: 20 scams, 20 legitimate but unusual transfers and 4 red-team cases. Extraction: 30 synthetic receipts in Hindi, Tamil and English.' })}
    <div class="card"><div class="card-head"><h3 style="margin:0">Interview agent</h3>
      <div class="row"><button class="btn primary" id="runOff" type="button">Re-run (offline rules)</button><button class="btn" id="runGem" type="button" ${app.config.aiMode === 'gemini' && !app.config.static ? '' : `disabled title="${app.config.static ? 'Disabled in the shared demo to protect viewers\' usage' : 'Needs GEMINI_API_KEY'}"`}>Run with Gemini (sample of 12)</button></div></div>
      <div id="iv"><p class="muted small">Running the offline evaluation…</p></div></div>
    <div class="card" style="margin-top:16px"><div class="card-head"><h3 style="margin:0">Risk engine: friction vs protection</h3><a class="btn sm" href="#/risk">Open Risk Engine</a></div>
      <div id="rk"><p class="muted small">Scoring every payment stream…</p></div></div>
    <div class="card" style="margin-top:16px"><div class="card-head"><h3 style="margin:0">Evidence extraction</h3><button class="btn" id="runEx" type="button" ${app.config.aiMode === 'gemini' && !app.config.static ? '' : 'disabled'}>Run extraction eval (30 items)</button></div>
      <div id="ex">${app.config.aiMode === 'gemini' ? '<p class="muted small">Not run yet. Each item is rendered in your browser and sent to Gemini; results are scored against ground truth.</p>' : '<div class="callout warn small">Needs a Gemini key. In offline mode the reader returns the stored ground truth for sample files, so scoring it would only measure itself. We do not show a number we did not earn.</div>'}</div></div>`;

  const drawIv = (r) => {
    runs.unshift(r); runs.length = Math.min(runs.length, 5);
    const m = r.metrics;
    const md = `| Metric | Value |\n|---|---|\n| Scam catch rate | ${pct(m.catchRate)} |\n| False-hold rate | ${pct(m.falseHoldRate)} |\n| Median seconds to decision (simulated) | ${m.medianSecondsToDecision} |\n| Median turns | ${m.medianTurns} |\n| Ruko processing per turn, measured (s) | ${m.medianRukoSecondsPerTurn} |\n| Cost per intervention (INR, est.) | ₹${m.costPerInterventionINR.toFixed(3)} |\n| Red-team pass | ${m.redTeamPass} |\n\nEngine: ${r.engine} · ${r.at}`;
    $('#iv', el).innerHTML = `
      <div class="grid g3" style="margin:6px 0 14px">
        <div class="kpi"><div class="num" style="color:var(--ok)">${pct(m.catchRate)}</div><div class="lbl">Scam catch rate</div></div>
        <div class="kpi"><div class="num">${pct(m.falseHoldRate)}</div><div class="lbl">False-hold rate</div></div>
        <div class="kpi"><div class="num">${m.medianSecondsToDecision}s</div><div class="lbl">Median time to decision (simulated, ${m.medianTurns} turns)</div></div>
        <div class="kpi"><div class="num">${m.medianRukoSecondsPerTurn == null ? '—' : m.medianRukoSecondsPerTurn < 0.1 ? '&lt;0.1' : m.medianRukoSecondsPerTurn}s</div><div class="lbl">Ruko processing per turn (measured, median)</div></div>
        <div class="kpi"><div class="num">₹${m.costPerInterventionINR.toFixed(2)}</div><div class="lbl">Model cost per intervention (est.)</div></div>
      </div>
      <div class="row small"><span class="pill">Engine: ${esc(r.engine)}</span><span class="pill">Red team ${esc(m.redTeamPass)}</span><button class="btn sm" id="md" type="button">Copy as Markdown</button><button class="btn sm" id="csv" type="button">Download CSV</button></div>
      <div class="callout warn small" style="margin:12px 0">${esc(r.caveat)}</div>
      <div class="tablewrap"><table class="t"><thead><tr><th>Case</th><th>Expected</th><th>Outcome</th><th>Score</th><th>Turns</th><th>Top reasons</th></tr></thead><tbody>
        ${r.rows.map((x) => `<tr><td class="mono">${x.pass ? '✓' : '✕'} ${x.id}${x.redTeam ? `<div class="tiny">${esc(x.name)}</div>` : ''}</td><td>${x.expect}</td><td>${outcomePill(x.outcome)}</td><td>${x.score ?? '—'}</td><td>${x.turns}</td><td class="tiny">${esc(x.top.join(' · '))}</td></tr>`).join('')}
      </tbody></table></div>
      ${runs.length > 1 ? `<div class="group-h">Previous runs</div>${runs.slice(1).map((p) => `<div class="tiny muted">${p.at} · ${esc(p.engine)} · catch ${pct(p.metrics.catchRate)} · false-hold ${pct(p.metrics.falseHoldRate)}</div>`).join('')}` : ''}`;
    $('#md', el).addEventListener('click', () => { navigator.clipboard.writeText(md); toast('Copied'); });
    $('#csv', el).addEventListener('click', () => download('ruko-interview-eval.csv', ['id,expect,got,outcome,score,turns,pass', ...r.rows.map((x) => [x.id, x.expect, x.got, x.outcome, x.score, x.turns, x.pass].join(','))].join('\n'), 'text/csv'));
  };
  const runIv = async (useGemini) => { $('#iv', el).innerHTML = `<p class="muted">Running ${useGemini ? 'with Gemini (this takes a minute)' : ''}…</p>`; try { drawIv(await post('/eval/interview', { useGemini, limit: useGemini ? 12 : 0 })); } catch (e) { $('#iv', el).innerHTML = `<div class="callout bad">${esc(e.message)}</div>`; } };
  $('#runOff', el).addEventListener('click', () => runIv(false));
  // Offline rules take well under a second: show the numbers on arrival instead of an empty card.
  runIv(false);
  (async () => {
    const r = await post('/eval/risk', {});
    const m = r.metrics, pct = (x) => `${Math.round(x * 1000) / 10}%`;
    $('#rk', el).innerHTML = `<div class="grid g3" style="margin:6px 0 14px">
        <div class="kpi"><div class="num" style="color:var(--ok)">${pct(m.honestAskedPct)}</div><div class="lbl">Honest payments that got questions (T3+)</div></div>
        <div class="kpi"><div class="num">${pct(m.honestTouchedPct)}</div><div class="lbl">Honest payments that saw any friction (T1+)</div></div>
        <div class="kpi"><div class="num" style="color:var(--ok)">${m.scamStreamsCaught}</div><div class="lbl">Scam journeys stopped (T3+)</div></div>
        <div class="kpi"><div class="num">${pct(m.valueProtectedPct)}</div><div class="lbl">Scam money stopped before it left</div></div>
        <div class="kpi"><div class="num">${m.expectedMatch}</div><div class="lbl">Payments scored in the expected tier</div></div>
      </div>
      <div class="callout warn small" style="margin-bottom:12px">${esc(r.caveat)}</div>
      <div class="tablewrap"><table class="t"><thead><tr><th>Journey</th><th>Stopped at</th><th>Lost before</th><th>Protected</th></tr></thead><tbody>${r.catches.map((c) => `<tr><td class="mono">${c.stream}</td><td>${c.caughtAt ? `payment ${c.caughtAt} of ${c.of}` : '<span style="color:var(--bad)">missed</span>'}</td><td>₹${c.lostBeforeINR.toLocaleString('en-IN')}</td><td>₹${c.protectedINR.toLocaleString('en-IN')}</td></tr>`).join('')}</tbody></table></div>`;
  })().catch((e) => { $('#rk', el).innerHTML = `<p class="small" style="color:var(--bad)">${esc(e.message)}</p>`; });
  $('#runGem', el).addEventListener('click', () => runIv(true));

  $('#runEx', el).addEventListener('click', async () => {
    const all = (await specs()).extraction;
    const box = $('#ex', el); box.innerHTML = '<div class="log" id="exl"></div>';
    const log = $('#exl', el), res = [];
    for (const s of all) {
      log.textContent += `${s.id} (${s.lang}${s.hard ? ', ' + s.hard : ''})… `;
      try { const r = await post('/eval/extract', { specId: s.id, dataUrl: await pngOf(s) }); res.push(r); const ok = Object.values(r.fields).reduce((a, f) => a + f.correct, 0), tot = Object.values(r.fields).reduce((a, f) => a + f.truth, 0); log.textContent += `${ok}/${tot}${r.invented.length ? ' · INVENTED ' + r.invented.join(',') : ''}\n`; } catch (e) { log.textContent += `error ${e.message}\n`; }
      log.scrollTop = log.scrollHeight;
    }
    const agg = {};
    for (const r of res) for (const [k, f] of Object.entries(r.fields)) { const a = (agg[k] ||= { truth: 0, correct: 0, wrong: 0, lowConf: 0 }); a.truth += f.truth; a.correct += f.correct; a.wrong += f.wrong; a.lowConf += f.lowConf; }
    const invented = res.reduce((a, r) => a + r.invented.length, 0);
    box.insertAdjacentHTML('beforeend', `<div class="row" style="margin:12px 0"><span class="pill ${invented ? 'bad' : 'ok'}">Release gate: ${invented ? `${invented} invented values ✕` : '0 invented values ✓'}</span></div>
      <div class="tablewrap"><table class="t"><thead><tr><th>Field</th><th>Precision</th><th>Exact / total</th><th>Wrong value</th><th>Low-confidence</th></tr></thead><tbody>${Object.entries(agg).map(([k, a]) => `<tr><td>${k}</td><td><b>${a.correct + a.wrong ? pct(a.correct / (a.correct + a.wrong)) : '—'}</b></td><td>${a.correct}/${a.truth}</td><td>${a.wrong}</td><td>${a.lowConf}</td></tr>`).join('')}</tbody></table></div>
      <p class="tiny muted">Prompt-injection item X-25: fact state is set by code, so text in the image cannot confirm facts.</p>`);
  });
  window.ruko = { ...(window.ruko || {}), runEval: () => runIv(false) };
}
