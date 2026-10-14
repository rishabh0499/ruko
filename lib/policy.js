// Deterministic policy: trigger, offline signal extraction, script matching, decider.
// Gemini may replace the extraction step; the decider is always this code.
import SCRIPTS from '../data/scripts.js';
import REPORTED from '../data/reported.js';

export const POLICY = {
  newPayeeAmount: 50000,
  ratioThreshold: 3,
  youngAccountDays: 30,
  youngAccountAmount: 25000,
  sessionSignalAmount: 10000,
  payeeWords: /\b(rbi|safe|verification|supervision|escrow|custody|cbi|court|investigation|clearance)\b|सुरक्षा|सुरक्षित|वेरिफिकेशन/i,
  holdHours: 24,
};

// ---------- 1. Trigger (pure code, no LLM) ----------
export function trigger(p) {
  const r = [];
  if (p.payeeIsNew && p.amountINR >= POLICY.newPayeeAmount) r.push({ code: 'new_payee_large', text: `New payee and amount ≥ ₹${POLICY.newPayeeAmount.toLocaleString('en-IN')}` });
  if (p.amountVs90DayMax >= POLICY.ratioThreshold) r.push({ code: 'amount_vs_history', text: `Amount is ${p.amountVs90DayMax}× the 90-day maximum` });
  if (p.payeeAccountAgeDays <= POLICY.youngAccountDays && p.amountINR >= POLICY.youngAccountAmount) r.push({ code: 'young_payee_account', text: `Payee account opened ${p.payeeAccountAgeDays} days ago` });
  const s = p.sessionSignals || {};
  if ((s.activeVideoCall || s.activeScreenShare || s.remoteAccessApp) && p.amountINR >= POLICY.sessionSignalAmount)
    r.push({ code: 'session_signal', text: [s.activeVideoCall && 'active video call', s.activeScreenShare && 'screen share', s.remoteAccessApp && 'remote-access app'].filter(Boolean).join(', ') + ' during transfer' });
  if (POLICY.payeeWords.test(p.payeeName || '')) r.push({ code: 'payee_name_words', text: `Payee name "${p.payeeName}" uses official-sounding words` });
  return { triggered: r.length > 0, reasons: r };
}

// ---------- 2. Offline signal extraction ----------
const RX = {
  authorityClaimed: /\b(cbi|ncb|trai|rbi|ed officer|enforcement directorate|customs|police|crime branch|supreme court|court|judge|officer|official|ministry|government)\b|सीबीआई|ईडी|पुलिस|अधिकारी|अफसर|कस्टम|क्राइम ब्रांच|आरबीआई|कोर्ट|जज|\bCBI\b|\bED\b/i,
  safeAccountLanguage: /safe account|safe custody|supervision|verification|verified|escrow|refund(ed)? (in|within|after)|money comes back|comes back in|returned (within|after)|सुरक्षित खा|वेरिफिकेशन|वापस आ(एगा| जाएगा)|पैसा वापस/i,
  threatOfArrestOrCase: /arrest|warrant|money laundering|laundering|drugs|mdma|parcel|seized|jail|pmla|court order|bail|criminal case|case is registered|illegal|गिरफ्तार|वारंट|मनी लॉन्ड्रिंग|ड्रग्स|पार्सल|केस|जेल|अरेस्ट/i,
  secrecyDemanded: /tell no one|not to tell|don't tell|do not tell|not tell (anyone|my)|confidential|disclosure|keep it (secret|private)|not to call|not to disconnect|don't disconnect|cannot leave|किसी को (कुछ )?(मत|न)|मत बताना|बताना मना|गुप्त/i,
  videoCallOngoing: /video call|on video|camera on|share my screen|watching my screen|he is watching|वीडियो कॉल|वीडियो पर/i,
  thirdPartyDictating: /\b(he|she|they|officer|police|someone|caller) (said|told|instructed|asked me to)\b|was told|told me to|guiding me|उन्होंने (कहा|बोला)|ने कहा|बोला है|कहा है/i,
  urgencyOrDeadline: /\btoday\b|right now|\bnow\b|immediately|urgent|within (the|an|\d+) (hour|minute)|hurry|आज|अभी|जल्दी|तुरंत|घंटे/i,
};
const AGENCY = [[/cbi|सीबीआई/i, 'CBI'], [/enforcement directorate|\bed\b|ईडी/i, 'ED'], [/ncb|narcotics/i, 'NCB'], [/trai/i, 'TRAI'], [/customs|कस्टम/i, 'Customs'], [/crime branch|क्राइम ब्रांच/i, 'Crime Branch'], [/mumbai police|मुंबई पुलिस/i, 'Mumbai Police'], [/police|पुलिस/i, 'Police'], [/rbi|आरबीआई/i, 'RBI'], [/court|कोर्ट|judge|जज/i, 'Court']];
const LEGIT = [
  [/agreement|demand letter|invoice|quotation|estimate|receipt|challan|admission letter|booking (form|receipt)|contract|proforma|fee notice|proposal|rc transfer|एग्रीमेंट|डिमांड लेटर|बिल|एस्टिमेट|लिखा-पढ़ी/i, 'Supporting document described'],
  [/visited|site office|test drove|tasting|measured|met him|i went|admitted|मिला था|गई थी|गया था|देखा था/i, 'In-person contact with the payee'],
  [/my (sister|father|mother|brother|cousin|colleague|ca|agent)\b|चचेरे भाई|पिता|she is my sister/i, 'Known relationship with the payee'],
];
const NEGATED = /^(no|nobody|no one|not|never|nothing|नहीं)\b/i;
const COVER = [[/property|flat|प्रॉपर्टी|फ्लैट/i, 'property'], [/land|plot|ज़मीन|जमीन/i, 'land'], [/medical|hospital|मेडिकल|अस्पताल|इलाज/i, 'medical'], [/fixed deposit|\bfd\b|investment|एफडी|निवेश/i, 'investment']];
const CONSISTENT = { property: /builder|developer|realty|estate|homes|infra|construction/i, land: /builder|developer|realty|estate|infra/i, medical: /hospital|clinic|medical|health|dr\.?/i, investment: /bank|lic|mutual|securities|insurance|finance/i };
const VAGUE = /i think|not sure|don't know|handling it|handles it|याद नहीं|पता नहीं|ही सब देख|ही देख रहे|बाहर है|reputed|known to our family/i;
const OFFERED = /here is|attaching|attached|i can show|यह देखिए|यह रहा|दिखा सकता|दिखा सकती|है मेरे पास|मेरे पास|लिखा-पढ़ी है|they sent|sent me|shared a|भेजा है/i;
const REFUSED = /cannot share|can't share|not share|don't want to share|won't share|rather not share|no documents|nothing in writing|do not have anything|not show|नहीं दिखा|मना कर|^नहीं\.?$|^no\.?$/i;

