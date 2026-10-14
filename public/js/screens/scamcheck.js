import { post } from '../api.js';
import { $, esc, toast, fileToDataUrl } from '../ui.js';
import { t, state } from '../i18n.js';
import { specs, pngOf } from '../evidence-render.js';
import { icon } from '../icons.js';

const V = { likely_scam: ['bad', 'stop', 'Likely scam', 'संभवतः स्कैम'], suspicious: ['warn', 'alert', 'Suspicious', 'संदिग्ध'], looks_ok: ['ok', 'shieldCheck', 'No strong warning signs', 'कोई बड़ा खतरा नहीं'], unknown: ['', 'info', 'Could not check', 'जाँच नहीं हो सकी'] };

export async function render(el) {
  const all = await specs();
  const samples = all.scenario.filter((s) => ['A-wa', 'A-warrant', 'B-agreement'].includes(s.id));
  let picked = null, file = null;
  el.innerHTML = `
    <div class="grid" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:20px">
      <div class="card"><h2 class="row" style="gap:10px">${icon('search', { size: 22 })}${t('sc_title')}</h2><p class="muted">${t('sc_d')}</p>
        <textarea id="txt" rows="7" placeholder="${t('sc_paste')}"></textarea>
        <div class="group-h">${t('from_samples')}</div>
        <div class="row" id="samples">${samples.map((s) => `<button class="btn sm" data-s="${s.id}" type="button"><img data-th="${s.id}" alt="" style="width:22px;height:36px;object-fit:cover;border-radius:3px"> ${esc(s.title)}</button>`).join('')}</div>
        <label class="btn sm" style="margin-top:10px"><input type="file" id="f" accept="image/*" hidden>${icon('upload', { size: 15 })}${t('upload_file')}</label>
        <div id="pick" class="small muted" style="margin-top:8px"></div>
        <div class="row" style="margin-top:14px"><button class="btn primary lg" id="go" type="button">${t('sc_check')}</button></div>
      </div>
      <div id="out"></div>
    </div>`;
  for (const img of el.querySelectorAll('[data-th]')) img.src = await pngOf(all.scenario.find((s) => s.id === img.dataset.th));
  el.querySelectorAll('[data-s]').forEach((b) => b.addEventListener('click', async () => { picked = b.dataset.s; file = null; $('#pick', el).innerHTML = `Selected: <b>${esc(b.textContent.trim())}</b> <img src="${await pngOf(all.scenario.find((s) => s.id === picked))}" alt="" style="height:120px;vertical-align:top;border-radius:6px;border:1px solid var(--border);margin-left:8px">`; }));
  $('#f', el).addEventListener('change', async (e) => { const f = e.target.files[0]; if (!f) return; file = await fileToDataUrl(f); picked = null; $('#pick', el).innerHTML = `Selected file: <b>${esc(f.name)}</b>`; });
  const run = async () => {
    const out = $('#out', el);
    out.innerHTML = '<div class="card"><p class="muted">Checking…</p></div>';
    try {
      const body = { text: $('#txt', el).value.trim(), lang: state.lang };
      if (picked) body.specId = picked;
      if (file) body.dataUrl = file;
      if (picked && state.lang) body.dataUrl = await pngOf(all.scenario.find((s) => s.id === picked));
      const r = await post('/scamcheck', body);
      const v = V[r.verdict] || V.unknown;
      out.innerHTML = `<div class="card"><div class="row between"><span class="pill ${v[0]}" style="font-size:15px;padding:8px 14px">${icon(v[1], { size: 16 })}${state.lang === 'hi' ? v[3] : v[2]}</span><span class="pill ${r.engine === 'gemini' ? 'ok' : 'warn'}">${esc(r.engine)}</span></div>
        <h3 style="margin-top:14px">${esc(r.pattern)}</h3><p>${esc(r.explanation)}</p>
        ${r.redFlags.length ? `<div class="group-h">${state.lang === 'hi' ? 'खतरे के संकेत' : 'Red flags'}</div>${r.redFlags.map((f) => `<div class="sig on"><span class="ic">●</span><span>${esc(f.flag)}${f.quote ? `<q>${esc(f.quote)}</q>` : ''}</span></div>`).join('')}` : ''}
        ${r.nextSteps.length ? `<div class="group-h">${state.lang === 'hi' ? 'अभी क्या करें' : 'What to do'}</div><ol>${r.nextSteps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}
        <div class="callout info small">${icon('phone')}<span>1930 · cybercrime.gov.in</span></div></div>`;
    } catch (e) { out.innerHTML = `<div class="callout bad">${esc(e.message)}</div>`; }
  };
  $('#go', el).addEventListener('click', run);
  window.ruko = { ...(window.ruko || {}), scamCheckSample: async () => { el.querySelector('[data-s="A-wa"]').click(); await new Promise((r) => setTimeout(r, 300)); await run(); } };
}
