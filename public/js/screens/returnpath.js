import { get, post, del } from '../api.js';
import { dictate } from '../dictate.js';
import { $, $$, esc, inr, sleep, toast, download, fileToDataUrl, mocked, emptyState } from '../ui.js';
import { t, state } from '../i18n.js';
import { go } from '../main.js';
import { specs, evidencePayload, pngOf } from '../evidence-render.js';
import { startScenario } from './hub.js';
import { icon } from '../icons.js';

const TYPE = { amount: ['Amount', 'राशि'], utr: ['UTR / reference', 'UTR / संदर्भ'], date: ['Date', 'तारीख'], beneficiary_name: ['Beneficiary', 'प्राप्तकर्ता'], beneficiary_account: ['Beneficiary account', 'प्राप्तकर्ता खाता'], ifsc: ['IFSC', 'IFSC'], bank: ['Bank', 'बैंक'], impersonated_agency: ['Agency impersonated', 'नकली एजेंसी'], case_number_claimed: ['Fake case number', 'नकली केस नंबर'], phone_number: ['Scammer phone', 'ठग का फ़ोन'], demand: ['Demand', 'माँग'], deadline: ['Deadline', 'समय-सीमा'], secrecy_instruction: ['Secrecy instruction', 'गुप्त रखने का निर्देश'], agreement_reference: ['Agreement ref.', 'एग्रीमेंट संदर्भ'], account_masked: ['Your account', 'आपका खाता'], freeze_reference: ['Freeze reference', 'फ़्रीज़ संदर्भ'], disputed_credit: ['Disputed credit', 'विवादित क्रेडिट'], remitter_name: ['Remitter', 'भेजने वाला'], frozen_balance: ['Frozen balance', 'फ़्रीज़ बैलेंस'] };
const tyL = (ty) => (TYPE[ty] || [ty, ty])[state.lang === 'hi' ? 1 : 0];
const money = (f) => (['amount', 'disputed_credit', 'frozen_balance'].includes(f.type) && f.value ? inr(f.value) : f.value);
const ART = { complaint_1930: ['1930 / NCRP complaint', '1930 / NCRP शिकायत'], bank_dispute: ['Bank dispute letter', 'बैंक को पत्र'], cyber_cell_annexure: ['Cyber-cell evidence annexure', 'साइबर सेल सबूत सूची'], release_application: ['Release application (draft)', 'रिलीज़ आवेदन (ड्राफ़्ट)'], plain_summary: ['Plain-language summary', 'आसान सारांश'], bona_fides_pack: ['Bona fides pack (limit the freeze)', 'बोना फ़ाइड्स पैक (फ़्रीज़ सीमित करें)'] };

