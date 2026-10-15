import { get, post } from '../api.js';
import { dictate } from '../dictate.js';
import { $, esc, inr, sleep, time, OUTCOME, outcomePill, mocked, toast, fileToDataUrl, emptyState } from '../ui.js';
import { t, tl, state } from '../i18n.js';
import { go } from '../main.js';
import { evidencePayload, specs, pngOf } from '../evidence-render.js';
import { startScenario } from './hub.js';
import { icon } from '../icons.js';
import { sound, say, idle, stopAll, ring, ping, prefetch, onSoundChange } from '../voice.js';

const SIGNALS = [
  ['authorityClaimed', 'Claims to be an official', 'अधिकारी होने का दावा'],
  ['safeAccountLanguage', '"Safe account" / verification / refund', '"सुरक्षित खाता" / वेरिफिकेशन'],
  ['threatOfArrestOrCase', 'Threat of arrest or case', 'गिरफ्तारी या केस की धमकी'],
  ['secrecyDemanded', 'Told to keep it secret', 'किसी को न बताने को कहा'],
  ['videoCallOngoing', 'Video call / screen share', 'वीडियो कॉल / स्क्रीन शेयर'],
  ['thirdPartyDictating', 'Someone else directing it', 'कोई और करवा रहा है'],
  ['urgencyOrDeadline', 'Deadline pressure', 'जल्दी का दबाव'],
  ['coachedAnswerLikely', 'Purpose doesn\'t fit payee (coached?)', 'कारण payee से मेल नहीं खाता'],
  ['repliesDictated', 'Replies look dictated', 'जवाब लिखवाए लगते हैं'],
];

