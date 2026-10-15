import { get, post } from '../api.js';
import { esc, dt, statusPill, toast } from '../ui.js';
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
  const tag = { A: hi ? 'डिजिटल अरेस्ट स्कैम' : 'Digital-arrest scam', B: hi ? 'असली पेमेंट' : 'Legitimate payment', C: hi ? 'गलत फ़्रीज़ खाता' : 'Wrongly frozen account' };
  const tagCls = { A: 'bad', B: 'ok', C: 'info' };
  const story = {
    A: hi ? 'एक "अधिकारी" वीडियो कॉल पर है और ₹18 लाख "RBI Verification Cell" को भेजने को कह रहा है।' : 'An "officer" on a video call tells her to send ₹18 lakh to an "RBI Verification Cell".',
    B: hi ? 'नए बिल्डर को ₹15 लाख की डाउन पेमेंट। बड़ी और नई, पर असली।' : 'A ₹15 lakh down payment to a new builder. Large and unusual, but real.',
    C: hi ? '₹9,000 की एक संदिग्ध रकम आने पर पूरा ₹6.4 लाख का खाता फ़्रीज़ हो गया।' : 'One ₹9,000 credit he did not know about froze his whole ₹6.4 lakh account.',
  };
  const expect = {
    A: [hi ? 'पेमेंट रुकता है, बेटे को सूचना जाती है' : 'Payment held, her son is told', 'stop'],
    B: [hi ? 'पेमेंट बिना रुके जाता है' : 'Payment goes through, never held', 'shieldCheck'],
    C: [hi ? 'फ़्रीज़ को ₹9,000 तक सीमित करने की अर्ज़ी' : 'Asks to limit the freeze to ₹9,000', 'snow'],
  };
  const steps = [
    { ic: 'stop', n: hi ? 'रोको' : 'Stop', h: hi ? 'पैसा जाने से पहले' : 'Before the money leaves', d: hi ? 'हर पेमेंट, बैंक ऐप, UPI ऐप, कार्ड या ब्रांच से, ग्राहक की पूरी यात्रा देखकर स्कोर होता है: टुकड़ों में भेजा पैसा, तोड़ी गई FD, स्क्रीन शेयर। ज़्यादातर चुपचाप निकल जाते हैं। ज़रूरत हो तभी चेतावनी, रुकना, दो-तीन सवाल या 24 घंटे की रोक।' : "Every payment, from the bank app, UPI apps, cards or the branch, is scored on the customer's whole journey: split payments, a broken FD, a shared screen. Most pass silently. Only when needed: a warning, a pause, two or three questions, or a 24-hour hold.", fit: hi ? 'सुप्रीम कोर्ट के कहे RBI debit-hold SOP जैसा (4 अगस्त 2026)' : 'In line with the RBI debit-hold SOP the Supreme Court ordered (4 Aug 2026)' },
    { ic: 'snow', n: hi ? 'फ़्रीज़' : 'Freeze', h: hi ? 'अगर फिर भी भेज दें' : 'If they send it anyway', d: hi ? 'सब कुछ पहले से दर्ज है, तो 1930 की शिकायत गोल्डन आवर में तैयार हो जाती है। पीड़ित को कहानी दोबारा नहीं सुनानी पड़ती।' : 'Everything is already captured, so the 1930 complaint is drafted inside the golden hour. The victim never has to retell the story.', fit: hi ? '1930 / CFCFRMS के लिए तैयार' : 'Ready for 1930 / CFCFRMS' },
    { ic: 'undo', n: hi ? 'वापसी' : 'Return', h: hi ? 'पैसा वापस पाना' : 'Getting the money back', d: hi ? 'स्क्रीनशॉट से cited केस फ़ाइल बनती है: बैंक डिस्प्यूट, साइबर-सेल annexure और रिलीज़ के कागज़। हर रकम एक पक्के तथ्य से जुड़ी।' : 'Screenshots become a cited case file: bank dispute, cyber-cell annexure and release papers, with every amount traced to a confirmed fact.', fit: hi ? 'MHA के Money Restoration और Grievance मॉड्यूल के लिए' : "Built for MHA's Money Restoration and Grievance modules" },
  ];

  el.innerHTML = `
  <section class="hero">
    <div>
      <div class="eyebrow">${t('hub_eyebrow')}</div>
      <h1>${hi ? 'पेमेंट के <em>पल</em> पर स्कैम रोको।' : 'Stop the scam at the <em>moment</em> of payment.'}</h1>
      <p class="pitch">${hi ? 'जब कोई बड़ा ट्रांसफ़र दबाव में लगे, Ruko पैसा जाने से पहले ग्राहक से बात करता है। और अगर पैसा फिर भी चला जाए, तो उसे वापस पाने की केस फ़ाइल पहले से तैयार रहती है।' : 'When a big transfer looks coerced, Ruko talks to the customer before the money leaves. If it still goes, the case file to get it back is already built.'}</p>
      <div class="hero-cta">
        <button class="btn primary lg" id="judge" type="button">${icon('play')}${hi ? '3 मिनट का डेमो देखें' : 'Watch the 3-minute demo'}</button>
        <button class="btn lg" id="try" type="button">${hi ? 'खुद आज़माएँ' : 'Try a scenario'}${icon('arrowRight', { size: 16 })}</button>
      </div>
      <div class="trust-row">
        <span>${icon('cpu')}${hi ? 'AI पढ़ता है, कोड फ़ैसला करता है' : 'AI reads, code decides'}</span>
        <span>${icon('fingerprint')}${hi ? 'हर तथ्य अपने सबूत से जुड़ा' : 'Every fact cited to its source'}</span>
        <span>${icon('languages')}${hi ? 'हिंदी और English' : 'Hindi and English'}</span>
      </div>
    </div>
    <div class="console" aria-label="${hi ? 'लाइव इंटरवेंशन का नमूना' : 'Sample live intervention'}">
      <div class="console-head"><span>${hi ? 'Ruko · ₹18,00,000 का RTGS' : 'Ruko · RTGS ₹18,00,000'}</span><span class="live"><i></i>${hi ? 'लाइव' : 'live'}</span></div>
      <div class="console-body" id="cbody" aria-live="off"></div>
      <div class="console-foot"><span class="tiny muted">${hi ? 'जोखिम' : 'Risk'}</span><div class="bar"><i id="cbar"></i></div><span class="score" id="cscore">0</span></div>
    </div>
  </section>

  <section id="moments" aria-labelledby="how-h">
    <div class="section-title"><h2 id="how-h">${hi ? 'Ruko कैसे काम करता है' : 'How Ruko works'}</h2><span class="muted small">${hi ? 'एक ही केस, पेमेंट से रिफ़ंड तक' : 'One case, from payment to refund'}</span></div>
    <ol class="how stagger">
      ${steps.map((x, i) => `<li class="how-step" style="--i:${i}"><div class="how-top"><span class="how-ic">${icon(x.ic, { size: 18 })}</span><span class="how-n">${i + 1} · ${x.n}</span></div><h3>${x.h}</h3><p>${x.d}</p><div class="how-fit">${icon('check', { size: 13 })}${x.fit}</div></li>`).join('')}
    </ol>
  </section>

  <section aria-labelledby="pick-h">
    <div class="section-title"><h2 id="pick-h">${hi ? 'एक सीन चुनकर आज़माएँ' : 'Try it: pick a scenario'}</h2><span class="muted small">${hi ? 'सभी लोग और पैसे नकली (synthetic) हैं' : 'All people and money are synthetic'}</span></div>
    <div class="grid g3 stagger" id="scenarios">
      ${scns.map((s, i) => `
        <article class="card scn" style="--i:${i}" data-scn="${s.id}">
          <span class="pill ${tagCls[s.id]}">${tag[s.id]}</span>
          <h3>${esc(s.customer.name)}, ${s.customer.age} <span class="muted">· ${esc(s.customer.city)}</span></h3>
          <p class="scn-story">${story[s.id]}</p>
          <div class="scn-expect">${icon(expect[s.id][1], { size: 16 })}<span>${hi ? 'नतीजा' : 'Expected'}: <b>${expect[s.id][0]}</b></span></div>
          <button class="btn ${s.id === 'A' ? 'primary' : ''} block" data-start="${s.id}" type="button">${hi ? `सीन ${s.id} शुरू करें` : `Start scenario ${s.id}`}${icon('arrowRight', { size: 16 })}</button>
        </article>`).join('')}
    </div>
    <a class="more-link" href="#/risk">${icon('zap', { size: 18 })}<span><b>${hi ? 'और रास्ते: UPI ऐप, कार्ड, नेट बैंकिंग, ब्रांच' : 'More journeys: UPI apps, cards, net banking, the branch'}</b><span class="small muted">${hi ? '₹10,000 × 5, हफ़्तों का इन्वेस्टमेंट स्कैम, APK + SIM स्वैप, FD तोड़कर RTGS, AnyDesk। रिस्क इंजन में देखें।' : '₹10,000 × 5, a weeks-long investment scam, APK + SIM swap, an FD broken for an RTGS, AnyDesk. See them in the Risk Engine.'}</span></span>${icon('arrowRight', { size: 16 })}</a>
  </section>

  ${cases.length ? `<section class="card recent" aria-labelledby="rec-h">
    <div class="card-head"><h3 id="rec-h">${icon('layers')}${hi ? 'आपके हाल के केस' : 'Your recent cases'}</h3><a class="btn sm" href="#/desk">${hi ? 'सब फ़्रॉड डेस्क में' : 'All cases in Fraud Desk'}${icon('chevronRight', { size: 14 })}</a></div>
    <ul class="recent-list">${cases.slice(0, 5).map((c) => `<li class="click" data-open="${c.id}" data-door="${c.door}" tabindex="0" role="link"><span class="who"><b>${esc(c.name)}</b><span class="tiny muted">${c.id} · ${dt(c.createdAt)}</span></span>${statusPill(c, L)}<span class="go">${icon('chevronRight', { size: 16 })}</span></li>`).join('')}</ul>
  </section>` : ''}

  <details class="dev-settings">
    <summary>${icon('cpu', { size: 16 })}${hi ? 'डेमो सेटिंग्स' : 'Demo settings'}<span class="pill ${app.config.aiMode === 'gemini' ? 'ok' : 'warn'}">${app.config.aiMode === 'gemini' ? 'Gemini live' : 'Offline rules'}</span></summary>
    <div class="dev-body">
      <p class="small muted">${app.config.aiMode === 'gemini' ? `${hi ? 'मॉडल चेन' : 'Model chain'}: <span class="mono">${esc(app.config.models.chainFast || app.config.models.fast)}</span>` : (hi ? 'कोई API key नहीं: नियम और cached जवाब।' : 'No API key: rules and cached responses.')}</p>
      ${app.config.static ? `<p class="small muted">${app.config.aiMode === 'gemini' ? (hi ? 'Gemini सीधे आपके ब्राउज़र से चलता है। आपके केस सिर्फ़ इसी ब्राउज़र में रहते हैं।' : 'Gemini runs straight from your browser. Your cases stay in this browser only.') : (hi ? 'यह ऑफ़लाइन डेमो है: पूरा प्लेटफ़ॉर्म आपके ब्राउज़र में चलता है।' : 'Offline demo: the whole platform runs in your browser with the rules engine.')}</p>` : ''}
      <label class="switch" ${app.config.static ? 'hidden' : ''}><input type="checkbox" id="simFail" ${app.config.simulateFailure ? 'checked' : ''}> ${hi ? 'मॉडल फ़ेल होने का सिमुलेशन (fallback साबित करने के लिए)' : 'Simulate model failure (proves the fallbacks)'}</label>
      ${!app.config.static && app.config.hasKey ? `<label class="switch"><input type="checkbox" id="forceOff" ${app.config.forceOffline ? 'checked' : ''}> ${hi ? 'ऑफ़लाइन नियम मोड पर चलाएँ' : 'Force offline rules mode'}</label>` : ''}
      <button class="btn sm danger" id="reset" type="button">${icon('trash', { size: 15 })}${hi ? 'डेमो डेटा साफ़ करें' : 'Reset demo data'}</button>
    </div>
  </details>`;

  // console loop
  const body = el.querySelector('#cbody'), bar = el.querySelector('#cbar'), sc = el.querySelector('#cscore');
  const timers = [];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const play = () => {
    body.innerHTML = ''; bar.style.width = '0'; sc.textContent = '0';
    let at = 120;
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
      at += body.children.length < 1 && at < 400 ? 500 : who === 'cust' ? 1500 : who === 'sig' ? 1100 : 1900;
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
  el.querySelector('#try').addEventListener('click', () => { const t = el.querySelector('#scenarios'); t.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); t.querySelector('button')?.focus({ preventScroll: true }); });
  el.querySelector('#simFail')?.addEventListener('change', async (e) => { await post('/settings', { simulateFailure: e.target.checked }); await refreshConfig(); toast(e.target.checked ? 'Model calls will now fail; cached fallbacks take over' : 'Model failure simulation off'); });
  el.querySelector('#forceOff')?.addEventListener('change', async (e) => { await post('/settings', { forceOffline: e.target.checked }); await refreshConfig(); });
  el.querySelector('#reset').addEventListener('click', async () => { await post('/reset'); localStorage.removeItem('ruko_case'); toast(hi ? 'डेमो डेटा साफ़' : 'Demo data cleared'); go('#/'); });
  return () => timers.forEach(clearTimeout);
}