export async function render(el, [caseId, stepS]) {
  caseId = caseId || localStorage.getItem('ruko_case');
  let c = caseId ? await get(`/cases/${caseId}`).catch(() => null) : null;
  if (!c) {
    const hi = state.lang === 'hi';
    el.innerHTML = emptyState({
      ic: 'undo',
      title: hi ? 'पैसा वापस पाएँ, या खाता खुलवाएँ' : 'Get your money back, or your account unfrozen',
      body: hi ? 'अपनी बात अपने शब्दों में बताइए और स्क्रीनशॉट दीजिए। ReturnPath हर तथ्य उसके सबूत से जोड़कर बैंक, साइबर सेल और कोर्ट के लिए कागज़ बनाता है।' : 'Tell it in your own words and add your screenshots. ReturnPath ties every fact to its evidence and drafts the papers for the bank, the cyber cell and the court.',
      actions: `<button class="btn primary lg" data-s="C" type="button">${t('frozen_title')}${icon('arrowRight', { size: 16 })}</button><button class="btn lg" data-s="A" type="button">${hi ? 'पैसा चला गया (सीन A)' : 'My money already left (Scenario A)'}</button>`,
      steps: hi ? ['क्या हुआ', 'सबूत', 'तथ्य जाँचें', 'केस फ़ाइल'] : ['What happened', 'Your evidence', 'Check the facts', 'Your case file'],
    });
    el.querySelectorAll('[data-s]').forEach((b) => b.addEventListener('click', () => startScenario(b.dataset.s)));
    return;
  }
  localStorage.setItem('ruko_case', c.id);
  const step = Math.max(1, Math.min(7, Number(stepS) || 1));
  const frozen = c.door === 'frozen_holder';
  const names = ['rp_s1', 'rp_s2', 'rp_s3', 'rp_s4', frozen ? 'rp_s5f' : 'rp_s5', 'rp_s6', 'rp_s7'];
  const reached = { 1: true, 2: !!c.story, 3: c.evidence.length > 0, 4: c.facts.length > 0, 5: c.facts.length > 0 && !c.facts.some((f) => f.state === 'needs_check'), 6: !!(c.moneyTrail || c.frozen), 7: c.artefacts.length > 0 };
  const nav = (n) => go(`#/case/${c.id}/${n}`);

  el.innerHTML = `
    <div class="rp-head"><div><div class="eyebrow">${frozen ? t('frozen_title') : 'ReturnPath'} · ${c.id}</div><h2>${t(names[step - 1])}</h2></div>
    <div class="row no-print"><a class="btn sm" href="#/officer/${c.id}">${icon('badge', { size: 15 })}Officer view</a><a class="btn sm" href="#/desk/${c.id}">${icon('desk', { size: 15 })}Fraud desk</a></div></div>
    <nav class="stepper" aria-label="Steps">${names.map((k, i) => `<a href="#/case/${c.id}/${i + 1}" class="${i + 1 === step ? 'on' : reached[i + 2] ? 'done' : ''}" ${i + 1 === step ? 'aria-current="step"' : ''}><span class="no">${reached[i + 2] && i + 1 !== step ? icon('check', { size: 12 }) : ''}0${i + 1}</span>${t(k)}</a>`).join('')}</nav>
    <div id="body"></div>`;
  const body = $('#body', el);
  const footer = (nextLabel = t('save_next'), id = 'next', disabled = false) => `<div class="row between no-print" style="margin-top:20px"><button class="btn lg" id="back" type="button" ${step === 1 ? 'disabled' : ''}>${icon('arrowLeft', { size: 16 })}${t('back')}</button><button class="btn primary lg" id="${id}" type="button" ${disabled ? 'disabled' : ''}>${nextLabel}${icon('arrowRight', { size: 16 })}</button></div>`;
  const wireBack = () => $('#back', body)?.addEventListener('click', () => nav(step - 1));

  // ---------------- step 1 ----------------
  if (step === 1) {
    body.innerHTML = `<div class="card" style="max-width:820px">
      <p class="muted">${t('rp_s1d')}</p>
      ${c.interview && c.story ? `<div class="callout ok" style="margin-bottom:12px">${t('rp_prefilled')}</div>` : ''}
      <label class="field"><span>${state.lang === 'hi' ? 'आपकी बात' : 'In your words'}</span><textarea id="story" rows="7">${esc(c.story || '')}</textarea></label>
      <div class="row" style="margin-top:8px"><button class="btn sm" id="mic" type="button">${icon('mic', { size: 15 })}${state.lang === 'hi' ? 'बोलकर लिखें' : 'Speak instead'}</button><span class="tiny muted">${state.lang === 'hi' ? 'हिंदी, English या दोनों मिलाकर, Gemini लिखेगा' : 'Hindi, English or a mix; Gemini writes it down'}</span></div>
      ${footer()}</div>`;
    $('#mic', body).addEventListener('click', (e) => dictate({
      lang: state.lang, button: e.currentTarget,
      onState: (st) => { if (st === 'recording') toast(state.lang === 'hi' ? 'बोलिए… रुकने के लिए फिर से दबाएँ' : 'Speak now… tap again to stop'); if (st === 'transcribing') toast(state.lang === 'hi' ? 'Gemini लिख रहा है…' : 'Gemini is writing it down…'); },
      onText: (text) => { const st = $('#story', body); st.value = (st.value.trim() + ' ' + text).trim(); },
      onError: (m) => toast(m),
    }));
    $('#next', body).addEventListener('click', async () => { const s = $('#story', body).value.trim(); if (!s) return toast(state.lang === 'hi' ? 'कुछ शब्दों में बताइए' : 'Please write a few words'); c = await post(`/cases/${c.id}/story`, { story: s }); nav(2); });
    wireBack();
  }

  // ---------------- step 2 ----------------
  if (step === 2) {
    const all = await specs();
    const sampleIds = all.scenario.filter((s) => s.scenario === c.scenarioId).map((s) => s.id);
    const drawEv = () => {
      if (!c.consent) {
        body.innerHTML = `<div class="card" style="max-width:720px"><h3 class="row" style="gap:10px">${icon('lock', { size: 20 })}${t('consent_t')}</h3><p>${t('consent_d')}</p>
          <label class="switch"><input type="checkbox" id="c1" checked> ${t('c_shots')}</label><label class="switch"><input type="checkbox" id="c2"> ${t('c_audio')}</label><label class="switch"><input type="checkbox" id="c3"> ${t('c_share')}</label>
          <div class="row" style="margin-top:14px"><button class="btn primary" id="agree" type="button">${t('agree')}</button></div></div>`;
        $('#agree', body).addEventListener('click', async () => { c = await post(`/cases/${c.id}/consent`, { screenshots: $('#c1', body).checked, audio: $('#c2', body).checked, shareWithContact: $('#c3', body).checked }); drawEv(); });
        return;
      }
      body.innerHTML = `<div class="card">
        <p class="muted">${t('rp_s2d')}</p>
        <div class="ev-grid" id="evg">${c.evidence.map((e) => `<div class="ev-tile"><img src="${e.url}" alt="${esc(e.title)}"><div class="cap">${esc(e.title)}<div class="tiny muted">${e.during === 'interview' ? (state.lang === 'hi' ? 'सुरक्षा जाँच से' : 'from the safety check') : esc(e.kind)}</div></div><button class="btn sm danger del" data-del="${e.id}" type="button" aria-label="${t('del')}">${icon('trash', { size: 14 })}</button></div>`).join('') || `<p class="muted">${state.lang === 'hi' ? 'अभी कोई फ़ाइल नहीं।' : 'No files yet.'}</p>`}</div>
        <div class="dropzone" id="drop" style="margin-top:18px"><div class="big">${icon('upload', { size: 22 })}</div><div style="flex:1"><b>${state.lang === 'hi' ? 'फ़ाइलें यहाँ छोड़ें' : 'Drop files here'}</b><div class="small muted">${state.lang === 'hi' ? 'स्क्रीनशॉट, PDF, वॉइस नोट · हर फ़ाइल 10 MB तक' : 'Screenshots, PDFs, voice notes · up to 10 MB each'}</div></div>
          <label class="btn"><input type="file" id="files" multiple accept="image/*,application/pdf,audio/*" hidden>${icon('upload')}${t('upload_file')}</label></div>
        <div class="row" style="margin-top:12px">
          ${sampleIds.filter((id) => !c.evidence.some((e) => e.specId === id)).map((id) => `<button class="btn" data-add="${id}" type="button">${icon('plus', { size: 15 })}${esc(all.scenario.find((s) => s.id === id).title)}</button>`).join('')}
        </div>
        <p class="tiny muted" style="margin-top:8px">${state.lang === 'hi' ? 'सैंपल फ़ाइलें नकली (synthetic) हैं।' : 'Sample files are synthetic.'} ${mocked('Synthetic')}</p>
        ${footer(t('save_next'), 'next', !c.evidence.length)}</div>`;
      body.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', async () => { b.disabled = true; c = await post(`/cases/${c.id}/evidence`, { ...(await evidencePayload(b.dataset.add)), during: 'returnpath' }); drawEv(); }));
      body.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => { c = await del(`/cases/${c.id}/evidence/${b.dataset.del}`); drawEv(); }));
      const addFiles = async (files) => { for (const f of files) c = await post(`/cases/${c.id}/evidence`, { dataUrl: await fileToDataUrl(f), fileName: f.name, title: f.name, during: 'returnpath' }); drawEv(); };
      $('#files', body).addEventListener('change', (e) => addFiles(e.target.files));
      const dz = $('#drop', body);
      ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('over'); }));
      ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, () => dz.classList.remove('over')));
      dz.addEventListener('drop', (e) => { e.preventDefault(); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); });
      $('#next', body).addEventListener('click', () => nav(3));
      wireBack();
    };
    drawEv();
    window.ruko = { ...(window.ruko || {}), addAllSamples: async () => { for (const id of sampleIds) if (!c.evidence.some((e) => e.specId === id)) c = await post(`/cases/${c.id}/evidence`, { ...(await evidencePayload(id)), during: 'returnpath' }); if (!c.consent) c = await post(`/cases/${c.id}/consent`, { screenshots: true, audio: false, shareWithContact: false }); drawEv(); } };
  }

  // ---------------- step 3 ----------------
  if (step === 3) {
    body.innerHTML = `<div class="card" style="max-width:860px"><p class="muted">${t('rp_s3d')}</p>
      <div class="log" id="log" aria-live="polite">${c.evidence.map((e) => `${e.extraction ? '✓' : '·'} ${e.title}${e.extraction ? `: ${e.extraction.added} facts (${e.extraction.engine})` : ''}`).join('\n')}</div>
      <div class="row" style="margin-top:14px"><button class="btn primary" id="read" type="button">${t('read_now')}</button></div>${footer(t('save_next'), 'next', !c.facts.length)}</div>`;
    const log = $('#log', body);
    const readAll = async () => {
      $('#read', body).disabled = true;
      log.textContent = '';
      let i = 0;
      for (const e of c.evidence) {
        i++;
        log.textContent += `${state.lang === 'hi' ? 'पढ़ रहे हैं' : 'Reading'} ${e.title} (${i} of ${c.evidence.length})…\n`;
        try {
          const r = await post(`/cases/${c.id}/extract/${e.id}`);
          c = r.case;
          const counts = {}; r.result.types.forEach((ty) => { counts[ty] = (counts[ty] || 0) + 1; });
          log.textContent += `   ✓ ${state.lang === 'hi' ? 'मिला' : 'found'} ${Object.entries(counts).map(([k, v]) => `${v} ${tyL(k).toLowerCase()}`).join(', ') || 'nothing'}  [${r.result.engine}]\n${r.result.note ? `   ⓘ ${r.result.note}\n` : ''}`;
        } catch (err) { log.textContent += `   ✕ ${err.message}\n`; }
        await sleep(250);
      }
      const need = c.facts.filter((f) => f.state === 'needs_check').length, miss = c.facts.filter((f) => f.state === 'missing').length;
      log.textContent += `\n${state.lang === 'hi' ? `${need} तथ्य आपकी जाँच के लिए, ${miss} नहीं मिले।` : `${need} facts need your check, ${miss} missing.`}`;
      $('#next', body).disabled = false;
    };
    $('#read', body).addEventListener('click', readAll);
    $('#next', body).addEventListener('click', () => nav(4));
    wireBack();
    window.ruko = { ...(window.ruko || {}), readAll };
  }

  // ---------------- step 4 ----------------
  if (step === 4) {
    let sel = c.evidence[0]?.id;
    const drawFacts = () => {
      const ev = c.evidence.find((e) => e.id === sel);
      const groups = {};
      for (const f of c.facts) (groups[f.group] ||= []).push(f);
      const need = c.facts.filter((f) => f.state === 'needs_check').length;
      const glabel = (g) => g === 'claim' ? (state.lang === 'hi' ? 'धमकी और दावे' : 'Threats and claims') : (() => { const [eid, k] = g.split(':'); const e = c.evidence.find((x) => x.id === eid); return `${e?.title || eid} · ${k.startsWith('txn') ? (state.lang === 'hi' ? 'लेन-देन ' : 'Transaction ') + k.slice(3) : k}`; })();
      body.innerHTML = `
        <p class="muted" style="max-width:820px">${t('rp_s4d')}</p>
        ${need ? `<div class="callout warn" style="margin-bottom:14px">${need} ${t('needs')}</div>` : '<div class="callout ok" style="margin-bottom:14px">✓ ' + (state.lang === 'hi' ? 'सभी तथ्य जाँचे गए' : 'All facts checked') + '</div>'}
        <div class="facts-layout">
          <div class="viewer">
            <div class="tabs">${c.evidence.map((e) => `<button type="button" class="${e.id === sel ? 'on' : ''}" data-ev="${e.id}">${esc(e.title)}</button>`).join('')}</div>
            ${ev ? `<div class="viewer-img" id="vimg"><img src="${ev.url}" alt="${esc(ev.title)}">${c.facts.filter((f) => f.source?.evidenceId === ev.id && f.source.box2d?.length === 4).map((f) => { const [y1, x1, y2, x2] = f.source.box2d; return `<div class="box ${f.state}" data-box="${f.id}" title="${esc(tyL(f.type))}: ${esc(f.value)}" style="top:${y1 / 10}%;left:${x1 / 10}%;width:${(x2 - x1) / 10}%;height:${(y2 - y1) / 10}%"></div>`; }).join('')}</div>` : ''}
            ${ev?.extraction?.note ? `<div class="tiny muted row" style="margin-top:6px;gap:6px">${icon('info', { size: 13 })}${esc(ev.extraction.note)}</div>` : ''}
          </div>
          <div id="flist">
            ${Object.entries(groups).map(([g, fs]) => `<div class="group-h">${esc(glabel(g))}</div>${fs.map(factRow).join('')}`).join('')}
            <details class="card flat" style="margin-top:12px"><summary class="small" style="cursor:pointer;font-weight:700">＋ ${state.lang === 'hi' ? 'खुद से तथ्य जोड़ें' : 'Add a fact manually'}</summary>
              <div class="row" style="margin-top:10px"><select id="mType" style="width:auto">${Object.keys(TYPE).map((k) => `<option value="${k}">${tyL(k)}</option>`).join('')}</select><input type="text" id="mVal" style="flex:1;min-width:160px" placeholder="Value"><button class="btn" id="mAdd" type="button">Add</button></div></details>
            ${need ? `<label class="switch" style="margin-top:14px"><input type="checkbox" id="iChecked"> ${t('all_checked')}</label><button class="btn" id="confirmAll" type="button" disabled>${t('confirm')} (${need})</button>` : ''}
          </div>
        </div>
        ${footer(t('save_next'), 'next', need > 0)}`;
      wire();
    };
    const factRow = (f) => {
      const chip = { needs_check: ['warn', t('needs')], confirmed: ['ok', t('confirmed_s')], missing: ['bad', t('missing_s')], rejected: ['', t('rejected_s')] }[f.state];
      const ic = icon({ needs_check: 'eye', confirmed: 'check', missing: 'x', rejected: 'x' }[f.state], { size: 12 });
      return `<div class="fact ${f.state} ${f.conflict ? 'conflict' : ''}" data-fact="${f.id}">
        <div><div class="ty">${esc(tyL(f.type))} <span class="mono" style="font-weight:400">${f.id}</span></div>
          ${f.state === 'missing' ? `<div class="row" style="margin-top:4px"><input type="text" data-fill="${f.id}" placeholder="${t('fill')}" style="max-width:260px"><button class="btn sm" data-save="${f.id}" type="button">${t('fill')}</button></div>` : `<div class="val" data-show="${f.id}" style="cursor:pointer">${esc(money(f))}</div>`}
          ${f.conflict ? `<div class="tiny" style="color:var(--bad)">${t('conflict')}</div>` : ''}
          ${f.confidence === 'low' ? '<div class="tiny" style="color:var(--warn)">Low confidence read: please check carefully</div>' : ''}
          ${f.editedByUser ? '<div class="tiny muted">edited by you</div>' : ''}
        </div>
        <div class="acts"><span class="pill ${chip[0]}">${ic} ${chip[1]}</span>
          ${f.state === 'needs_check' || f.state === 'rejected' ? `<button class="btn sm" data-act="confirmed" data-id="${f.id}" type="button">${icon('check', { size: 14 })}${t('confirm')}</button>` : ''}
          ${f.state !== 'missing' ? `<button class="btn sm" data-edit="${f.id}" type="button">${t('edit')}</button>` : ''}
          ${f.state !== 'rejected' && f.state !== 'missing' ? `<button class="btn sm ghost" data-act="rejected" data-id="${f.id}" type="button">${icon('x', { size: 14 })}${t('wrong')}</button>` : ''}</div></div>`;
    };
    const wire = () => {
      body.querySelectorAll('[data-ev]').forEach((b) => b.addEventListener('click', () => { sel = b.dataset.ev; drawFacts(); }));
      body.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', async () => { c = await post(`/cases/${c.id}/facts/${b.dataset.id}`, { state: b.dataset.act }); drawFacts(); }));
      body.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
        const f = c.facts.find((x) => x.id === b.dataset.edit);
        const val = body.querySelector(`[data-show="${f.id}"]`);
        val.outerHTML = `<div class="row" style="margin-top:4px"><input type="text" data-editval="${f.id}" value="${esc(f.value)}" style="max-width:280px"><button class="btn sm primary" data-editsave="${f.id}" type="button">${t('confirm')}</button></div>`;
        const inp = body.querySelector(`[data-editval="${f.id}"]`); inp.focus();
        const saveIt = async () => { const v = inp.value.trim(); if (!v) return; c = await post(`/cases/${c.id}/facts/${f.id}`, { value: v, state: 'confirmed' }); drawFacts(); };
        body.querySelector(`[data-editsave="${f.id}"]`).addEventListener('click', saveIt);
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveIt(); });
      }));
      body.querySelectorAll('[data-save]').forEach((b) => b.addEventListener('click', async () => { const v = body.querySelector(`[data-fill="${b.dataset.save}"]`).value.trim(); if (!v) return; c = await post(`/cases/${c.id}/facts/${b.dataset.save}`, { value: v, state: 'confirmed' }); drawFacts(); }));
      const show = (id) => { const f = c.facts.find((x) => x.id === id); if (f?.source?.evidenceId && f.source.evidenceId !== sel && c.evidence.some((e) => e.id === f.source.evidenceId)) { sel = f.source.evidenceId; drawFacts(); } const bx = body.querySelector(`[data-box="${id}"]`); if (bx) { bx.classList.remove('pulse'); void bx.offsetWidth; bx.classList.add('pulse'); bx.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } };
      body.querySelectorAll('[data-show]').forEach((v) => v.addEventListener('click', () => show(v.dataset.show)));
      body.querySelectorAll('[data-box]').forEach((b) => b.addEventListener('click', () => { const row = body.querySelector(`[data-fact="${b.dataset.box}"]`); row?.scrollIntoView({ block: 'center', behavior: 'smooth' }); row?.animate([{ background: 'var(--accent-soft)' }, { background: 'var(--surface)' }], { duration: 1200 }); }));
      $('#iChecked', body)?.addEventListener('change', (e) => { $('#confirmAll', body).disabled = !e.target.checked; });
      $('#confirmAll', body)?.addEventListener('click', confirmAll);
      $('#mAdd', body)?.addEventListener('click', async () => { const v = $('#mVal', body).value.trim(); if (!v) return; c = await post(`/cases/${c.id}/facts`, { type: $('#mType', body).value, value: v, group: 'manual:txn1' }); drawFacts(); });
      $('#next', body)?.addEventListener('click', async () => { c = await post(`/cases/${c.id}/trail`); nav(5); });
      wireBack();
    };
    const confirmAll = async () => { for (const f of c.facts.filter((x) => x.state === 'needs_check')) { c = await post(`/cases/${c.id}/facts/${f.id}`, { state: 'confirmed' }); } drawFacts(); };
    drawFacts();
    window.ruko = { ...(window.ruko || {}), confirmAll, pulseFirst: () => { const f = c.facts.find((x) => x.type === 'amount' || x.type === 'disputed_credit'); if (f) body.querySelector(`[data-show="${f.id}"]`)?.click(); } };
  }

  // ---------------- step 5 ----------------
  if (step === 5) {
    if (!c.moneyTrail && !c.frozen) c = await post(`/cases/${c.id}/trail`);
    if (frozen) {
      const fz = c.frozen || {};
      const pct = fz.proportion != null ? Math.max(1, fz.proportion * 100) : 0;
      body.innerHTML = `<div class="card" style="max-width:900px">
        <div class="grid g3"><div class="kpi"><div class="num">${inr(fz.frozenINR)}</div><div class="lbl">${state.lang === 'hi' ? 'फ़्रीज़ रकम' : 'Frozen'}</div></div><div class="kpi"><div class="num" style="color:var(--bad)">${inr(fz.disputedINR)}</div><div class="lbl">${state.lang === 'hi' ? 'विवादित क्रेडिट' : 'Actually in dispute'}</div></div><div class="kpi"><div class="num" style="color:var(--ok)">${inr(fz.excessINR)}</div><div class="lbl">${state.lang === 'hi' ? 'ज़रूरत से ज़्यादा फ़्रीज़' : 'Frozen beyond the dispute'}</div></div></div>
        <div style="margin:22px 0 6px;height:34px;border-radius:10px;overflow:hidden;display:flex;border:1px solid var(--border)"><div style="width:${pct}%;background:var(--bad)" title="disputed"></div><div style="flex:1;background:var(--ok-soft)"></div></div>
        <div class="tiny muted">${state.lang === 'hi' ? 'लाल हिस्सा = विवादित रकम। बाकी सब बिना वजह अटका है।' : 'Red = disputed amount. Everything else is held without a stated reason.'}</div>
        <h3 style="margin-top:22px">${state.lang === 'hi' ? 'फ़ैसला किसके हाथ में' : 'Who holds the decision'}</h3>
        <div class="grid g3"><div class="card flat"><b>Bharat Bank branch</b><div class="small muted">Can convert a full freeze into a lien limited to the disputed amount.</div></div><div class="card flat"><b>Cyber Crime PS, Ahmedabad</b><div class="small muted">Requested the freeze; can confirm the disputed amount.</div></div><div class="card flat"><b>High Court (writ)</b><div class="small muted">Last resort. Courts have reportedly criticised disproportionate freezes (verify citations).</div></div></div>
        ${footer()}</div>`;
    } else {
      const tr = c.moneyTrail;
      body.innerHTML = `<div class="card">
        <div class="grid g3" style="margin-bottom:16px"><div class="kpi"><div class="num">${inr(tr.totals.lost)}</div><div class="lbl">${state.lang === 'hi' ? 'कुल गया' : 'Total lost'}</div></div><div class="kpi"><div class="num" style="color:var(--ok)">${inr(tr.totals.traced)}</div><div class="lbl">${state.lang === 'hi' ? 'पूरी जानकारी के साथ' : 'Traced with complete details'}</div></div><div class="kpi"><div class="num" style="color:var(--bad)">${tr.legs.filter((l) => l.missing.length).length}</div><div class="lbl">${state.lang === 'hi' ? 'लेन-देन जिनमें कुछ कमी है' : 'Legs with a missing detail'}</div></div></div>
        <div class="trail">${trailSvg(c)}</div>
        <div class="tiny muted" style="margin-top:6px">${esc(tr.onward)}</div>
        <h3 style="margin-top:20px">${state.lang === 'hi' ? 'हर लेन-देन पर फ़ैसला किसके हाथ में' : 'Who holds each decision'}</h3>
        <div class="tablewrap"><table class="t"><thead><tr><th>Leg</th><th>Status</th><th>Decision holders</th></tr></thead><tbody>
          ${tr.legs.map((l, i) => `<tr><td><b>${inr(l.amountINR)}</b> → <span class="mono">${esc(l.to)}</span>${l.toName ? `<div class="small">${esc(l.toName)}</div>` : ''}<div class="tiny muted">${esc(l.date || '')} · UTR ${esc(l.utr || '—')}</div></td>
            <td>${l.confirmed ? `<span class="pill ok">${icon('check', { size: 12 })}confirmed</span>` : `<span class="pill bad">${icon('alert', { size: 12 })}gap</span>`}${l.missing.length ? `<div class="tiny" style="color:var(--warn);margin-top:4px">Missing: ${l.missing.map(tyL).join(', ')}</div>` : ''}${l.flagged ? `<div style="margin-top:4px"><span class="pill bad">⚑ reported account</span> ${mocked()}</div>` : ''}</td>
            <td>${l.decisionHolders.map((d) => `<div class="small"><b>${esc(d.label)}</b>: <span class="muted">${esc(d.role)}</span></div>`).join('')}</td></tr>`).join('')}
        </tbody></table></div>
        ${footer()}</div>`;
    }
    $('#next', body).addEventListener('click', () => nav(6));
    wireBack();
  }

  // ---------------- step 6 ----------------
  if (step === 6) {
    let tab = c.artefacts[0]?.kind;
    const drawArt = () => {
      const need = c.facts.filter((f) => f.state === 'needs_check').length;
      if (!c.artefacts.length) {
        body.innerHTML = `<div class="card" style="max-width:760px"><p class="muted">${t('rp_s6d')}</p>${need ? `<div class="callout warn">${need} ${t('needs')}. <a href="#/case/${c.id}/4">${t('rp_s4')}</a></div>` : ''}<div class="row" style="margin-top:12px"><button class="btn primary lg" id="gen" type="button" ${need ? 'disabled' : ''}>${t('generate')}</button></div>${footer(t('save_next'), 'next', true)}</div>`;
      } else {
        const a = c.artefacts.find((x) => x.kind === tab) || c.artefacts[0];
        const used = a.factIdsUsed.map((id) => c.facts.find((f) => f.id === id)).filter(Boolean);
        body.innerHTML = `<div class="card">
          <div class="tabs no-print">${c.artefacts.map((x) => `<button type="button" class="${x.kind === a.kind ? 'on' : ''}" data-tab="${x.kind}">${esc(ART[x.kind][state.lang === 'hi' ? 1 : 0])} ${x.status === 'approved' ? icon('check', { size: 13 }) : x.status === 'blocked' ? icon('stop', { size: 13 }) : ''}</button>`).join('')}</div>
          <div class="facts-layout" style="grid-template-columns:1fr 300px">
            <div><div class="row between no-print" style="margin-bottom:10px">${a.validation.ok ? `<span class="pill ok">${icon('shieldCheck', { size: 13 })}${t('traced')}</span>` : `<span class="pill bad">${icon('stop', { size: 13 })}${t('blocked')}: ${esc(a.validation.problems.join(', '))}</span>`}
              <div class="row"><span class="pill ${a.status === 'approved' ? 'ok' : a.status === 'blocked' ? 'bad' : 'warn'}">${a.status}</span>${a.engine !== 'template' ? `<span class="pill info">${esc(a.engine)}</span>` : ''}</div></div>
              <div class="doc" id="doc">${esc(a.body)}</div>
              <div class="row no-print" style="margin-top:12px"><button class="btn" id="approve" type="button" ${a.status !== 'draft' ? 'disabled' : ''}>${icon('check', { size: 15 })}${t('approve')}</button><button class="btn" id="dl" type="button">${icon('download', { size: 15 })}${t('download')}</button><button class="btn" id="pr" type="button">${icon('printer', { size: 15 })}${t('print')}</button><button class="btn ghost" id="regen" type="button">${icon('refresh', { size: 15 })}${t('generate')}</button></div>
              ${c.narrativeNote ? `<div class="tiny muted row" style="margin-top:8px;gap:6px">${icon('info', { size: 13 })}${esc(c.narrativeNote)}</div>` : ''}</div>
            <div class="no-print"><div class="group-h" style="margin-top:0">${state.lang === 'hi' ? 'इस्तेमाल हुए तथ्य' : 'Facts used'} (${used.length})</div>
              ${used.map((f) => `<div class="fact confirmed" style="grid-template-columns:1fr"><div><div class="ty">${esc(tyL(f.type))} · <span class="mono">${f.id}</span></div><div class="val" style="font-size:15px">${esc(money(f))}</div><div class="tiny muted">from ${esc(c.evidence.find((e) => e.id === f.source.evidenceId)?.title || f.source.evidenceId)}</div></div></div>`).join('') || '<p class="small muted">Only case details (name, account, dates).</p>'}</div>
          </div>
          <p class="tiny muted" style="margin-top:12px">${t('not_advice')}</p>
          ${footer()}</div>`;
        body.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; drawArt(); }));
        $('#approve', body).addEventListener('click', async () => { c = await post(`/cases/${c.id}/desk`, { action: 'approve_artefact', kind: a.kind }); drawArt(); });
        $('#dl', body).addEventListener('click', () => download(`${c.id}-${a.kind}.txt`, a.body + `\n\n---\nCase ${c.id} · generated ${new Date().toLocaleString('en-IN')} · All values traced to user-confirmed evidence.`));
        $('#pr', body).addEventListener('click', () => window.print());
        $('#regen', body).addEventListener('click', gen);
      }
      $('#gen', body)?.addEventListener('click', gen);
      $('#next', body)?.addEventListener('click', () => nav(7));
      wireBack();
    };
    const gen = async () => { const b = $('#gen', body) || $('#regen', body); if (b) { b.disabled = true; b.textContent = '…'; } try { c = await post(`/cases/${c.id}/artefacts`); tab = c.artefacts[0].kind; } catch (e) { toast(e.message); } drawArt(); };
    drawArt();
    window.ruko = { ...(window.ruko || {}), generate: gen, approveAll: async () => { for (const a of c.artefacts) if (a.status === 'draft') c = await post(`/cases/${c.id}/desk`, { action: 'approve_artefact', kind: a.kind }); drawArt(); } };
  }

  // ---------------- step 7 ----------------
  if (step === 7) {
    const s = c.statusLine;
    body.innerHTML = `<div style="max-width:900px" class="stack">
      <div class="statusline"><span class="k">${t('rp_next')}</span>${icon('arrowRight', { size: 22 })}<span class="own">${esc(s.owner)}</span><span>${esc(s.text)}</span>${s.by ? `<span class="mono" style="opacity:.7;font-size:14px">by ${esc(s.by)}</span>` : ''}</div>
      <div class="card"><div class="row between"><h3 style="margin:0">${state.lang === 'hi' ? 'केस पूरा होने का स्तर' : 'Case completeness'}</h3><b>${s.completeness}%</b></div><div class="meter" style="margin-top:8px"><div style="width:${s.completeness}%;background:var(--ok)"></div></div></div>
      <div class="card"><h3>${state.lang === 'hi' ? 'समय-सीमाएँ (RBI सर्कुलर, 6 जुलाई 2017)' : 'Clocks (RBI circular, 6 July 2017)'}</h3>
        ${(c.clocks?.list || []).map((k) => `<div class="row between" style="border-bottom:1px dashed var(--border);padding:8px 0"><span>${esc(k.label)}${k.value ? `<div class="tiny muted">${esc(k.value)}</div>` : ''}</span><b class="mono">${esc(k.date)}</b></div>`).join('') || '<p class="muted small">Clocks appear after the case file is prepared.</p>'}
        ${c.clocks ? `<div class="callout warn" style="margin-top:12px">${esc(c.clocks.note)}</div>` : ''}</div>
      <div class="card"><h3>${state.lang === 'hi' ? 'अभी क्या करें' : 'Right now'}</h3><ul><li>${state.lang === 'hi' ? '1930 पर कॉल करें या cybercrime.gov.in पर शिकायत करें (ड्राफ़्ट तैयार है)।' : 'Call 1930 or file at cybercrime.gov.in (your draft is ready).'}</li><li>${state.lang === 'hi' ? 'बैंक पत्र अपनी ब्रांच में दें और रसीद लें।' : 'Hand the bank letter to your branch and keep the acknowledgement.'}</li><li>${state.lang === 'hi' ? 'किसी को OTP, PIN या पासवर्ड न बताएँ।' : 'Never share an OTP, PIN or password.'}</li></ul></div>
      <div class="callout bad">${icon('alert')}<span><b>${state.lang === 'hi' ? '"पैसा वापस दिलाने वालों" से सावधान।' : 'Beware of "recovery" offers.'}</b> ${state.lang === 'hi' ? 'स्कैम के बाद अक्सर दूसरा स्कैम आता है: कोई "वकील", "पुलिस" या "रिकवरी एजेंट" फ़ीस लेकर पैसा लौटाने का वादा करता है। असली रिफ़ंड सिर्फ़ आपके बैंक, 1930 और MHA के Money Restoration Module से आता है, और इसके लिए कोई फ़ीस नहीं लगती।' : 'A second scam often follows the first: a "lawyer", "police officer" or "recovery agent" promises your money back for a fee. Real refunds come only through your bank, 1930 and MHA\'s Money Restoration Module, and they never charge a fee.'}</span></div>
      <p class="small muted">${t('not_advice')}</p>
      <div class="row between"><button class="btn" id="back" type="button">${icon('arrowLeft', { size: 16 })}${t('back')}</button><button class="btn danger" id="delCase" type="button">${icon('trash', { size: 15 })}${t('delete_case')}</button></div></div>`;
    wireBack();
    $('#delCase', body).addEventListener('click', async () => { if (!confirm(state.lang === 'hi' ? 'केस और सारी फ़ाइलें हटा दें?' : 'Delete this case and all its files?')) return; await del(`/cases/${c.id}`); localStorage.removeItem('ruko_case'); toast('Deleted'); go('#/'); });
  }
}