export async function render(el, [caseId]) {
  caseId = caseId || localStorage.getItem('ruko_case');
  let c = caseId ? await get(`/cases/${caseId}`).catch(() => null) : null;
  if (!c || c.door === 'frozen_holder') {
    const hi = state.lang === 'hi';
    el.innerHTML = emptyState({
      ic: 'bank',
      title: hi ? 'भारत बैंक ऐप, Ruko के साथ' : 'The Bharat Bank app, with Ruko inside',
      body: hi ? 'एक ग्राहक चुनें और बड़ा ट्रांसफ़र करें। Ruko पेमेंट के पल पर बीच में आता है, सवाल पूछता है, और ज़रूरत हो तो पेमेंट रोकता है।' : 'Pick a customer and make a large transfer. Ruko steps in at the moment of payment, asks a few questions, and holds the payment if it needs to.',
      actions: `<button class="btn primary lg" data-s="A" type="button">${hi ? 'सीन A: स्कैम' : 'Scenario A: a scam'}${icon('arrowRight', { size: 16 })}</button><button class="btn lg" data-s="B" type="button">${hi ? 'सीन B: असली पेमेंट' : 'Scenario B: a real payment'}</button>`,
      steps: hi ? ['पेमेंट भरें', 'Ruko के सवालों के जवाब दें', 'फ़ैसला और कारण देखें'] : ['Fill in the payment', "Answer Ruko's questions", 'See the decision and why'],
    });
    el.querySelectorAll('[data-s]').forEach((b) => b.addEventListener('click', () => startScenario(b.dataset.s)));
    return;
  }
  localStorage.setItem('ruko_case', c.id);
  const scn = (await get('/scenarios')).find((s) => s.id === c.scenarioId);
  const allSpecs = await specs();
  // UI text follows the language toggle; the spoken conversation follows the case language.
  const L = () => state.lang;
  if (c.language !== state.lang) c = await post(`/cases/${c.id}/language`, { lang: state.lang });
  const REPLIES = () => (scn && state.lang !== scn.language && scn.repliesAlt?.[state.lang]) || scn?.replies || [];
  const CALLSCRIPT = () => (scn && state.lang !== scn.language && scn.callScriptAlt?.[state.lang]) || scn?.callScript || [];
  const ui = { prevOn: new Set(), seen: 0, sheetShown: false, outcomeShown: false, phoneView: c.stage === 'new' ? 'home' : null, tpView: 'lock', overrideArmed: false, busy: false, attachOpen: false, lastRukoAt: Date.now(), warnAck: false, pendingFiles: [], spoken: c.interview?.turns.length || 0, notified: (c.notifications || []).length, call: { state: 'idle', line: -1, startedAt: 0 } };
  const SPK = scn?.speaker || 'sunita';
  if (scn) post('/tts/prewarm', { scenarioId: scn.id, lang: state.lang }).catch(() => {});

  el.innerHTML = `
    <div class="row between" style="margin-bottom:16px">
      <div><h2 style="margin:0">${esc(c.customer.name)} <span class="muted small">· ${c.id}</span></h2><div class="small muted">${esc(scn ? (state.lang === 'hi' ? scn.labelHi : scn.label) : '')}</div></div>
      <div class="row"><button class="btn primary" id="auto" type="button">${icon('play')}${t('autoplay')}</button><a class="btn" href="#/desk/${c.id}">${icon('desk')}Fraud Desk</a></div>
    </div>
    <div class="stage">
      <div class="phone-wrap"><div class="phone-label">Bharat Bank app ${mocked()}</div><div class="phone" id="bankPhone"><div class="phone-notch"></div><div class="phone-screen" id="bank"></div></div></div>
      <div class="phone-wrap"><div class="phone-label">${t('tp_label')} ${mocked('Simulated')}</div><div class="phone" id="trustPhone"><div class="phone-notch"></div><div class="phone-screen" id="trust"></div></div></div>
      <div class="reason-col"><div class="card reason" id="reason"></div></div>
    </div>`;

  const bank = $('#bank', el), trust = $('#trust', el), reason = $('#reason', el);
  const statusbar = (dark) => `<div class="statusbar" style="${dark ? 'color:#fff' : ''}"><span>${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span><span>●●● 5G ▮</span></div>`;

  // ---------- Bank phone ----------
  function drawBank() {
    const iv = c.interview, p = c.payment || scn?.payment;
    const L2 = L();
    const T = (k) => tl(k, L2);
    let body = '';
    if (c.stage === 'new' && ui.phoneView === 'home') {
      body = `<div class="bb-body">
        <div class="bb-card"><div class="small" style="color:#5b6470">${T('bb_balance')} · A/c ${esc(c.customer.accountMasked)}</div><div style="font-size:28px;font-weight:800">${inr(scn?.customer.balanceINR)}</div></div>
        <button class="bb-btn" id="goSend" type="button">${icon('send', { size: 17 })}${T('bb_send')}</button>
        <div class="bb-card" style="margin-top:12px"><div class="small" style="font-weight:700;margin-bottom:6px">${T('bb_recent')}</div>
          <div class="row between small"><span>Electricity bill</span><span>−₹2,340</span></div><div class="row between small"><span>Pension credit</span><span style="color:#217a3c">+₹48,200</span></div><div class="row between small"><span>Medplus Pharmacy</span><span>−₹1,120</span></div></div></div>`;
    } else if (c.stage === 'new') {
      const ss = p.sessionSignals || {};
      body = `<div class="bb-body"><form id="payForm">
        <div class="bb-card stack">
          <div class="pill acc">${T('bb_new')}</div>
          <label class="field"><span>${T('bb_payee')}</span><input type="text" name="payeeName" value="${esc(p.payeeName)}"></label>
          <label class="field"><span>${T('bb_acct')}</span><input type="text" name="payeeAccount" value="${esc(p.payeeAccount)}"></label>
          <div class="row" style="flex-wrap:nowrap"><label class="field" style="flex:1"><span>${T('bb_ifsc')}</span><input type="text" name="payeeIFSC" value="${esc(p.payeeIFSC)}"></label>
          <label class="field" style="width:110px"><span>${T('bb_rail')}</span><select name="rail">${['UPI', 'IMPS', 'NEFT', 'RTGS'].map((r) => `<option ${r === p.rail ? 'selected' : ''}>${r}</option>`).join('')}</select></label></div>
          <label class="field"><span>${T('bb_amt')}</span><input type="number" name="amountINR" value="${p.amountINR}"></label>
        </div>
        <details class="bb-card" ${ss.activeVideoCall ? 'open' : ''}><summary class="small" style="font-weight:700;cursor:pointer">${T('bb_signals')} </summary>
          <div class="tiny" style="color:#8a6d00;margin:6px 0">A real bank SDK would see these. Here you set them.</div>
          <label class="switch" style="color:#1b1a18"><input type="checkbox" name="activeVideoCall" ${ss.activeVideoCall ? 'checked' : ''}> ${T('bb_video')}</label>
          <label class="switch" style="color:#1b1a18"><input type="checkbox" name="activeScreenShare" ${ss.activeScreenShare ? 'checked' : ''}> ${T('bb_share')}</label>
          <label class="switch" style="color:#1b1a18"><input type="checkbox" name="remoteAccessApp" ${ss.remoteAccessApp ? 'checked' : ''}> ${T('bb_remote')}</label>
        </details>
        <button class="bb-btn" type="submit" id="payBtn">${T('bb_pay')} ${inr(p.amountINR)}</button></form></div>`;
    } else if (iv && !(c.stage === 'paid' && ui.warnAck) && !['overridden', 'evidence', 'facts', 'trail', 'artefacts', 'cancelled'].includes(c.stage) && !(c.hold?.status === 'released')) {
      body = `<div class="bb-body" style="filter:blur(2px);opacity:.6"><div class="bb-card">${inr(p.amountINR)} → ${esc(p.payeeName)}</div></div>
        <div class="sheet ${ui.sheetShown ? '' : 'anim'}" role="dialog" aria-label="${T('ruko_title')}">
          <div class="sheet-head"><div class="row between"><div class="t">${icon('shieldCheck', { size: 18 })} ${T('ruko_title')}</div><button class="icon-btn" id="voiceT" aria-label="${sound.on ? 'Mute voice' : 'Turn voice on'}" aria-pressed="${sound.on}" title="${sound.on ? 'Voice on' : 'Voice off'}" type="button" style="width:36px;height:36px">${icon(sound.on ? 'volume' : 'volumeOff', { size: 17 })}</button></div><div class="tiny" style="color:#6b6862">${T('ruko_sub')}</div></div>
          <div class="chat" id="chat" aria-live="polite">${chatHtml(iv, L2)}${ui.busy ? `<div class="typing" aria-label="${L2 === 'hi' ? 'Ruko सोच रहा है' : 'Ruko is thinking'}"><i></i><i></i><i></i></div>` : ''}</div>
          ${iv.done ? '' : `<div class="composer" style="position:relative">
            ${ui.attachOpen ? attachPop(L2) : ''}
            <button class="icon-btn" id="attachBtn" type="button" title="${T('attach')}" aria-label="${T('attach')}">${icon('clip')}</button>
            <button class="icon-btn" id="micBtn" type="button" title="Speak (browser speech)" aria-label="Speak">${icon('mic')}</button>
            <textarea id="ans" rows="1" placeholder="${T('type_here')}" aria-label="${T('type_here')}"></textarea>
            <button class="icon-btn send" id="sendBtn" type="button" aria-label="Send">${icon('send', { size: 17 })}</button>
          </div>`}
          ${ui.pendingFiles.length ? `<div class="tiny" style="padding:0 12px 8px;color:#6b6862">${icon('clip', { size: 13 })} ${ui.pendingFiles.map((f) => esc(f.title || f.fileName)).join(', ')}</div>` : ''}
        </div>`;
    } else if (c.paymentStatus === 'cancelled') {
      const adv = c.trustedAdvice;
      const advWho = adv ? (L2 === 'hi' ? `आपके ${adv.relationHi || adv.relation} ${adv.by.split(' ')[0]}` : `Your ${adv.relation} ${adv.by.split(' ')[0]}`) : '';
      body = `<div class="bb-body" style="display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:14px">
        <div style="width:84px;height:84px;border-radius:50%;background:#e7f5ec;display:grid;place-items:center;color:#157a3c">${icon('shieldCheck', { size: 40 })}</div>
        <div style="font-size:20px;font-weight:800">${T('bb_cancelled')}</div>
        <div><s style="opacity:.6">${inr(p.amountINR)} → ${esc(p.payeeName)}</s></div>
        <div class="bb-card" style="text-align:left;font-size:14.5px">${T('bb_cancelled_body')}${adv?.verdict === 'scam' ? ` ${esc(advWho)} ${T('bb_cancelled_advice')}` : ''}</div>
        <div class="tiny" style="color:#5b6470">${icon('phone', { size: 12 })} 1930 · cybercrime.gov.in</div>
      </div>`;
    } else {
      const sent = c.paymentStatus === 'sent';
      body = `<div class="bb-body" style="display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:14px">
        <div style="width:84px;height:84px;border-radius:50%;background:${sent ? '#e5f3e9' : '#fdeee6'};display:grid;place-items:center;color:${sent ? '#157a3c' : '#b45309'}">${icon(sent ? 'check' : 'pause', { size: 38 })}</div>
        <div style="font-size:20px;font-weight:800">${sent ? T('bb_sent') : 'On hold'}</div>
        <div>${inr(p.amountINR)} → ${esc(p.payeeName)}</div>
        ${c.stage !== 'paid' ? `<div class="bb-card" style="text-align:left;font-size:14.5px">${T('saved_case')}</div><button class="bb-btn" id="openCase" type="button">${T('open_case')}</button>` : ''}
      </div>`;
    }
    bank.innerHTML = statusbar(false) + `<div class="bb-head"><div class="bank">${icon('bank', { size: 16 })} BHARAT BANK</div><div class="tiny" style="opacity:.8">${esc(c.customer.name)}</div></div>` + body;
    const chat = $('#chat', bank); if (chat) chat.scrollTop = chat.scrollHeight;
    // Animate only what is new on this draw.
    if ($('.sheet', bank)) ui.sheetShown = true;
    if (iv) ui.seen = iv.turns.length;
    if ($('.outcome', bank)) ui.outcomeShown = true;
    wireBank();
  }

  function chatHtml(iv, L2) {
    const T = (k) => tl(k, L2);
    let h = iv.turns.map((m, i) => {
      const fresh = i >= ui.seen ? ' pop' : '';
      if (m.role === 'customer') {
        const att = (m.attached || []).map((id) => { const ev = c.evidence.find((e) => e.id === id); return ev ? `<img src="${ev.url}" alt="${esc(ev.title)}">` : ''; }).join('');
        return `<div class="msg cust${fresh}">${esc(m.text)}${att ? `<div class="att">${att}</div>` : ''}</div>`;
      }
      return m.kind === 'advice' ? `<div class="msg ruko advice-msg ${m.verdict}${fresh}">${icon(m.verdict === 'scam' ? 'alert' : 'info', { size: 18 })}<span>${esc(m.text)}</span></div>` : m.kind === 'truth' ? `<div class="msg ruko truth${fresh}">${icon('alert', { size: 18 })}<span>${esc(m.text)}</span></div>` : `<div class="msg ruko${fresh}">${esc(m.text)}</div>`;
    }).join('');
    if (iv.done) {
      const o = iv.outcome, O = OUTCOME[o];
      h += `<div class="outcome ${o}${ui.outcomeShown ? '' : ' anim'}"><div class="ot">${icon({ proceed: 'check', proceed_with_warning: 'alert', hold_trusted_contact: 'pause', escalate: 'stop' }[o], { size: 18 })} ${O[L2] || O.en}</div>`;
      if (o === 'hold_trusted_contact' || o === 'escalate') {
        h += `<div class="small" style="margin:6px 0">${T('hold_left')}: <span class="countdown" data-until="${c.hold?.until}">24:00:00</span></div>`;
        if (c.hold?.status === 'active') {
          const adv = c.trustedAdvice;
          const advWho = adv ? (L2 === 'hi' ? `आपके ${adv.relationHi || adv.relation} ${adv.by.split(' ')[0]}` : `Your ${adv.relation} ${adv.by.split(' ')[0]}`) : '';
          h += `<div class="stack" style="margin-top:8px">
            ${adv ? `<div class="advice ${adv.verdict}">${icon(adv.verdict === 'scam' ? 'alert' : 'info', { size: 16 })}<span><b>${esc(advWho)}</b> ${T(adv.verdict === 'scam' ? 'adv_scam' : 'adv_genuine')}</span></div>` : ''}
            <button class="bb-btn" id="cancelPay" type="button" style="background:${adv?.verdict === 'scam' ? '#b42318' : '#0f2a4f'}">${icon('stop', { size: 17 })}${T('bb_cancel')}</button>
            ${adv ? '' : `<button class="bb-btn alt" id="callTc" type="button" style="min-height:44px">${icon('phone', { size: 16 })}${T('call_contact')}</button>`}
            ${ui.overrideArmed ? `<div class="tiny" style="color:#b42318">${T('override_confirm')}</div>` : ''}
            <button class="bb-btn alt" id="override" type="button" style="min-height:40px;font-size:14px">${adv ? T('send_anyway') : T('override')}</button></div>`;
        }
      } else if (o === 'proceed_with_warning' || o === 'proceed') {
        h += `<button class="bb-btn" id="ackWarn" type="button" style="margin-top:8px">${T('continue')}</button>`;
      }
      h += '</div>';
    }
    return h;
  }

  function attachPop(L2) {
    const ids = scn ? allSpecs.scenario.filter((s) => s.scenario === scn.id).map((s) => s.id) : [];
    return `<div class="attach-pop"><div class="tiny" style="font-weight:700;color:#6b6862;padding:4px 10px">${tl('from_samples', L2)}</div>
      ${ids.map((id) => { const s = allSpecs.scenario.find((x) => x.id === id); return `<button type="button" data-sample="${id}"><img data-thumb="${id}" alt="">${esc(s.title)}</button>`; }).join('')}
      <label><input type="file" id="fileIn" accept="image/*,application/pdf,audio/*" hidden><button type="button" id="pickFile">${icon('upload')} ${tl('upload_file', L2)}</button></label></div>`;
  }

  function wireBank() {
    $('#goSend', bank)?.addEventListener('click', () => { ui.phoneView = 'form'; drawBank(); });
    $('#payForm', bank)?.addEventListener('submit', async (e) => { e.preventDefault(); await pay(new FormData(e.target)); });
    $('#sendBtn', bank)?.addEventListener('click', () => send());
    $('#ans', bank)?.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
    $('#attachBtn', bank)?.addEventListener('click', () => { ui.attachOpen = !ui.attachOpen; drawBank(); thumbs(); });
    bank.querySelectorAll('[data-sample]').forEach((b) => b.addEventListener('click', async () => { ui.pendingFiles.push(await evidencePayload(b.dataset.sample)); ui.attachOpen = false; drawBank(); }));
    $('#pickFile', bank)?.addEventListener('click', () => $('#fileIn', bank).click());
    $('#fileIn', bank)?.addEventListener('change', async (e) => { const f = e.target.files[0]; if (!f) return; ui.pendingFiles.push({ dataUrl: await fileToDataUrl(f), fileName: f.name, title: f.name }); ui.attachOpen = false; drawBank(); });
    $('#micBtn', bank)?.addEventListener('click', listen);
    $('#voiceT', bank)?.addEventListener('click', () => { sound.on = !sound.on; drawBank(); if (sound.on) speakNew(); });
    $('#override', bank)?.addEventListener('click', override);
    $('#callTc', bank)?.addEventListener('click', () => playCall());
    $('#cancelPay', bank)?.addEventListener('click', () => cancelByCustomer());
    $('#ackWarn', bank)?.addEventListener('click', () => { ui.warnAck = true; drawBank(); });
    $('#openCase', bank)?.addEventListener('click', () => go(`#/case/${c.id}/1`));
  }
  async function thumbs() { for (const img of bank.querySelectorAll('[data-thumb]')) { const s = allSpecs.scenario.find((x) => x.id === img.dataset.thumb); img.src = await pngOf(s); } }

  async function pay(fd) {
    const p = { ...(scn?.payment || {}), payeeName: fd.get('payeeName'), payeeAccount: fd.get('payeeAccount'), payeeIFSC: fd.get('payeeIFSC'), rail: fd.get('rail'), amountINR: Number(fd.get('amountINR')), sessionSignals: { activeVideoCall: !!fd.get('activeVideoCall'), activeScreenShare: !!fd.get('activeScreenShare'), remoteAccessApp: !!fd.get('remoteAccessApp') } };
    c = await post(`/cases/${c.id}/pay`, { payment: p });
    ui.lastRukoAt = Date.now();
    ui.spoken = 0;
    drawAll();
    speakNew();
  }

  async function send(text, files) {
    const box = $('#ans', bank);
    text = text ?? box?.value.trim();
    files = files ?? ui.pendingFiles;
    if (!text && !files.length) return;
    const latencyMs = Date.now() - ui.lastRukoAt;
    // optimistic render
    c.interview.turns.push({ role: 'customer', text: text || '📎', attached: [] });
    ui.pendingFiles = []; ui.busy = true; drawAll();
    try {
      c = await post(`/cases/${c.id}/turn`, { text, latencyMs, evidence: files, voice: sound.on });
    } catch (e) { toast(e.message); c = await get(`/cases/${c.id}`); }
    ui.busy = false; ui.lastRukoAt = Date.now();
    drawAll();
    speakNew();
  }

  async function override() {
    if (!ui.overrideArmed) { ui.overrideArmed = true; drawBank(); return; }
    c = await post(`/cases/${c.id}/override`);
    ui.tpView = 'lock'; // the trusted contact gets a "sent anyway" alert
    drawAll();
    speakNew();
  }

  // Speak every Ruko line that has not been spoken yet, in order (Gemini voice, cached).
  function speakNew() {
    const turns = c.interview?.turns || [];
    for (let i = ui.spoken; i < turns.length; i++) if (turns[i].role === 'ruko') say(turns[i].text, { speaker: 'ruko', lang: /[\u0900-\u097F]/.test(turns[i].text) ? 'hi' : 'en' });
    ui.spoken = turns.length;
    if ((c.notifications || []).length > ui.notified) { ui.notified = c.notifications.length; idle().then(() => ping()); }
  }

  // The second-channel call: ringback, then the scripted conversation with captions.
  const CALL_FALLBACK = [{ speaker: 'amit', text: L() === 'hi' ? 'माँ, बैंक से मैसेज आया है। आप ठीक हो? कोई भी पैसा मत भेजना, मैं आ रहा हूँ।' : 'Bank sent me a message. Are you okay? Please do not send any money, I am coming over.' }];
  async function playCall() {
    if (ui.call.state === 'ringing' || ui.call.state === 'live') return;
    const script = CALLSCRIPT().length ? CALLSCRIPT() : CALL_FALLBACK;
    stopAll();
    script.forEach((l) => prefetch(l.speaker, l.text));
    ui.tpView = 'call'; ui.call = { state: 'ringing', line: -1, startedAt: 0 }; drawTrust();
    await ring(2);
    if (ui.tpView !== 'call') return;
    ui.call = { state: 'live', line: -1, startedAt: Date.now() }; drawTrust();
    for (let i = 0; i < script.length; i++) {
      if (ui.call.state !== 'live') return;
      ui.call.line = i; drawTrust();
      await say(script[i].text, { speaker: script[i].speaker, lang: state.lang });
      if (!sound.on) await sleep(2600); // captions still advance when muted
    }
    ui.call.state = 'ended'; drawTrust();
    post(`/cases/${c.id}/desk`, { action: 'call', note: 'Trusted contact called the customer on a second channel (simulated)' }).catch(() => {});
    await sleep(1600);
    if (ui.call.state === 'ended') { ui.tpView = 'sms'; drawTrust(); }
  }
  function listen() {
    const btn = $('#micBtn', bank);
    dictate({
      lang: L(), button: btn,
      onState: (st) => { if (st === 'recording') toast(L() === 'hi' ? 'बोलिए… रुकने के लिए फिर से माइक दबाएँ' : 'Speak now… tap the mic again to stop'); if (st === 'transcribing') toast(L() === 'hi' ? 'Gemini लिख रहा है…' : 'Gemini is writing it down…'); },
      onText: (text) => { const a = $('#ans', bank); if (a) { a.value = text; a.focus(); } },
      onError: (m) => toast(m),
    });
  }

  // ---------- Trusted phone ----------
  function drawTrust() {
    const tc = c.trustedContacts?.[0];
    const n = c.notifications?.at(-1); // newest message on the lock screen
    const now = new Date();
    if (!tc) { trust.innerHTML = statusbar(true) + `<div class="lock"><div class="clock">${now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })}</div><div class="small" style="margin-top:30px;opacity:.7;padding:0 30px;text-align:center">No trusted contact nominated.</div></div>`; return; }
    if (ui.tpView === 'call') {
      const script = CALLSCRIPT().length ? CALLSCRIPT() : CALL_FALLBACK;
      const line = script[ui.call.line];
      const hiC = state.lang === 'hi';
      const who = (sp) => (sp === 'amit' ? (hiC ? `${tc.name.split(' ')[0]} (आप)` : `${tc.name.split(' ')[0]} (you)`) : c.customer.name.split(' ')[0]);
      const status = ui.call.state === 'ringing' ? (hiC ? 'घंटी जा रही है…' : 'Ringing…') : ui.call.state === 'ended' ? (hiC ? 'कॉल समाप्त' : 'Call ended') : `<span class="call-timer mono" data-start="${ui.call.startedAt}">00:00</span>`;
      trust.innerHTML = statusbar(true) + `<div class="call-screen ${ui.call.state}">
        <div class="avatar">${icon('user', { size: 44 })}</div>
        <div style="font-size:22px;font-weight:700">${esc(c.customer.name)}</div>
        <div style="opacity:.85">${status}</div>
        <div class="caption" aria-live="polite">${line ? `<span class="spk">${icon(sound.on ? 'volume' : 'volumeOff', { size: 12 })}${esc(who(line.speaker))}</span>${esc(line.text)}` : `<span class="spk">${hiC ? 'लाइव कैप्शन' : 'Live captions'}</span>…`}</div>
        <div class="call-actions"><button class="call-btn" id="muteC" type="button" aria-pressed="${!sound.on}" aria-label="${sound.on ? 'Mute' : 'Unmute'}">${icon(sound.on ? 'volume' : 'volumeOff', { size: 22 })}</button>
        <button class="hang" id="hang" type="button" aria-label="End call">${icon('phone', { size: 26 })}</button></div></div>`;
      $('#hang', trust).addEventListener('click', () => { stopAll(); ui.call.state = 'ended'; ui.tpView = n ? 'sms' : 'lock'; drawTrust(); });
      $('#muteC', trust).addEventListener('click', () => { sound.on = !sound.on; drawTrust(); });
      return;
    }
    if (ui.tpView === 'sms' && n) {
      trust.innerHTML = statusbar(false) + `<div class="sms-view"><div class="hd">BX-BHRTBK</div><div class="bd">${c.notifications.map((m) => `<div class="tiny" style="text-align:center;color:#8e8e93;margin:10px 0 8px">${time(m.at)}</div><div class="sms-bubble ${m.kind || 'hold'}">${esc(m.text)}</div>`).join('')}
        <button class="bb-btn" id="tpCall" type="button" style="margin-top:16px;background:#157a3c">${icon('phone', { size: 17 })} ${tl('tp_call', state.lang)} ${esc(c.customer.name.split(' ')[0])}</button>
        ${tcActions()}</div></div>`;
      $('#tpCall', trust).addEventListener('click', () => playCall());
      wireTc();
      return;
    }
    trust.innerHTML = statusbar(true) + `<div class="lock"><div class="clock">${now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })}</div><div class="date">${now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      <div class="tiny" style="opacity:.6;margin-top:6px">${esc(tc.name)} · ${esc(tc.relation)}</div>
      ${n ? `<div class="notif" id="notif" role="button" tabindex="0"><div class="app"><span>${icon('message', { size: 12 })} Messages · BX-BHRTBK</span><span>${time(n.at)}</span></div><div style="margin-top:4px">${esc(n.text.slice(0, 120))}…</div><div class="tiny" style="color:#777;margin-top:4px">${tl('tp_tap', state.lang)}</div></div>` : ''}</div>`;
    $('#notif', trust)?.addEventListener('click', () => { ui.tpView = 'sms'; drawTrust(); });
  }

  // The trusted contact can only advise. Cancelling or sending stays with the customer.
  function tcActions() {
    const T = (k) => tl(k, state.lang);
    const adv = c.trustedAdvice;
    if (c.paymentStatus !== 'held') return ''; // decided: the thread above already says how
    if (adv) return `<div class="tc-done ${adv.verdict === 'scam' ? 'ok' : ''}">${icon(adv.verdict === 'scam' ? 'shieldCheck' : 'info', { size: 16 })}<span>${T(adv.verdict === 'scam' ? 'tc_told_scam' : 'tc_told_genuine')}</span></div>`;
    return `<div class="tc-box"><div class="tiny" style="color:#5b6470;margin-bottom:8px">${T('tc_only_advice')}</div>
      <button class="bb-btn" id="tcScam" type="button" style="background:#b42318">${icon('alert', { size: 17 })}${T('tc_scam')}</button>
      <button class="bb-btn alt" id="tcGenuine" type="button" style="margin-top:8px;min-height:42px">${T('tc_genuine')}</button></div>`;
  }
  function wireTc() {
    $('#tcScam', trust)?.addEventListener('click', () => adviseByContact('scam'));
    $('#tcGenuine', trust)?.addEventListener('click', () => adviseByContact('genuine'));
  }
  async function adviseByContact(verdict) {
    try { c = await post(`/cases/${c.id}/trusted`, { verdict }); } catch (e) { toast(e.message); return; }
    ping();
    drawAll();
    speakNew(); // Ruko reads the son's message out in her app
  }
  async function cancelByCustomer() {
    try { c = await post(`/cases/${c.id}/cancel`); } catch (e) { toast(e.message); return; }
    stopAll(); ui.overrideArmed = false;
    ui.tpView = 'lock'; // the trusted contact gets a "cancelled" message
    drawAll();
    speakNew();
  }

  // ---------- Reasoning panel ----------
  function drawReason() {
    const iv = c.interview;
    const hi = state.lang === 'hi';
    if (!c.trigger) {
      reason.innerHTML = `<div class="card-head"><h3>${icon('cpu')}Agent reasoning</h3><span class="tiny muted">${hi ? 'फ़्रॉड डेस्क को दिखता है' : 'visible to the fraud desk'}</span></div>
        <div class="callout info">${icon('info')}<span>${hi ? 'बैंक ऐप में <b>भेजें</b> दबाएँ। सबसे पहले ट्रिगर चलता है (सिर्फ़ कोड, AI नहीं): नया payee, रकम बनाम इतिहास, payee खाते की उम्र, सेशन संकेत, payee का नाम।' : 'Press <b>Pay</b> in the bank app. The trigger runs first (pure code, no AI): new payee, amount vs history, payee account age, session signals, payee name.'}</span></div>`;
      return;
    }
    const d = iv?.decision, sig = iv?.signals || {};
    const score = d?.score ?? 0;
    const pct = Math.max(0, Math.min(1, score / 20));
    const col = score >= 9 ? 'var(--bad)' : score >= 5 ? 'var(--warn)' : score >= 2 ? 'var(--accent)' : 'var(--ok)';
    const band = score >= 9 ? 3 : score >= 5 ? 2 : score >= 2 ? 1 : 0;
    const C = 2 * Math.PI * 52, arc = C * 0.75;
    const gauge = `<div class="gauge" role="img" aria-label="Risk score ${score}"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" fill="none" stroke="var(--surface-3)" stroke-width="10" stroke-linecap="round" stroke-dasharray="${arc} ${C}"/><circle class="arc" cx="60" cy="60" r="52" fill="none" stroke="${col}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${arc} ${C}" stroke-dashoffset="${arc * (1 - pct)}"/></svg><div class="val"><div><b style="color:${col}">${score}</b><span>${hi ? 'जोखिम' : 'risk'}</span></div></div></div>`;
    const TH = [['≤ 1', hi ? 'आगे बढ़ें' : 'Proceed', 'var(--ok)'], ['2–4', hi ? 'चेतावनी' : 'Warn', 'var(--accent)'], ['5–8', hi ? 'रोक + भरोसेमंद व्यक्ति' : 'Hold + trusted contact', 'var(--warn)'], ['≥ 9', hi ? 'रोक + फ़्रॉड डेस्क' : 'Hold + fraud desk', 'var(--bad)']];
    const step = (n, label, tag) => `<div class="trace-h"><span class="step">${n}</span>${label}<span class="tag">${tag}</span></div>`;
    reason.innerHTML = `
      <div class="card-head"><h3>${icon('cpu')}Agent reasoning</h3><span class="pill ${sig.source === 'gemini' ? 'ok' : 'warn'}">${icon(sig.source === 'gemini' ? 'sparkles' : 'layers')}${sig.source === 'gemini' ? 'Gemini signals' : 'Rule signals'}</span></div>
      <div class="gauge-row">${gauge}<div class="thresholds">${TH.map((x, i) => `<div class="${i === band ? 'on' : ''}"><i style="background:${x[2]}"></i><span class="mono" style="width:34px">${x[0]}</span>${x[1]}</div>`).join('')}</div></div>
      <div style="margin-top:12px">${iv?.done ? outcomePill(iv.outcome, state.lang) : iv ? `<span class="pill">${icon('message')}${hi ? 'बातचीत जारी' : 'Interview in progress'} · ${iv.turns.filter((x) => x.role === 'customer').length}/8</span>` : ''}</div>
      ${step(1, 'Trigger', hi ? 'कोड' : 'code')}
      ${c.trigger.triggered ? c.trigger.reasons.map((r) => `<div class="sig on"><span class="ic-wrap">${icon('zap', { size: 13 })}</span><span>${esc(r.text)}</span></div>`).join('') : `<div class="sig good"><span class="ic-wrap">${icon('check', { size: 13 })}</span><span>${hi ? 'कोई ट्रिगर नहीं। बिना सवाल पेमेंट गया।' : 'No trigger. Sent without questions.'}</span></div>`}
      ${iv ? `
      ${step(2, hi ? 'ग्राहक के अपने शब्द' : 'Signals, in the customer\'s words', sig.source === 'gemini' ? 'gemini + quote check' : 'rules')}
      ${SIGNALS.map(([k, en, hiL]) => { const v = sig[k]; const on = v?.value; const fresh = on && !ui.prevOn.has(k) ? ' fresh' : ''; return `<div class="sig ${on ? 'on' : 'off'}${fresh}"><span class="ic-wrap">${on ? icon('alert', { size: 13 }) : ''}</span><span>${hi ? hiL : en}${on && (v.quote || v.reason) ? `<q>${esc(v.quote || v.reason)}</q>` : ''}${k === 'authorityClaimed' && on && v.agency ? ` <span class="pill bad">${esc(v.agency)}</span>` : ''}</span></div>`; }).join('')}
      ${(sig.legitimacyIndicators || []).map((l) => `<div class="sig good"><span class="ic-wrap">${icon('check', { size: 13 })}</span><span>${esc(l.indicator)}<q>${esc(l.quote)}</q></span></div>`).join('')}
      ${step(3, hi ? 'जाने-माने स्कैम स्क्रिप्ट' : 'Known scam scripts', 'library · 15')}
      ${(iv.scriptMatches || []).length ? iv.scriptMatches.map((s) => `<div class="sig on"><span class="ic-wrap">${icon('link', { size: 13 })}</span><span><b>${esc(s.scriptId)}</b> ${esc(s.name)} <span class="tiny muted">(${esc(s.stage)})</span><q>${esc(s.quote)}</q></span></div>`).join('') : `<div class="sig off"><span class="ic-wrap"></span><span>${hi ? 'अभी कोई मेल नहीं' : 'No match yet'}</span></div>`}
      ${(iv.verifierFlags || []).map((f) => `<div class="sig on"><span class="ic-wrap">${icon('flag', { size: 13 })}</span><span>${esc(f.text)} ${mocked()}</span></div>`).join('')}
      ${step(4, hi ? 'फ़ैसला' : 'Decision', hi ? 'कोड' : 'code')}
      ${d ? `<div class="tablewrap" style="max-height:none"><table class="t"><tbody>${d.contributions.map((x) => `<tr><td class="small">${esc(x.label)}</td><td class="num" style="text-align:right;font-weight:700;color:${x.points > 0 ? 'var(--bad)' : 'var(--ok)'}">${x.points > 0 ? '+' : ''}${x.points}</td></tr>`).join('')}<tr><td class="small"><b>${hi ? 'कुल' : 'Total'}</b></td><td class="num" style="text-align:right;font-weight:800">${score}</td></tr></tbody></table></div>` : ''}
      ${(iv.geminiNotes || []).length ? `<div class="tiny muted" style="margin-top:10px;display:flex;gap:6px">${icon('info', { size: 13 })}<span>${iv.geminiNotes.slice(-2).map(esc).join('<br>')}</span></div>` : ''}` : ''}`;
  }

  function rememberSignals() { const sig = c.interview?.signals || {}; ui.prevOn = new Set(SIGNALS.map(([k]) => k).filter((k) => sig[k]?.value)); }
  function drawAll() { drawBank(); drawTrust(); drawReason(); rememberSignals(); }
  drawAll();

  // countdown + light polling (desk actions from another tab show up here)
  const tick = setInterval(() => {
    el.querySelectorAll('.call-timer').forEach((n) => { const s = Math.max(0, Math.floor((Date.now() - Number(n.dataset.start)) / 1000)); n.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; });
    el.querySelectorAll('.countdown').forEach((n) => {
      const ms = new Date(n.dataset.until) - Date.now();
      if (ms > 0) { const h = Math.floor(ms / 3600e3), m = Math.floor((ms % 3600e3) / 60e3), s = Math.floor((ms % 60e3) / 1e3); n.textContent = [h, m, s].map((x) => String(x).padStart(2, '0')).join(':'); }
    });
  }, 1000);

  // ---------- auto-play (used by the button and the tour) ----------
  async function autoplay() {
    if (!scn) return;
    if (c.stage === 'new') {
      ui.phoneView = 'form'; drawBank(); await sleep(1200);
      const f = $('#payForm', bank); if (f) await pay(new FormData(f));
      await sleep(1500);
    }
    while (c.interview && !c.interview.done) {
      const i = c.interview.turns.filter((m) => m.role === 'customer').length;
      const r = REPLIES()[i];
      if (!r) { c = await post(`/cases/${c.id}/end`); drawAll(); speakNew(); break; }
      prefetch(SPK, r.text);
      await idle();                       // let Ruko finish speaking first
      await sleep(sound.on ? 500 : Math.min(r.delay, 1600));
      const voiceDone = say(r.text, { speaker: SPK, lang: state.lang }); // the customer answers out loud
      const box = $('#ans', bank);
      // At most 12 frames: background tabs throttle timers, so many tiny sleeps would stall auto-play.
      const stepN = Math.max(3, Math.ceil(r.text.length / 12));
      if (box) for (let k = stepN; k < r.text.length + stepN; k += stepN) { box.value = r.text.slice(0, k); await sleep(45); }
      const files = [];
      for (const id of r.evidence || []) files.push(await evidencePayload(id));
      await voiceDone;
      await send(r.text, files);
    }
    await idle();
  }
  $('#auto', el).addEventListener('click', autoplay);
  // Keep the phone's speaker icons in sync when sound is toggled from the top bar or palette.
  const offSound = onSoundChange(() => { drawBank(); drawTrust(); });
  window.ruko = { ...(window.ruko || {}), autoplay, override: async () => { ui.overrideArmed = true; await override(); }, showSms: () => { ui.tpView = 'sms'; drawTrust(); }, playCall, adviseByContact, cancelByCustomer, caseId: () => c.id };

  return () => { clearInterval(tick); offSound(); stopAll(); };
}
