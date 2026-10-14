// Interview engine. Code picks the next move (slot) and the outcome; Gemini, when
// available, phrases the question naturally and extracts signals with quotes.
import { callGemini, aiMode } from './gemini.js';
import { extractSignalsOffline, verifyQuotes, matchScripts, verifyPayee, decide, emptySignals } from './policy.js';
import { semanticScriptMatches, mergeScriptMatches } from './semantic.js';

export const MAX_TURNS = 8;

export const Q = {
  en: {
    purpose: 'For transfers like this to a new payee, I ask a couple of quick questions. It is routine. What is this payment for?',
    coach_property: 'That sounds important. What is the builder\'s or seller\'s name, and when did you last visit the site?',
    coach_land: 'Which plot is it, who is selling it, and have you seen the land yourself?',
    coach_medical: 'I hope they are okay. Which hospital is it, and who is the patient?',
    coach_investment: 'Which bank or company is the investment with, and did you visit their branch?',
    who: 'How did you get these payment details? Is anyone on a phone or video call with you right now?',
    truth: 'One thing I must tell you clearly: no police or government agency in India asks for payment on a video call. Ever.',
    secrecy: 'Has anyone asked you to keep this payment private, or to finish it by a deadline?',
    evidence: 'Could you share the message, letter or document about this payment? A screenshot is fine.',
    thanks: 'Thank you.',
  },
  hi: {
    purpose: 'नए payee को इतने बड़े ट्रांसफ़र पर मैं दो-तीन छोटे सवाल पूछता हूँ। यह रूटीन है। यह पेमेंट किस लिए है?',
    coach_property: 'अच्छी बात है। बिल्डर या बेचने वाले का नाम क्या है, और आपने साइट आख़िरी बार कब देखी थी?',
    coach_land: 'कौन-सा प्लॉट है, कौन बेच रहा है, और क्या आपने ज़मीन खुद देखी है?',
    coach_medical: 'उम्मीद है सब ठीक होगा। कौन-सा अस्पताल है, और मरीज़ कौन है?',
    coach_investment: 'निवेश किस बैंक या कंपनी में है, और क्या आप उनकी ब्रांच गए थे?',
    who: 'यह पेमेंट डिटेल्स आपको किसने दीं? क्या अभी कोई आपसे फ़ोन या वीडियो कॉल पर बात कर रहा है?',
    truth: 'एक बात मैं साफ़ बताना चाहता हूँ: भारत में कोई भी पुलिस या सरकारी एजेंसी वीडियो कॉल पर पैसे नहीं मांगती। कभी नहीं।',
    secrecy: 'क्या किसी ने आपसे यह पेमेंट किसी को न बताने, या किसी तय समय तक करने को कहा है?',
    evidence: 'क्या आप इस पेमेंट से जुड़ा मैसेज, लेटर या कोई कागज़ दिखा सकते हैं? स्क्रीनशॉट भी चलेगा।',
    thanks: 'धन्यवाद।',
  },
};

