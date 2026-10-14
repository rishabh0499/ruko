// Guided tour (Hinglish). It drives the real app: starts Scenario A, auto-plays the
// interview, overrides, builds the case file, then visits the staff and judge screens.
// { auto: true } advances by itself (the hands-free "judge demo").
import { sleep } from './ui.js';

const cid = () => localStorage.getItem('ruko_case');
const R = () => window.ruko || {};

const STEPS = [
  { route: '#/', target: '.hero', k: 'Shuruaat', title: 'Ruko kya hai?', body: 'Ruko ek bank-side AI agent hai jo "digital arrest" scam ko payment ke moment pe rokta hai. Fake CBI/ED/police video call pe "arrest" karke log khud paisa bhej dete hain, isliye normal fraud models unhe pakad nahi paate. Ruko payment ke peeche ki kahani padhta hai.' },
  { route: '#/', target: '#moments', k: 'Idea', title: 'Ek case, teen moments', body: '<b>Stop:</b> payment se pehle interview. <b>Freeze:</b> agar victim phir bhi bhej de, toh sab pehle se save hai aur 1930 complaint turant ready hoti hai. <b>Return:</b> wahi case file bank, cyber cell aur court ke documents ban jaati hai.' },
  { route: '#/', target: '#scenarios', k: 'Scenarios', title: 'Teen demo scenarios', body: 'A: retired teacher Sunita ji, ₹18 lakh, asli scam. B: Rakesh ka flat ka down payment, legit, jo kabhi hold nahi hona chahiye. C: Imran bhai ka current account sirf ₹9,000 ke credit ki wajah se poora freeze. Tour Scenario A chalayega.' },
  { run: async () => { const m = await import('./screens/hub.js'); await m.startScenario('A'); }, target: '#bankPhone', k: 'Stop · 1', title: 'Bharat Bank app (mock)', body: 'Sunita ji "RBI Verification Cell" naam ke naye payee ko RTGS se ₹18,00,000 bhej rahi hain. Payee ka account 9 din purana hai aur video call chal raha hai. "Session signals" panel woh dikhata hai jo ek asli bank SDK dekhta.' },
  { target: '#bankPhone', k: 'Stop · 2', title: 'Interview chal raha hai', body: 'Pay dabate hi <b>trigger</b> chalta hai (pure code, AI nahi). Phir Ruko Hindi mein, <b>Gemini ki awaaz mein</b>, ek-ek open sawaal poochta hai. "Beta ke liye property" sunke woh ek aisa follow-up poochta hai jo scammer ki script mein nahi hota: builder ka naam kya hai, site kab dekhi. Authority ka naam aate hi Ruko ek sach bolta hai: koi agency video call pe paisa nahi maangti.', run: async () => { await R().autoplay?.(); }, busy: 'Interview chal raha hai (sound on rakhiye)…' },
  { target: '#reason', k: 'Stop · 3', title: 'Agent reasoning: LLM extracts, code decides', body: 'Har signal ke saath customer ke <b>exact shabd</b> dikhte hain, aur bina quote ke koi signal count nahi hota. Scam-script matches, mock Suspect Registry, aur ek fixed scoring table. Score ≥ 9 ya "authority + safe account" saath mein ho toh escalate. Yeh decision code ka hai, isliye har baar explainable hai.' },
  { target: '#trustPhone', k: 'Stop · 4', title: 'Trusted contact: call aur salah', body: 'Scammer usi phone pe video call pe baitha hai, isliye Ruko ek <b>doosre channel</b> se bete Amit ko SMS bhejta hai. Amit maa ko call karta hai (<b>awaaz on rakhiye</b>, captions ke saath). Phir woh <b>"Yeh scam hai"</b> dabata hai. Amit sirf salah de sakta hai: uska sandesh maa ke bank app mein dikhta hai, aur <b>cancel karna ya bhejna sirf maa ke haath mein</b> hai.', run: async () => { R().showSms?.(); await sleep(1800); await R().playCall?.(); await sleep(800); await R().adviseByContact?.('scam'); await sleep(2500); }, busy: 'Call chal rahi hai…' },
  { target: '#bankPhone', k: 'Stop · 5', title: 'Faisla customer ka', body: 'Maa ke app mein Amit ki chetavani laal rang mein aati hai, aur Ruko use padh ke sunata hai. Do raaste hain: <b>"Yeh payment cancel karo"</b> (paisa khate mein surakshit) ya <b>"Phir bhi bhejo"</b> (double confirm ke saath). Bank aur family salah dete hain, faisla customer ka rehta hai.' },
  { target: '#bankPhone', k: 'Freeze', title: 'Coached victim override karti hai', body: 'Demo mein ab mushkil raasta dikhate hain: chetavani ke baad bhi coached maa "Phir bhi bhejo" dabati hai. Asli zindagi mein dabav mein log aksar aisa karte hain. Ruko do baar confirm karwata hai, phir paisa jaane deta hai. Lekin interview, evidence aur saare signals pehle se case mein save hain, isliye kuch dobara batana nahi padta.', run: async () => { await R().override?.(); await sleep(800); } },
  { route: () => `#/case/${cid()}/1`, target: '#body', k: 'Return · 1', title: 'ReturnPath: "Kya hua"', body: 'Victim ko apni kahani dobara nahi sunani padti. Safety check mein jo kaha tha, woh yahan pehle se bhara hai, aur woh apni bhasha mein bol ke bhi likh sakti hain.', run: async () => { document.querySelector('#next')?.click(); await sleep(900); } },
  { route: () => `#/case/${cid()}/2`, target: '#body', k: 'Return · 2', title: 'Consent aur evidence', body: 'Pehle DPDP Act ke hisaab se consent liya jaata hai (private bank ke liye zaroori). Phir WhatsApp ka "CBI officer" wala screenshot, nakli warrant aur bank SMS. Interview wale screenshots already yahan hain.', run: async () => { await R().addAllSamples?.(); } },
  { route: () => `#/case/${cid()}/3`, target: '#body', k: 'Return · 3', title: 'Evidence padhna', body: 'Har file se amount, UTR, account, IFSC, fake case number, scammer ka phone sab nikalta hai, har ek ke source box ke saath. Gemini key ho toh Gemini image padh ke boxes deta hai; nahi toh sample files ka stored result aata hai.', run: async () => { await R().readAll?.(); }, busy: 'Evidence padh rahe hain…' },
  { route: () => `#/case/${cid()}/4`, target: '.facts-layout', k: 'Return · 4', title: 'Facts check karo (sabse zaroori screen)', body: 'Har fact image pe us jagah highlight hota hai jahan se aaya. Teen states hain: <b>needs check, confirmed, missing</b>, percentage kabhi nahi. Pehle SMS ka UTR crop hua tha, isliye woh "missing" hai. Jab tak user confirm na kare, koi fact document mein nahi jaata.', run: async () => { R().pulseFirst?.(); await sleep(1500); await R().confirmAll?.(); } },
  { route: () => `#/case/${cid()}/5`, target: '#body', k: 'Return · 5', title: 'Paisa kahan gaya', body: 'Money trail exact matching se banta hai. Jahan detail missing hai, woh "gap" dikhta hai. Har leg pe likha hai ki decision kiske haath mein hai: receiving bank (lien), cyber cell (trace), magistrate (release). Reported account pe flag bhi lagta hai.' },
  { route: () => `#/case/${cid()}/6`, target: '#body', k: 'Return · 6', title: 'Case file: zero fabricated values', body: '5 documents banenge: 1930 complaint, bank dispute, cyber-cell annexure, release application (advocate ke liye draft), aur Hindi summary. Drafter kabhi raw evidence nahi dekhta, sirf <b>{{fact:ID}}</b> placeholders likhta hai. Ek validator har number ko confirmed facts se check karta hai. Agar ek bhi number trace na ho, toh document block ho jaata hai.', run: async () => { await R().generate?.(); } , busy: 'Documents ban rahe hain…' },
  { route: () => `#/case/${cid()}/7`, target: '#body', k: 'Return · 7', title: 'Aage kya hoga', body: 'Ek status line batati hai ki agla move kiska hai aur kab tak. RBI 2017 circular ke working-day clocks bhi dikhte hain, saath mein saaf note ki yeh authorised payments pe lagu nahi hote. Yahi woh gap hai jo yeh product bharta hai. Refund ka koi vaada nahi kiya jaata.' },
  { route: () => `#/desk/${cid()}`, target: '.content', k: 'Bank', title: 'Fraud Desk', body: 'Bank staff ko poora transcript, response latency, har score ka reason quote ke saath, trusted-contact message, evidence aur audit log milta hai. Actions: call, hold extend karna, release, ya scam confirm karna.' },
  { route: () => `#/officer/${cid()}`, target: '.content', k: 'Police', title: 'Officer View (read-only)', body: 'Cyber-cell officer ko suspect identifiers, money trail aur numbered evidence annexure ek page pe milte hain. Koi edit control nahi hai. Demo mein yeh mocked hai.' },
  { route: '#/scamcheck', target: '#out', k: 'Extra', title: 'Scam Check', body: 'Koi bhi message ya screenshot daalo, aur verdict, red flags (exact quotes ke saath) aur next steps milte hain. Family isse pehle din se use kar sakti hai.', run: async () => { await sleep(400); await R().scamCheckSample?.(); } },
  { route: '#/eval', target: '#iv', k: 'Judges', title: 'Evaluation', body: '20 scam aur 20 legit-but-unusual transfers, plus 4 red-team cases (coached victim, scammer typing, gussa hua legit customer, evidence refuse). Scam catch rate, false-hold rate, decision ka time aur cost dikhte hain. Note: yeh set team ne khud likha hai, isliye isse regression test samjho, field accuracy nahi.', run: async () => { await R().runEval?.(); await sleep(600); } },
  { route: '#/studio', target: '.content', k: 'Judges', title: 'Evidence Studio', body: 'Indian UPI screenshots ka koi public dataset nahi hai, isliye saara evidence yahan generate hota hai, ground-truth boxes ke saath. 30-item test set mein 5 hard cases hain: blurry, cropped, do amounts, mixed scripts, aur prompt injection.' },
  { route: '#/real', target: '.content', k: 'Imaandari', title: 'Real vs Mocked', body: 'Kya real hai (policy, extraction, validator, drafting) aur kya mocked (bank, SMS, submission, officer login), sab ek table mein. Saath mein live Gemini calls ka log aur cost bhi.' },
  { route: '#/security', target: '#events', k: 'Security', title: 'IDS / IPS: Ruko ki apni suraksha', body: 'Ruko mein victims ke screenshots, bank details aur AI pipeline hai, isliye platform khud ek target hai. Har API request route se pehle jaanchi jaati hai: path traversal, SQL injection, XSS, AI prompt injection, scanners, nakli file uploads, flood. <b>Prevent (IPS)</b> mode block aur ban karta hai, <b>Detect (IDS)</b> sirf record. Abhi simulator saare attacks chala raha hai.', run: async () => { await sleep(500); await R().runAllAttacks?.(); }, busy: 'Attacks simulate ho rahe hain…' },
  { route: '#/', target: '#scenarios', k: 'Ab aapki baari', title: 'Khud try karo', body: 'Scenario B chalao: legit flat payment, jo hold nahi hona chahiye. Phir Scenario C: frozen trader, jahan ₹6.4 lakh ke freeze ko ₹9,000 ke lien tak limit karne ki request banti hai. Gemini key .env mein daaloge toh saare AI steps live ho jayenge.' },
];

