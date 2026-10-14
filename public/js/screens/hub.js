import { get, post } from '../api.js';
import { esc, inr, dt, outcomePill, toast } from '../ui.js';
import { t, state, setLang } from '../i18n.js';
import { go, app, refreshConfig } from '../main.js';
import { startTour } from '../tour.js';
import { icon } from '../icons.js';

export async function startScenario(id) {
  const scns = await get('/scenarios');
  const s = scns.find((x) => x.id === id);
  // Keep the language the user chose; the scenario follows it.
  const c = await post('/cases', { scenarioId: id, language: state.lang });
  localStorage.setItem('ruko_case', c.id);
  go(s.door === 'frozen_holder' ? `#/case/${c.id}/1` : `#/bank/${c.id}`);
  return c;
}

// The hero console replays a 20-second slice of Scenario A on a loop.
const SCRIPT = {
  en: [
    ['ruko', 'For transfers like this to a new payee, I ask a couple of quick questions. What is this payment for?'],
    ['cust', 'Buying property for my son.'],
    ['sig', 'purpose ≠ payee "RBI Verification Cell" → coached?', 6],
    ['ruko', 'What is the builder\'s name, and when did you last visit the site?'],
    ['cust', 'An officer is on a video call. He said it is RBI verification.'],
    ['sig', 'authority + "safe account" + video call', 19],
    ['ruko', 'No police or government agency in India asks for payment on a video call. Ever.'],
    ['out', 'Payment held for 24 h · son notified on a second channel', 25],
  ],
  hi: [
    ['ruko', 'नए payee को इतने बड़े ट्रांसफ़र पर मैं दो-तीन छोटे सवाल पूछता हूँ। यह पेमेंट किस लिए है?'],
    ['cust', 'बेटे के लिए प्रॉपर्टी ले रही हूँ।'],
    ['sig', 'कारण ≠ payee "RBI Verification Cell" → रटा हुआ जवाब?', 6],
    ['ruko', 'बिल्डर का नाम क्या है, और आपने साइट आख़िरी बार कब देखी थी?'],
    ['cust', 'एक अधिकारी वीडियो कॉल पर हैं। उन्होंने कहा यह RBI वेरिफिकेशन है।'],
    ['sig', 'अधिकारी + "सुरक्षित खाता" + वीडियो कॉल', 19],
    ['ruko', 'भारत में कोई भी पुलिस या सरकारी एजेंसी वीडियो कॉल पर पैसे नहीं मांगती। कभी नहीं।'],
    ['out', 'पेमेंट 24 घंटे के लिए रोका गया · बेटे को दूसरे चैनल पर सूचना', 25],
  ],
};