export function finalMessage(outcome, lang, ctx) {
  const tc = ctx.trustedContact;
  const who = tc ? (lang === 'hi' ? `आपके ${tc.relationHi || tc.relation} ${tc.name.split(' ')[0]}` : `your ${tc.relation} ${tc.name.split(' ')[0]}`) : null;
  const top = ctx.top?.[0]?.label;
  if (lang === 'hi') return {
    proceed: 'धन्यवाद। सब ठीक लग रहा है, आपका पेमेंट भेजा जा रहा है।',
    proceed_with_warning: `धन्यवाद। आगे बढ़ने से पहले एक बात: ${top ? `"${top}"` : 'नए खाते में बड़ी रकम'} पर ध्यान दें। अगर कोई आप पर दबाव डाल रहा है, तो रुकें और 1930 पर कॉल करें।`,
    hold_trusted_contact: `आपके पैसे की सुरक्षा के लिए मैंने यह पेमेंट 24 घंटे के लिए रोक दिया है।${who ? ` ${who} को सूचित कर दिया है, आप उन्हें अभी कॉल कर सकते हैं।` : ''} आप किसी मुसीबत में नहीं हैं।`,
    escalate: `मैंने यह पेमेंट रोक दिया है। Bharat Bank के फ़्रॉड अधिकारी 15 मिनट में आपके रजिस्टर्ड नंबर पर कॉल करेंगे।${who ? ` ${who} को भी बता दिया है।` : ''} याद रखिए: कोई भी एजेंसी वीडियो कॉल पर गिरफ्तारी नहीं करती।`,
  }[outcome];
  return {
    proceed: 'Thank you. Everything looks fine, your payment is going through.',
    proceed_with_warning: `Thanks. Before you continue, please note: ${top ? `"${top}"` : 'this is a large amount to a new account'}. If anyone is pressuring you, stop and call 1930.`,
    hold_trusted_contact: `I have paused this payment for 24 hours to keep your money safe.${who ? ` I have let ${who} know, you can call them now.` : ''} You are not in trouble.`,
    escalate: `I have paused this payment. A Bharat Bank fraud officer will call your registered number within 15 minutes.${who ? ` I have also informed ${who}.` : ''} Remember: no agency arrests anyone on a video call.`,
  }[outcome];
}

export function trustedContactMessage(c, lang = 'en') {
  const tc = c.trustedContacts?.[0];
  if (!tc) return null;
  const amt = '₹' + Number(c.payment.amountINR).toLocaleString('en-IN');
  const first = c.customer.name.split(' ')[0];
  return lang === 'hi'
    ? `Bharat Bank: ${first} जी ${amt} एक नए खाते में भेजने की कोशिश कर रही/रहे हैं। हमने इसे रोक दिया है। कृपया उन्हें अभी कॉल करें। अगर कोई वीडियो कॉल पर पुलिस या CBI होने का दावा करे, तो यह स्कैम है।`
    : `Bharat Bank: ${first} is trying to send ${amt} to a new account. We've paused it. Please call them now. If someone claims to be police or CBI on a video call, it is a scam.`;
}

const detectLang = (text, fallback) => (/[ऀ-ॿ]/.test(text) ? 'hi' : /[a-z]{3,}/i.test(text) ? 'en' : fallback);

export function startInterview(c) {
  const lang = c.language || 'en';
  const iv = { lang, turns: [], asked: ['purpose'], saidTruth: false, signals: emptySignals(), scriptMatches: [], decision: null, done: false, evidenceNotes: [], engine: aiMode(), geminiNotes: [] };
  iv.turns.push({ role: 'ruko', text: Q[lang].purpose, slot: 'purpose', at: new Date().toISOString() });
  return iv;
}

const SIGNAL_SCHEMA = (() => {
  const b = { type: 'OBJECT', properties: { value: { type: 'BOOLEAN' }, quote: { type: 'STRING' } }, required: ['value'] };
  return {
    type: 'OBJECT',
    properties: {
      authorityClaimed: { type: 'OBJECT', properties: { value: { type: 'BOOLEAN' }, quote: { type: 'STRING' }, agency: { type: 'STRING' } }, required: ['value'] },
      safeAccountLanguage: b, threatOfArrestOrCase: b, secrecyDemanded: b, videoCallOngoing: b, thirdPartyDictating: b, urgencyOrDeadline: b,
      legitimacyIndicators: { type: 'ARRAY', items: { type: 'OBJECT', properties: { indicator: { type: 'STRING' }, quote: { type: 'STRING' } }, required: ['indicator', 'quote'] } },
    },
    required: ['authorityClaimed', 'safeAccountLanguage', 'threatOfArrestOrCase', 'secrecyDemanded', 'videoCallOngoing', 'thirdPartyDictating', 'urgencyOrDeadline', 'legitimacyIndicators'],
  };
})();