export function sentences(text) {
  return String(text).split(/(?<=[.!?।])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
}

export function emptySignals() {
  const s = {};
  for (const k of Object.keys(RX)) s[k] = { value: false };
  return { ...s, coachedAnswerLikely: { value: false }, repliesDictated: { value: false }, purposeStated: '', purposeCategory: null, purposeConsistentWithPayee: 'unclear', evidenceOffered: false, evidenceRefused: false, legitimacyIndicators: [] };
}

// turns: [{role, text, slot, latencyMs}], evidenceNotes: [{evidenceId, text}]
export function extractSignalsOffline({ turns, evidenceNotes = [], payment }) {
  const sig = emptySignals();
  const cust = turns.filter((t) => t.role === 'customer');
  const pool = [...cust.flatMap((t) => sentences(t.text).map((s) => ({ s, from: 'customer' }))), ...evidenceNotes.flatMap((n) => sentences(n.text).map((s) => ({ s, from: 'evidence' })))];
  for (const [k, rx] of Object.entries(RX)) {
    const hit = pool.find(({ s }) => rx.test(s) && !NEGATED.test(s));
    if (hit) sig[k] = { value: true, quote: hit.s, from: hit.from };
  }
  if (sig.authorityClaimed.value) {
    const all = pool.map((p) => p.s).join(' ');
    sig.authorityClaimed.agency = (AGENCY.find(([rx]) => rx.test(all)) || [null, 'Unspecified'])[1];
  }
  for (const [rx, label] of LEGIT) {
    const hit = pool.find(({ s, from }) => from === 'customer' && rx.test(s) && !NEGATED.test(s));
    if (hit) sig.legitimacyIndicators.push({ indicator: label, quote: hit.s });
  }
  const purposeTurn = cust.find((t) => t.slot === 'purpose') || cust[0];
  if (purposeTurn) {
    sig.purposeStated = purposeTurn.text;
    sig.purposeCategory = (COVER.find(([rx]) => rx.test(purposeTurn.text)) || [null, null])[1];
  }
  const payeeSuspicious = POLICY.payeeWords.test(payment?.payeeName || '');
  const consistent = sig.purposeCategory && CONSISTENT[sig.purposeCategory]?.test(payment?.payeeName || '');
  const coachTurn = cust.find((t) => t.slot === 'coach');
  const vague = coachTurn ? VAGUE.test(coachTurn.text) : false;
  if (sig.purposeCategory && (payeeSuspicious || (!consistent && vague))) {
    sig.coachedAnswerLikely = { value: true, reason: payeeSuspicious ? `Stated purpose (${sig.purposeCategory}) does not fit payee "${payment.payeeName}"` : 'Follow-up answer had no concrete details', quote: vague ? coachTurn.text : purposeTurn.text };
  }
  sig.purposeConsistentWithPayee = consistent ? 'yes' : sig.coachedAnswerLikely.value ? 'no' : 'unclear';
  // Replies that arrive fast, long and polished suggest someone else is typing.
  const fast = cust.filter((t) => t.latencyMs != null && t.latencyMs < 1500 && t.text.length > 50);
  if (fast.length >= 2) sig.repliesDictated = { value: true, reason: `${fast.length} long replies arrived in under 1.5 s`, quote: fast[0].text };
  const evTurn = cust.find((t) => t.slot === 'evidence');
  if (evTurn) {
    if (evTurn.attached?.length || OFFERED.test(evTurn.text)) sig.evidenceOffered = true;
    else sig.evidenceRefused = true; // not offering counts as refusing; REFUSED documents the usual phrasings
    sig.evidenceRefusalExplicit = REFUSED.test(evTurn.text.trim());
  }
  return sig;
}

// Gemini output is accepted only where the quote really exists in the transcript or evidence.
// Matching ignores whitespace and punctuation (line breaks, danda, quotes) but not words,
// so a paraphrase or a line Ruko itself said never counts as the customer's quote.
const squash = (t) => String(t || '').replace(/[\s.,!?।॥"'“”‘’…:;()\-–—]+/g, '').toLowerCase();
export function verifyQuotes(sig, { turns, evidenceNotes = [] }) {
  const hay = squash([...turns.filter((t) => t.role === 'customer').map((t) => t.text), ...evidenceNotes.map((n) => n.text)].join(' '));
  const found = (q) => q && squash(q).length >= 4 && hay.includes(squash(q));
  const dropped = [];
  for (const k of Object.keys(RX)) {
    const v = sig[k];
    if (v?.value && !found(v.quote)) { dropped.push(`${k} ("${String(v.quote || '').slice(0, 60)}")`); sig[k] = { value: false }; }
  }
  sig.legitimacyIndicators = (sig.legitimacyIndicators || []).filter((l) => found(l.quote));
  return { sig, dropped };
}

// ---------- 3. Script matcher (offline, keyword RAG-lite) ----------
const kwCache = new Map();
// Latin keywords match on word boundaries ("sim" must not match "similar"); Indic ones as substrings.
function kwRx(k) {
  if (!kwCache.has(k)) {
    const e = k.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    kwCache.set(k, /^[\x00-\x7F]+$/.test(k) ? new RegExp(`\\b${e}\\b`, 'i') : new RegExp(e, 'i'));
  }
  return kwCache.get(k);
}
export function matchScripts({ turns, evidenceNotes = [] }) {
  const pool = [...turns.filter((t) => t.role === 'customer').flatMap((t) => sentences(t.text)), ...evidenceNotes.flatMap((n) => sentences(n.text))];
  const out = [];
  for (const sc of SCRIPTS) {
    let hits = 0, quote = null;
    for (const s of pool) {
      if (NEGATED.test(s)) continue;
      if (sc.keywords.some((k) => kwRx(k).test(s))) { hits++; quote = quote || s; }
    }
    if (hits) out.push({ scriptId: sc.id, name: sc.name, stage: sc.stage, source: sc.source, hits, quote, similarityReason: `Matches ${sc.stage} pattern: "${sc.lines[0]}"` });
  }
  return out.sort((a, b) => b.hits - a.hits).slice(0, 3);
}
export const scriptLibrary = () => SCRIPTS;

// ---------- 4. Verifier (mock registry) ----------
export function verifyPayee(p) {
  const flags = [];
  if (REPORTED.accounts.includes(p?.payeeAccount)) flags.push({ code: 'reported_payee', text: 'Payee account appears in the reported-accounts list (mocked Suspect Registry)' });
  return flags;
}
export const reportedLists = () => REPORTED;

// ---------- 5. Decider (pure code) ----------
const W8 = { authorityClaimed: 3, safeAccountLanguage: 3, threatOfArrestOrCase: 3, secrecyDemanded: 2, videoCallOngoing: 2, thirdPartyDictating: 2, coachedAnswerLikely: 2, urgencyOrDeadline: 1, repliesDictated: 1 };
const LABEL = {
  en: { authorityClaimed: 'Someone claiming to be an official', safeAccountLanguage: '"Safe account" / verification / refund promise', threatOfArrestOrCase: 'Threat of arrest or a criminal case', secrecyDemanded: 'Asked to keep it secret', videoCallOngoing: 'A video call or screen share is active', thirdPartyDictating: 'Someone else is directing the payment', coachedAnswerLikely: 'The stated purpose does not fit the payee', urgencyOrDeadline: 'Deadline pressure', repliesDictated: 'Replies look dictated', scripts: 'Matches known scam script', reported: 'Payee in reported list', refused: 'Evidence not shared', young: 'Payee account is very new', legit: 'Supporting detail', consistent: 'Purpose fits payee, with document' },
  hi: { authorityClaimed: 'कोई खुद को अधिकारी बता रहा है', safeAccountLanguage: '"सुरक्षित खाता" / वेरिफिकेशन / पैसा वापस का वादा', threatOfArrestOrCase: 'गिरफ्तारी या केस की धमकी', secrecyDemanded: 'किसी को न बताने को कहा गया', videoCallOngoing: 'वीडियो कॉल या स्क्रीन शेयर चालू है', thirdPartyDictating: 'कोई और पेमेंट करवा रहा है', coachedAnswerLikely: 'बताया गया कारण payee से मेल नहीं खाता', urgencyOrDeadline: 'जल्दी करने का दबाव', repliesDictated: 'जवाब बोलकर लिखवाए लगते हैं', scripts: 'जाने-माने स्कैम स्क्रिप्ट से मेल', reported: 'Payee रिपोर्टेड लिस्ट में', refused: 'सबूत नहीं दिखाया', young: 'Payee का खाता बहुत नया है', legit: 'सहायक जानकारी', consistent: 'कारण payee से मेल खाता है, कागज़ के साथ' },
};

export function decide({ signals, scriptMatches = [], payment, verifierFlags = [], lang = 'en', evidenceDocs = 0 }) {
  const L = LABEL[lang] || LABEL.en;
  const c = [];
  for (const [k, w] of Object.entries(W8)) if (signals[k]?.value) c.push({ key: k, points: w, label: L[k], quote: signals[k].quote || signals[k].reason });
  const sess = payment?.sessionSignals || {};
  if (!signals.videoCallOngoing?.value && (sess.activeVideoCall || sess.activeScreenShare || sess.remoteAccessApp)) c.push({ key: 'videoCallOngoing', points: 2, label: L.videoCallOngoing, quote: 'session signal from app' });
  const sm = Math.min(4, scriptMatches.length * 2);
  if (sm) c.push({ key: 'scripts', points: sm, label: L.scripts, quote: scriptMatches.map((s) => `${s.scriptId}: ${s.quote}`).join(' · ') });
  if (verifierFlags.some((f) => f.code === 'reported_payee')) c.push({ key: 'reported', points: 2, label: L.reported, quote: payment?.payeeAccount });
  if (signals.evidenceRefused) c.push({ key: 'refused', points: 1, label: L.refused });
  if (payment && payment.payeeAccountAgeDays <= POLICY.youngAccountDays) c.push({ key: 'young', points: 1, label: L.young, quote: `${payment.payeeAccountAgeDays} days` });
  (signals.legitimacyIndicators || []).slice(0, 2).forEach((l) => c.push({ key: 'legit', points: -2, label: `${L.legit}: ${l.indicator}`, quote: l.quote }));
  if (signals.purposeConsistentWithPayee === 'yes' && (evidenceDocs > 0 || (signals.legitimacyIndicators || []).some((l) => /document/i.test(l.indicator)))) c.push({ key: 'consistent', points: -2, label: L.consistent });
  const score = c.reduce((a, b) => a + b.points, 0);
  let outcome = 'proceed';
  if (score >= 9 || (signals.authorityClaimed?.value && signals.safeAccountLanguage?.value)) outcome = 'escalate';
  else if (score >= 5) outcome = 'hold_trusted_contact';
  // Two independent coercion indicators together mean a hold even if the score is low.
  else if (signals.coachedAnswerLikely?.value && signals.repliesDictated?.value) outcome = 'hold_trusted_contact';
  else if (score >= 2) outcome = 'proceed_with_warning';
  const top = c.filter((x) => x.points > 0).sort((a, b) => b.points - a.points).slice(0, 3);
  return { score, outcome, contributions: c, top };
}