export async function render(el) {
  const [scns, cases] = await Promise.all([get('/scenarios'), get('/cases')]);
  const L = state.lang, hi = L === 'hi';
  const tone = { A: 'var(--bad)', B: 'var(--ok)', C: 'var(--info)' };
  const tag = { A: hi ? 'डिजिटल अरेस्ट स्कैम' : 'Digital-arrest scam', B: hi ? 'असली पेमेंट' : 'Legitimate payment', C: hi ? 'गलत फ़्रीज़ खाता' : 'Wrongly frozen account' };
  const tagCls = { A: 'bad', B: 'ok', C: 'info' };
  const expect = {
    A: [hi ? 'रोक + बेटे को सूचना, फिर ओवरराइड और केस फ़ाइल' : 'Hold + son notified, then override and case file', 'stop'],
    B: [hi ? 'पेमेंट आगे बढ़े। कभी रोका न जाए।' : 'Payment goes through. Never held.', 'shieldCheck'],
    C: [hi ? '₹6.4 लाख के फ़्रीज़ को ₹9,000 के lien तक सीमित करने की माँग' : 'Limit a ₹6.4 lakh freeze to a ₹9,000 lien', 'snow'],
  };

  el.innerHTML = `
  <section class="hero">
    <div>
      <div class="eyebrow">${t('hub_eyebrow')}</div>
      <h1>${hi ? 'पेमेंट के <em>पल</em> पर स्कैम रोको।' : 'Stop the scam at the <em>moment</em> of payment.'}</h1>
      <p class="pitch">${t('hub_pitch')}</p>
      <div class="hero-cta">
        <button class="btn primary lg" id="judge" type="button">${icon('play')}${hi ? 'जज डेमो · 3 मिनट' : 'Judge demo · 3 min'}</button>
        <button class="btn lg" id="tour2" type="button">${icon('sparkles')}${hi ? 'गाइडेड टूर (Hinglish)' : 'Guided tour (Hinglish)'}</button>
      </div>
      <div class="trust-row">
        <span>${icon('cpu')}${hi ? 'LLM पढ़ता है, कोड फ़ैसला करता है' : 'LLM extracts, code decides'}</span>
        <span>${icon('fingerprint')}${hi ? 'हर तथ्य अपने सबूत से जुड़ा' : 'Every fact cited to its pixel'}</span>
        <span>${icon('languages')}${hi ? 'हिंदी और English' : 'Hindi and English'}</span>
      </div>
    </div>
    <div class="console" aria-label="${hi ? 'लाइव इंटरवेंशन का नमूना' : 'Sample live intervention'}">
      <div class="console-head"><span>ruko · intervention · RTGS ₹18,00,000</span><span class="live"><i></i>${hi ? 'लाइव' : 'live'}</span></div>
      <div class="console-body" id="cbody" aria-live="off"></div>
      <div class="console-foot"><span class="tiny muted" style="font-family:var(--mono)">${hi ? 'जोखिम' : 'risk'}</span><div class="bar"><i id="cbar"></i></div><span class="score" id="cscore">0</span></div>
    </div>
  </section>

  <section class="stats-band stagger" aria-label="${hi ? 'समस्या का आकार' : 'Scale of the problem'}">
    <div style="--i:0"><div class="num">₹22,495 cr</div><div class="lbl">${hi ? '2025 में साइबर फ़्रॉड का रिपोर्ट किया गया नुकसान (24 लाख शिकायतें)' : 'reported lost to financial cyber fraud in 2025, across 24 lakh complaints'}</div></div>
    <div style="--i:1"><div class="num">1.23 lakh</div><div class="lbl">${hi ? 'डिजिटल अरेस्ट शिकायतें 2024 में, ₹1,935 cr का नुकसान' : 'digital-arrest complaints in 2024, ₹1,935 cr lost'}</div></div>
    <div style="--i:2"><div class="num">₹8,189 cr</div><div class="lbl">${hi ? '1930 से रोका गया (2021–2025), जबकि ₹55,649 cr रिपोर्ट हुआ' : 'held by 1930 / CFCFRMS, 2021–2025, of ₹55,649 cr reported'}</div></div>
    <div style="--i:3"><div class="num">₹18 cr</div><div class="lbl">${hi ? 'Money Restoration Module से अब तक वापस (36,290 केस)' : 'returned so far through the Money Restoration Module, 36,290 cases'}</div></div>
  </section>
  <p class="tiny muted" style="margin-top:8px">${hi ? 'स्रोत' : 'Sources'}: MHA, Rajya Sabha USQ 1341 (11 Feb 2026) · MHA, Rajya Sabha reply (12 Mar 2025) · Supreme Court, <i>In Re: Victims of Digital Arrest</i>, 2026 SCC OnLine SC 1532 (4 Aug 2026). ${hi ? 'रिपोर्ट की गई रकम शिकायतकर्ताओं की बताई हुई है, जाँची हुई नहीं।' : 'Reported amounts are what complainants state, not verified losses.'}</p>

  <div class="section-title"><h2>${hi ? 'एक केस, तीन पल' : 'One case, three moments'}</h2><span class="muted small">${hi ? 'वही Case object पेमेंट से रिफ़ंड तक चलता है' : 'The same Case object travels from payment to refund'}</span></div>
  <section class="moments" id="moments">
    <div class="moment"><div class="n">01 · ${hi ? 'पैसा जाने से पहले' : 'Before the money leaves'}</div><div class="node">${icon('stop', { size: 18 })}</div><div class="t">${t('m1')}</div><p class="small muted" style="margin:0">${t('m1d')}</p></div>
    <div class="moment"><div class="n">02 · ${hi ? 'अगर ओवरराइड हो' : 'If they override'}</div><div class="node">${icon('snow', { size: 18 })}</div><div class="t">${t('m2')}</div><p class="small muted" style="margin:0">${t('m2d')}</p></div>
    <div class="moment"><div class="n">03 · ${hi ? 'फ़्रीज़ के बाद' : 'After the freeze'}</div><div class="node">${icon('undo', { size: 18 })}</div><div class="t">${t('m3')}</div><p class="small muted" style="margin:0">${t('m3d')}</p></div>
  </section>

  <div class="section-title"><h2>${hi ? 'भारत के 2026 ढाँचे में Ruko कहाँ बैठता है' : "Where Ruko fits India's 2026 framework"}</h2><span class="muted small">${hi ? 'जो पहले से है, उसकी जगह नहीं, उसके साथ' : 'Works with what exists, not instead of it'}</span></div>
  <section class="grid g3 stagger fit">
    <div class="card" style="--i:0"><div class="eyebrow">${hi ? 'रोको' : 'Stop'}</div><h3 style="margin:6px 0">${hi ? 'पैसा जाने से पहले' : 'Before the money leaves'}</h3><p class="small muted" style="margin:0">${hi ? 'सुप्रीम कोर्ट (4 अगस्त 2026) ने RBI से temporary debit hold और delayed-transaction safeguard का SOP माँगा। Ruko वही hold है, पर ग्राहक से बात करके, सबूत के साथ, और 24 घंटे में इंसानी रास्ते के साथ।' : 'The Supreme Court (4 Aug 2026) asked RBI for a temporary debit hold SOP and a delayed-transaction safeguard. Ruko is that hold, decided by talking to the customer, with cited reasons and a human way out within 24 hours.'}</p></div>
    <div class="card" style="--i:1"><div class="eyebrow">${hi ? 'फ़्रीज़' : 'Freeze'}</div><h3 style="margin:6px 0">${hi ? 'गोल्डन आवर में शिकायत' : 'A complaint inside the golden hour'}</h3><p class="small muted" style="margin:0">${hi ? '1930 / CFCFRMS तभी पैसा रोक पाता है जब शिकायत जल्दी और पूरी हो। Ruko override से पहले ही सब कुछ दर्ज कर लेता है, तो पीड़ित को कहानी दोबारा नहीं सुनानी पड़ती।' : '1930 / CFCFRMS can only hold money when the complaint is fast and complete. Ruko has already captured everything before the override, so the victim never retells the story.'}</p></div>
    <div class="card" style="--i:2"><div class="eyebrow">${hi ? 'वापसी' : 'Return'}</div><h3 style="margin:6px 0">${hi ? 'MRM और GRM के लिए तैयार फ़ाइल' : 'A file ready for MRM and GRM'}</h3><p class="small muted" style="margin:0">${hi ? 'MHA का Money Restoration Module (अप्रैल 2026) सिर्फ़ फ़्रीज़ हुआ पैसा लौटाता है, और Grievance Redressal Module गलत फ़्रीज़ के लिए है। ReturnPath दोनों के लिए cited केस फ़ाइल बनाता है; Scenario C वही दूसरा दरवाज़ा है।' : "MHA's Money Restoration Module (April 2026) returns money that is already frozen; the Grievance Redressal Module handles wrongful freezes. ReturnPath builds the cited case file for both; Scenario C is that second door."}</p></div>
  </section>

  <div class="section-title"><h2>${t('hub_pick')}</h2><span class="muted small">${hi ? 'सब नकली (synthetic) डेटा' : 'All synthetic data'}</span></div>
  <div class="grid g3 stagger" id="scenarios">
    ${scns.map((s, i) => `
      <article class="card hover scn" style="--tone:${tone[s.id]};--i:${i}" data-scn="${s.id}">
        <div class="row between"><span class="pill ${tagCls[s.id]}">${tag[s.id]}</span><span class="mono muted">${s.id}</span></div>
        <div class="who">${esc(hi ? s.labelHi : s.label)}</div>
        <div class="meta"><span>${hi ? 'ग्राहक' : 'Customer'}</span><b>${esc(s.customer.name)}, ${s.customer.age} · ${esc(s.customer.city)}</b>
          ${s.payment ? `<span>${hi ? 'पेमेंट' : 'Payment'}</span><b>${inr(s.payment.amountINR)} · ${esc(s.payment.rail)}</b><span>Payee</span><b>${esc(s.payment.payeeName)}</b>` : `<span>${hi ? 'फ़्रीज़' : 'Frozen'}</span><b>${inr(s.customer.balanceINR)}</b>`}</div>
        <div class="expect">${icon(expect[s.id][1], { size: 16 })}<span>${expect[s.id][0]}</span></div>
        <div class="row" style="margin-top:auto"><button class="btn primary" data-start="${s.id}" type="button">${t('start')}${icon('arrowRight', { size: 16 })}</button></div>
      </article>`).join('')}
  </div>

  <div class="grid g2" style="margin-top:var(--s10)">
    <div class="card">
      <div class="card-head"><h3>${icon('layers')}${hi ? 'हाल के केस' : 'Recent cases'}</h3><a class="btn sm" href="#/desk">${hi ? 'फ़्रॉड डेस्क' : 'Fraud Desk'}${icon('chevronRight', { size: 14 })}</a></div>
      ${cases.length ? `<div class="tablewrap"><table class="t"><thead><tr><th>Case</th><th>${hi ? 'ग्राहक' : 'Customer'}</th><th>Outcome</th><th>Stage</th></tr></thead><tbody>
        ${cases.slice(0, 6).map((c) => `<tr class="click" data-open="${c.id}" data-door="${c.door}" tabindex="0"><td class="mono">${c.id}</td><td>${esc(c.name)}<div class="tiny muted">${dt(c.createdAt)}</div></td><td>${outcomePill(c.outcome, L)}</td><td class="small">${esc(c.stage)}</td></tr>`).join('')}
      </tbody></table></div>` : `<div class="callout info">${icon('info')}<span>${hi ? 'अभी कोई केस नहीं। ऊपर एक सीन शुरू करें।' : 'No cases yet. Start a scenario above.'}</span></div>`}
    </div>
    <div class="card">
      <div class="card-head"><h3>${icon('cpu')}${hi ? 'डेमो कंट्रोल' : 'Demo controls'}</h3><span class="pill ${app.config.aiMode === 'gemini' ? 'ok' : 'warn'}">${app.config.aiMode === 'gemini' ? 'Gemini' : 'Offline'}</span></div>
      <p class="small muted">${app.config.aiMode === 'gemini' ? `${hi ? 'मॉडल चेन' : 'Model chain'}: <span class="mono">${esc(app.config.models.chainFast || app.config.models.fast)}</span>` : (hi ? 'कोई API key नहीं: नियम और cached जवाब।' : 'No API key: rules and cached responses.')}</p>
      ${app.config.static && app.config.aiMode === 'gemini' ? `<div class="callout ok" style="margin-bottom:10px">${icon('sparkles')}<span>${hi ? 'लाइव Gemini सीधे आपके ब्राउज़र से चलता है (कोई सर्वर नहीं)। आपके केस सिर्फ़ इसी ब्राउज़र में रहते हैं।' : 'Live Gemini runs straight from your browser (no server). Your cases stay in this browser only.'}</span></div>` : app.config.static ? `<div class="callout info" style="margin-bottom:10px">${icon('info')}<span>${hi ? 'यह शेयर करने लायक ऑफ़लाइन डेमो है: पूरा प्लेटफ़ॉर्म आपके ब्राउज़र में चलता है। AI वाला हिस्सा ऑफ़लाइन नियमों से चलता है (वही लॉजिक जो टेस्ट में 44/44 सही है)। लाइव Gemini वाला वर्ज़न होस्टेड ऐप पर चलता है। आपका डेटा सिर्फ़ इसी ब्राउज़र में रहता है।' : 'This is a shareable offline demo: the whole platform runs in your browser. The AI steps use the offline rules engine (the same logic that scores 44/44 in the tests). Live Gemini runs in the hosted app (Cloud Run). Your data stays in this browser only.'}</span></div>` : ''}
      <label class="switch" ${app.config.static ? 'hidden' : ''}><input type="checkbox" id="simFail" ${app.config.simulateFailure ? 'checked' : ''}> ${hi ? 'मॉडल फ़ेल होने का सिमुलेशन (fallback साबित करने के लिए)' : 'Simulate model failure (proves the fallbacks)'}</label>
      ${app.config.static ? '' : app.config.hasKey ? `<label class="switch"><input type="checkbox" id="forceOff" ${app.config.forceOffline ? 'checked' : ''}> ${hi ? 'ऑफ़लाइन नियम मोड पर ज़बरदस्ती चलाएँ' : 'Force offline rules mode'}</label>` : `<p class="small">${hi ? 'लाइव Gemini के लिए' : 'For live Gemini, put'} <span class="mono">GEMINI_API_KEY=…</span> ${hi ? 'को' : 'in'} <span class="mono">ruko-app/.env</span>${hi ? ' में डालें और सर्वर रीस्टार्ट करें।' : ' and restart the server.'}</p>`}
      <div class="row" style="margin-top:12px"><button class="btn sm danger" id="reset" type="button">${icon('trash', { size: 15 })}${hi ? 'डेमो डेटा साफ़ करें' : 'Reset demo data'}</button></div>
    </div>
  </div>`;

  // console loop
  const body = el.querySelector('#cbody'), bar = el.querySelector('#cbar'), sc = el.querySelector('#cscore');
  const timers = [];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const play = () => {
    body.innerHTML = ''; bar.style.width = '0'; sc.textContent = '0';
    let at = 300;
    for (const [who, text, score] of SCRIPT[L] || SCRIPT.en) {
      timers.push(setTimeout(() => {
        const d = document.createElement('div');
        d.className = `cline ${who}`;
        const label = { ruko: 'Ruko', cust: hi ? 'ग्राहक' : 'Customer', sig: hi ? 'संकेत' : 'Signal', out: hi ? 'फ़ैसला' : 'Decision' }[who];
        d.innerHTML = `<span class="who">${label}</span><span class="bubble">${esc(text)}</span>`;
        body.appendChild(d);
        while (body.children.length > 6) body.firstElementChild.remove();
        if (score != null) { bar.style.width = `${Math.min(100, (score / 25) * 100)}%`; sc.textContent = score; sc.style.color = score >= 9 ? 'var(--bad)' : score >= 5 ? 'var(--warn)' : 'var(--ok)'; }
      }, reduced ? 0 : at));
      at += who === 'cust' ? 1500 : who === 'sig' ? 1100 : 1900;
    }
    if (!reduced) timers.push(setTimeout(play, at + 4000));
  };
  play();

  el.querySelectorAll('[data-start]').forEach((b) => b.addEventListener('click', () => { b.classList.add('loading'); startScenario(b.dataset.start); }));
  el.querySelectorAll('[data-open]').forEach((r) => {
    const open = () => { localStorage.setItem('ruko_case', r.dataset.open); go(r.dataset.door === 'frozen_holder' ? `#/case/${r.dataset.open}/1` : `#/desk/${r.dataset.open}`); };
    r.addEventListener('click', open); r.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
  });
  el.querySelector('#judge').addEventListener('click', () => startTour({ auto: true }));
  el.querySelector('#tour2').addEventListener('click', () => startTour());
  el.querySelector('#simFail').addEventListener('change', async (e) => { await post('/settings', { simulateFailure: e.target.checked }); await refreshConfig(); toast(e.target.checked ? 'Model calls will now fail; cached fallbacks take over' : 'Model failure simulation off'); });
  el.querySelector('#forceOff')?.addEventListener('change', async (e) => { await post('/settings', { forceOffline: e.target.checked }); await refreshConfig(); });
  el.querySelector('#reset').addEventListener('click', async () => { await post('/reset'); localStorage.removeItem('ruko_case'); toast(hi ? 'डेमो डेटा साफ़' : 'Demo data cleared'); go('#/'); });
  return () => timers.forEach(clearTimeout);
}