let active = null;

function waitFor(sel, ms = 10000) {
  return new Promise((ok) => {
    const t0 = Date.now();
    const tick = () => { const el = document.querySelector(sel); if (el && el.getBoundingClientRect().height > 0) return ok(el); if (Date.now() - t0 > ms) return ok(null); setTimeout(tick, 120); };
    tick();
  });
}

function place(el, hole, card) {
  if (!el) { hole.style.cssText = 'top:50%;left:50%;width:0;height:0'; card.style.top = '30%'; card.style.left = 'calc(50% - 210px)'; return; }
  const r = el.getBoundingClientRect();
  const pad = 8, vw = innerWidth, vh = innerHeight;
  const top = Math.max(6, r.top - pad), left = Math.max(6, r.left - pad);
  const h = Math.min(r.height + pad * 2, vh - top - 6), w = Math.min(r.width + pad * 2, vw - left - 6);
  Object.assign(hole.style, { top: top + 'px', left: left + 'px', width: w + 'px', height: h + 'px' });
  const cw = Math.min(420, vw - 32), ch = card.offsetHeight || 260;
  let cx, cy;
  if (left + w + cw + 24 < vw) { cx = left + w + 16; cy = Math.min(Math.max(16, top), vh - ch - 16); }
  else if (left - cw - 24 > 0) { cx = left - cw - 16; cy = Math.min(Math.max(16, top), vh - ch - 16); }
  else if (top + h + ch + 24 < vh) { cx = Math.min(Math.max(16, left), vw - cw - 16); cy = top + h + 16; }
  else { cx = vw - cw - 16; cy = vh - ch - 16; }
  card.style.left = cx + 'px'; card.style.top = cy + 'px';
}