function trailSvg(c) {
  const legs = c.moneyTrail.legs;
  const h = Math.max(220, legs.length * 120 + 40);
  const col = 'var(--text)', mut = 'var(--muted)';
  let s = `<svg viewBox="0 0 900 ${h}" role="img" aria-label="Money trail diagram" style="font-family:var(--font)">
    <defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="${col}"/></marker></defs>
    <rect x="10" y="${h / 2 - 40}" width="190" height="80" rx="12" fill="var(--surface-2)" stroke="var(--border-strong)"/>
    <text x="105" y="${h / 2 - 8}" text-anchor="middle" font-weight="700" font-size="15" fill="${col}">${esc(c.customer.name)}</text>
    <text x="105" y="${h / 2 + 16}" text-anchor="middle" font-size="13" fill="${mut}">A/c ${esc(c.customer.accountMasked)}</text>`;
  legs.forEach((l, i) => {
    const y = 40 + i * 120 + 30;
    const dash = l.confirmed ? '' : 'stroke-dasharray="6 5"';
    s += `<path d="M200 ${h / 2} C 280 ${h / 2}, 300 ${y}, 420 ${y}" fill="none" stroke="${l.confirmed ? col : 'var(--bad)'}" stroke-width="2" ${dash} marker-end="url(#ar)"/>
      <text x="335" y="${y - 12}" font-size="14" font-weight="700" fill="${col}">${esc(inr(l.amountINR))}</text>
      <rect x="424" y="${y - 40}" width="230" height="84" rx="12" fill="var(--surface)" stroke="${l.flagged ? 'var(--bad)' : 'var(--border-strong)'}" stroke-width="${l.flagged ? 2 : 1}"/>
      <text x="539" y="${y - 14}" text-anchor="middle" font-size="13.5" font-weight="700" fill="${col}">${esc(l.toName || 'Receiving account')}</text>
      <text x="539" y="${y + 6}" text-anchor="middle" font-size="12.5" font-family="var(--mono)" fill="${mut}">${esc(l.to)}</text>
      <text x="539" y="${y + 28}" text-anchor="middle" font-size="11.5" fill="${l.utr ? mut : 'var(--warn)'}">${esc(l.date || '')} · ${l.utr ? 'UTR ✓' : 'UTR missing'}</text>
      <path d="M654 ${y} L 740 ${y}" stroke="var(--muted)" stroke-width="2" stroke-dasharray="4 5" marker-end="url(#ar)"/>
      <text x="750" y="${y - 4}" font-size="12.5" fill="${mut}">onward legs</text><text x="750" y="${y + 13}" font-size="12.5" fill="${mut}">unknown (gap)</text>`;
  });
  return s + '</svg>';
}