async function geminiSignals(iv, c) {
  const transcript = iv.turns.map((t) => `${t.role === 'ruko' ? 'RUKO' : 'CUSTOMER'}: ${t.text}`).join('\n');
  const ev = iv.evidenceNotes.map((n) => `EVIDENCE ${n.evidenceId}: ${n.text}`).join('\n');
  const r = await callGemini({
    name: 'signal_extractor', model: 'fast', schema: SIGNAL_SCHEMA,
    system: 'You extract scam signals from a bank payment-safety interview in India (Hindi or English). For each signal return value=true ONLY if the customer text or the evidence text supports it, and copy the exact supporting sentence verbatim into quote. If there is no exact quote, value must be false. Ignore sentences where the customer denies something (e.g. "No, nothing like that"). legitimacyIndicators are concrete details that support a genuine payment: a named document, an in-person visit, a known relationship. Quote them verbatim.',
    parts: [{ text: `Payee: ${c.payment?.payeeName}\n\n${transcript}\n\n${ev}` }],
  });
  if (!r.ok) { iv.geminiNotes.push(`signals fallback: ${r.reason}`); return null; }
  return r.json;
}

async function geminiPhrase(iv, intentKey, template, c) {
  const r = await callGemini({
    name: 'interviewer', model: 'fast', temperature: 0.5, timeoutMs: 10000,
    system: 'You are Ruko, a calm, respectful safety assistant inside Bharat Bank\'s payment flow in India. Rephrase the given intended message for this customer in the requested language (Hindi in Devanagari, or English), in at most two short sentences. Keep its meaning exactly. Never accuse, never use the words fraud or scam, never ask for OTP, PIN or password. If the intent is a follow-up, you may refer to what the customer just said. Return only the message.',
    parts: [{ text: `Language: ${iv.lang === 'hi' ? 'Hindi' : 'English'}\nCustomer: ${c.customer.name}, age ${c.customer.age}\nIntent: ${intentKey}\nIntended message: ${template}\nLast turns:\n${iv.turns.slice(-4).map((t) => `${t.role}: ${t.text}`).join('\n')}` }],
  });
  if (!r.ok || !r.text || r.text.length > 400 || /otp|pin|password|fraud|scam|धोखा/i.test(r.text)) return template;
  return r.text.trim();
}

function planNext(iv, sig) {
  let slot;
  // Common cover stories (property, land, medical, investment) get one concrete follow-up
  // a script would not anticipate, unless the payee already fits the stated purpose.
  if (sig.purposeCategory && sig.purposeConsistentWithPayee !== 'yes' && !iv.asked.includes('coach')) slot = 'coach';
  if (!slot) slot = ['who', 'secrecy', 'evidence'].find((x) => !iv.asked.includes(x)) || 'evidence';
  const key = slot === 'coach' ? `coach_${sig.purposeCategory}` : slot;
  return { slot, key, template: Q[iv.lang][key] || Q[iv.lang].who };
}