export async function startTour({ auto = false } = {}) {
  if (active) active.stop();
  const mask = document.createElement('div'); mask.className = 'tour-mask';
  const hole = document.createElement('div'); hole.className = 'tour-hole';
  const card = document.createElement('div'); card.className = 'tour-card'; card.setAttribute('role', 'dialog'); card.setAttribute('aria-live', 'polite');
  document.body.append(mask, hole, card);
  let i = 0, stopped = false, running = false, target = null, timer = null;
  const onResize = () => place(target, hole, card);
  addEventListener('resize', onResize); addEventListener('scroll', onResize, true);
  const stop = () => { stopped = true; clearTimeout(timer); mask.remove(); hole.remove(); card.remove(); removeEventListener('resize', onResize); removeEventListener('scroll', onResize, true); active = null; };
  active = { stop };

  const show = async (n) => {
    if (stopped) return;
    i = n; const s = STEPS[i];
    running = true;
    card.innerHTML = `<div class="k">${i + 1} / ${STEPS.length} · ${s.k}</div><h3>${s.title}</h3><p class="busy">Loading…</p>`;
    if (s.route) { const h = typeof s.route === 'function' ? s.route() : s.route; const nav = window.__rukoNav; if (nav.currentHash() !== h) { nav.go(h); await sleep(500); } }
    if (s.run && /startScenario/.test(String(s.run))) { await s.run(); await sleep(700); }
    target = await waitFor(s.target);
    target?.scrollIntoView({ block: target.getBoundingClientRect().height > innerHeight * 0.8 ? 'start' : 'center', behavior: 'smooth' });
    await sleep(350);
    const renderCard = (busy) => {
      card.innerHTML = `<div class="k">${i + 1} / ${STEPS.length} · ${s.k}</div><h3>${s.title}</h3><p>${s.body}</p>
        ${busy ? `<p class="busy">${s.busy || 'Chal raha hai…'}</p>` : ''}
        <div class="tour-prog" aria-hidden="true"><i style="width:${((i + 1) / STEPS.length) * 100}%"></i></div>
        <div class="row between" style="margin-top:14px"><button class="btn sm ghost" data-x type="button">${auto ? 'Stop demo' : 'Close'}</button>
        <div class="row"><button class="btn sm" data-b type="button" ${i === 0 || busy ? 'disabled' : ''}>← Back</button><button class="btn sm primary" data-n type="button" ${busy ? 'disabled' : ''}>${i === STEPS.length - 1 ? 'Finish' : 'Next →'}</button></div></div>`;
      card.querySelector('[data-x]').onclick = stop;
      card.querySelector('[data-b]').onclick = () => show(i - 1);
      card.querySelector('[data-n]').onclick = () => (i === STEPS.length - 1 ? stop() : show(i + 1));
      place(target, hole, card);
    };
    renderCard(!!s.run && !/startScenario/.test(String(s.run)));
    if (s.run && !/startScenario/.test(String(s.run))) {
      try { await s.run(); } catch (e) { console.warn('tour step', e); }
      if (stopped) return;
      target = await waitFor(s.target, 3000);
      renderCard(false);
    }
    running = false;
    if (auto && !stopped) {
      const words = s.body.replace(/<[^>]+>/g, '').split(/\s+/).length;
      timer = setTimeout(() => { if (i < STEPS.length - 1) show(i + 1); }, Math.max(4500, words * 230));
    }
  };
  show(0);
}