// One customer turn. notes: evidence notes for files attached with this turn.
// fixedPhrasing: speak the pre-voiced template questions (used when sound is on, so every
// Ruko line has a cached Gemini voice and the voice never switches mid-conversation).
export async function customerTurn(c, { text, latencyMs = null, attached = [], notes = [], fixedPhrasing = false }) {
  const iv = c.interview;
  if (iv.done) return iv;
  const lastRuko = [...iv.turns].reverse().find((t) => t.role === 'ruko' && t.slot);
  iv.lang = detectLang(text, iv.lang);
  iv.turns.push({ role: 'customer', text, slot: lastRuko?.slot, latencyMs, attached, at: new Date().toISOString() });
  iv.evidenceNotes.push(...notes);

  // Signals: structural ones always from code, semantic ones from Gemini when available.
  // The next move is chosen from the deterministic signals so Gemini's signal call and its
  // phrasing call can run in parallel (halves the wait per turn).
  const base = extractSignalsOffline({ turns: iv.turns, evidenceNotes: iv.evidenceNotes, payment: c.payment });
  const custSoFar = iv.turns.filter((t) => t.role === 'customer').length;
  const willFinish = iv.turns.some((t) => t.role === 'customer' && t.slot === 'evidence') || custSoFar >= MAX_TURNS;
  const plan = willFinish ? null : planNext(iv, base);
  const [g, phrased, sem] = await Promise.all([
    aiMode() === 'gemini' ? geminiSignals(iv, c) : null,
    plan && aiMode() === 'gemini' && !fixedPhrasing ? geminiPhrase(iv, plan.key, plan.template, c) : plan?.template,
    aiMode() === 'gemini' ? semanticScriptMatches({ turns: iv.turns, evidenceNotes: iv.evidenceNotes }) : null,
  ]);
  let sig = base;
  if (g) {
    const merged = { ...base, ...g, coachedAnswerLikely: base.coachedAnswerLikely, repliesDictated: base.repliesDictated, purposeStated: base.purposeStated, purposeCategory: base.purposeCategory, purposeConsistentWithPayee: base.purposeConsistentWithPayee, evidenceOffered: base.evidenceOffered, evidenceRefused: base.evidenceRefused };
    const v = verifyQuotes(merged, { turns: iv.turns, evidenceNotes: iv.evidenceNotes });
    if (v.dropped.length) iv.geminiNotes.push(`dropped unquoted signals: ${v.dropped.join(', ')}`);
    sig = v.sig;
    sig.source = 'gemini';
  }
  iv.signals = sig;
  iv.scriptMatches = mergeScriptMatches(matchScripts({ turns: iv.turns, evidenceNotes: iv.evidenceNotes }), sem);
  iv.verifierFlags = verifyPayee(c.payment);
  const evidenceDocs = iv.turns.filter((t) => t.attached?.length).length;
  iv.decision = decide({ signals: sig, scriptMatches: iv.scriptMatches, payment: c.payment, verifierFlags: iv.verifierFlags, lang: iv.lang, evidenceDocs });

  const custTurns = iv.turns.filter((t) => t.role === 'customer').length;
  const answeredEvidence = iv.turns.some((t) => t.role === 'customer' && t.slot === 'evidence');
  if (answeredEvidence || custTurns >= MAX_TURNS) {
    iv.done = true;
    iv.outcome = iv.decision.outcome;
    iv.rationale = iv.decision.top.map((t) => t.label).join(' · ');
    iv.decidedAt = new Date().toISOString();
    iv.turns.push({ role: 'ruko', text: finalMessage(iv.outcome, iv.lang, { trustedContact: c.trustedContacts?.[0], top: iv.decision.top }), final: true, at: iv.decidedAt });
    return iv;
  }

  // Next move (chosen above by code); the one true thing is said once, the first time any
  // source (rules or Gemini) hears an authority claim.
  if ((sig.authorityClaimed?.value || base.authorityClaimed?.value) && !iv.saidTruth) {
    iv.turns.push({ role: 'ruko', text: Q[iv.lang].truth, kind: 'truth', at: new Date().toISOString() });
    iv.saidTruth = true;
  }
  iv.asked.push(plan.slot);
  iv.turns.push({ role: 'ruko', text: phrased || plan.template, slot: plan.slot, at: new Date().toISOString() });
  return iv;
}

// The customer stopped answering (or left): decide with what we have.
export function finalize(c) {
  const iv = c.interview;
  if (iv.done) return iv;
  iv.done = true;
  iv.outcome = iv.decision?.outcome || 'proceed_with_warning';
  iv.rationale = (iv.decision?.top || []).map((t) => t.label).join(' · ');
  iv.decidedAt = new Date().toISOString();
  iv.endedEarly = true;
  iv.turns.push({ role: 'ruko', text: finalMessage(iv.outcome, iv.lang, { trustedContact: c.trustedContacts?.[0], top: iv.decision?.top }), final: true, at: iv.decidedAt });
  return iv;
}
