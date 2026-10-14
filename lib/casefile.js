// Case file: money trail, rule checker (working-day clocks), drafter and the
// document validator that blocks any value not traced to a confirmed fact.
import { callGemini, aiMode } from './gemini.js';
import { reportedLists } from './policy.js';

// ---------- working days ----------
// Illustrative holiday list for the demo; a bank would load the RBI holiday calendar for its state.
const HOLIDAYS = new Set(['2026-01-26', '2026-03-04', '2026-03-21', '2026-04-03', '2026-05-01', '2026-08-15', '2026-08-28', '2026-10-02', '2026-10-20', '2026-11-08', '2026-12-25']);
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const fmt = (d) => `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
export const parseDMY = (s) => { const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s || ''); return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null; };

export function isWorkingDay(d) {
  if (d.getDay() === 0) return false;
  if (d.getDay() === 6) { const nth = Math.ceil(d.getDate() / 7); if (nth === 2 || nth === 4) return false; }
  return !HOLIDAYS.has(iso(d));
}
export function addWorkingDays(start, n) {
  const d = new Date(start);
  let added = 0;
  while (added < n) { d.setDate(d.getDate() + 1); if (isWorkingDay(d)) added++; }
  return d;
}
export function workingDaysBetween(a, b) {
  let n = 0; const d = new Date(a);
  while (d < b) { d.setDate(d.getDate() + 1); if (d <= b && isWorkingDay(d)) n++; }
  return n;
}

// ---------- helpers ----------
const confirmed = (c) => c.facts.filter((f) => f.state === 'confirmed' && f.value);
const inr = (n) => '₹' + Number(n).toLocaleString('en-IN');
const groupsOf = (c) => {
  const g = {};
  for (const f of confirmed(c)) if (f.group !== 'claim') (g[f.group] ||= {})[f.type] = f;
  return g;
};

// ---------- money trail ----------
export function buildTrail(c) {
  const reported = reportedLists();
  const groups = groupsOf(c);
  const all = {};
  for (const f of c.facts) if (f.group !== 'claim') (all[f.group] ||= []).push(f);
  const legs = [];
  for (const [g, fs] of Object.entries(all)) {
    if (!fs.some((f) => f.type === 'amount')) continue;
    const k = groups[g] || {};
    const ok = !!(k.amount && (k.utr || (k.date && k.beneficiary_account)));
    const missing = ['amount', 'utr', 'date', 'beneficiary_account'].filter((t) => !k[t]);
    legs.push({
      id: g, from: c.customer.accountMasked, to: k.beneficiary_account?.value || '(unknown account)', toName: k.beneficiary_name?.value || null,
      amountINR: k.amount ? Number(k.amount.value) : null, utr: k.utr?.value || null, date: k.date?.value || null,
      factIds: Object.values(k).map((f) => f.id), confirmed: ok, missing,
      flagged: k.beneficiary_account && reported.accounts.includes(k.beneficiary_account.value),
      decisionHolders: [
        { who: 'receiving_bank', label: 'Receiving bank', role: 'Holds the lien on money still in the account' },
        { who: 'cyber_cell', label: 'Cyber cell (via 1930 / CFCFRMS)', role: 'Requests hold and traces onward legs' },
        { who: 'magistrate_court', label: 'Magistrate court', role: 'Orders release of frozen money (verify exact BNSS provision)' },
      ],
    });
  }
  legs.sort((a, b) => (parseDMY(a.date) || 0) - (parseDMY(b.date) || 0));
  const lost = legs.reduce((s, l) => s + (l.amountINR || 0), 0);
  const traced = legs.filter((l) => l.confirmed).reduce((s, l) => s + l.amountINR, 0);
  c.moneyTrail = { legs, totals: { lost, traced, gap: lost - traced }, onward: 'Onward legs from receiving accounts are unknown until banks or the cyber cell share them.' };
  return c.moneyTrail;
}

// ---------- frozen-holder analysis ----------
export function frozenAnalysis(c) {
  const all = confirmed(c);
  const get = (t) => all.find((f) => f.type === t);
  const credit = get('disputed_credit'), bal = get('frozen_balance');
  const a = { disputedINR: credit ? Number(credit.value) : null, frozenINR: bal ? Number(bal.value) : null, factIds: [credit?.id, bal?.id, get('freeze_reference')?.id, get('utr')?.id].filter(Boolean) };
  if (a.disputedINR != null && a.frozenINR != null) { a.excessINR = a.frozenINR - a.disputedINR; a.proportion = a.disputedINR / a.frozenINR; }
  c.frozen = a;
  return a;
}

// ---------- clocks (RBI 6 July 2017 circular) ----------
export function computeClocks(c) {
  const reportDate = new Date(c.reportedAt || c.createdAt);
  const txnDates = confirmed(c).filter((f) => f.type === 'date').map((f) => parseDMY(f.value)).filter(Boolean).sort((a, b) => a - b);
  const clocks = [];
  if (txnDates.length) {
    const first = txnDates[0];
    const elapsed = workingDaysBetween(first, reportDate);
    const band = elapsed <= 3 ? 'within 3 working days (zero-liability band)' : elapsed <= 7 ? '4–7 working days (limited-liability band)' : 'more than 7 working days';
    clocks.push({ key: 'reported', label: 'Reported to bank', value: `${elapsed} working day(s) after the first transaction: ${band}`, date: fmt(reportDate) });
    clocks.push({ key: 'report_by', label: 'Zero-liability window closes', date: fmt(addWorkingDays(first, 3)) });
  }
  clocks.push({ key: 'shadow', label: 'Shadow credit due (if covered)', date: fmt(addWorkingDays(reportDate, 10)) });
  c.clocks = { list: clocks, note: 'These timelines apply to unauthorised transactions. Payments the customer authorised under deception are not currently covered by this circular, which is the gap this product addresses.' };
  return c.clocks;
}

// ---------- drafter ----------
// Templates use {{fact:ID}} and {{meta:key}} placeholders. Code fills values.
function meta(c) {
  const m = {
    caseId: c.id, name: c.customer.name, age: String(c.customer.age), city: c.customer.city, account: c.customer.accountMasked, phone: c.customer.phoneMasked,
    generated: fmt(new Date()), reportDate: fmt(new Date(c.reportedAt || c.createdAt)),
  };
  if (c.moneyTrail) { m.lost = inr(c.moneyTrail.totals.lost); m.traced = inr(c.moneyTrail.totals.traced); m.gap = inr(c.moneyTrail.totals.gap); }
  if (c.frozen?.excessINR != null) { m.excess = inr(c.frozen.excessINR); }
  (c.clocks?.list || []).forEach((k) => { m[`clock_${k.key}`] = k.date; });
  return m;
}

const F = (id) => `{{fact:${id}}}`;
const typeLabel = { amount: 'Amount', utr: 'UTR / reference', date: 'Date', beneficiary_name: 'Beneficiary', beneficiary_account: 'Beneficiary account', ifsc: 'IFSC', impersonated_agency: 'Agency impersonated', case_number_claimed: 'Fake case number', phone_number: 'Scammer phone', demand: 'Demand', deadline: 'Deadline', secrecy_instruction: 'Secrecy instruction', disputed_credit: 'Disputed credit', frozen_balance: 'Frozen balance', freeze_reference: 'Freeze reference', remitter_name: 'Remitter', account_masked: 'Account' };

function txnTable(c) {
  const legs = c.moneyTrail?.legs || [];
  if (!legs.length) return 'No confirmed transactions yet.';
  return legs.map((l, i) => {
    const k = groupsOf(c)[l.id] || {};
    const cell = (t) => (k[t] ? F(k[t].id) : '[missing]');
    return `${i + 1}. ${cell('date')} · ${cell('amount')} · to ${cell('beneficiary_account')}${k.beneficiary_name ? ` (${F(k.beneficiary_name.id)})` : ''}${k.ifsc ? ` · IFSC ${F(k.ifsc.id)}` : ''} · UTR ${cell('utr')}${l.confirmed ? '' : ' · INCOMPLETE'}`;
  }).join('\n');
}
function claimList(c) {
  const cl = confirmed(c).filter((f) => f.group === 'claim');
  return cl.length ? cl.map((f) => `- ${typeLabel[f.type] || f.type}: ${F(f.id)} (exhibit ${f.source.evidenceId})`).join('\n') : '- None confirmed';
}
function exhibits(c) {
  return c.evidence.map((e, i) => {
    const fs = confirmed(c).filter((f) => f.source.evidenceId === e.id);
    return `Exhibit ${i + 1} (${e.id}): ${e.title || e.fileName}\n${fs.map((f) => `   - ${typeLabel[f.type] || f.type}: ${F(f.id)} [region ${f.source.box2d.join(',')}]`).join('\n') || '   - no confirmed facts'}`;
  }).join('\n');
}

function templates(c, narrative) {
  // The victim's own words are theirs, not system output: fenced so the validator skips them.
  const story = narrative || (c.story ? `<<USER>>${c.story}<</USER>>` : '');
  const T = {};
  if (c.door === 'frozen_holder') {
    const fz = c.frozen || {};
    const fid = (t) => confirmed(c).find((f) => f.type === t)?.id;
    T.bona_fides_pack = `To: The Branch Manager / Nodal Officer, Bharat Bank\nFrom: {{meta:name}}, A/c {{meta:account}}, {{meta:city}}\nDate: {{meta:generated}}\nCase: {{meta:caseId}}\n\nSubject: Request to limit the debit freeze to the disputed amount\n\n1. My account was debit-frozen under reference ${fid('freeze_reference') ? F(fid('freeze_reference')) : '[missing]'}.\n2. The only transaction I understand to be under question is a credit of ${fid('disputed_credit') ? F(fid('disputed_credit')) : '[missing]'} received on ${fid('date') ? F(fid('date')) : '[missing]'} (UPI ref ${fid('utr') ? F(fid('utr')) : '[missing]'}) from ${fid('remitter_name') ? F(fid('remitter_name')) : '[missing]'}, in the ordinary course of my business.\n3. The frozen balance is ${fid('frozen_balance') ? F(fid('frozen_balance')) : '[missing]'}. ${fz.excessINR != null ? 'The amount frozen in excess of the disputed credit is {{meta:excess}}.' : ''}\n4. I request that the freeze be converted into a lien limited to the disputed amount, so that the remaining balance is released for business operations, and that I be told which authority requested the freeze.\n5. I am willing to cooperate with any inquiry and to provide invoices and KYC documents.\n\nNote: High Courts (Delhi 2025; Rajasthan 2026; Punjab and Haryana 2026) have reportedly criticised disproportionate freezes of bona fide accounts. Verify citations before relying on them.\n\n{{meta:name}}`;
    T.plain_summary = c.language === 'hi'
      ? `आपका केस: {{meta:caseId}}\n\nक्या हुआ: आपका खाता {{meta:account}} फ़्रीज़ है। जिस लेन-देन पर सवाल है वह ${fid('disputed_credit') ? F(fid('disputed_credit')) : '[missing]'} का है, जबकि फ़्रीज़ रकम ${fid('frozen_balance') ? F(fid('frozen_balance')) : '[missing]'} है।\n\nहमने क्या तैयार किया: बैंक को एक पत्र जिसमें पूरे फ़्रीज़ की जगह सिर्फ़ विवादित रकम पर lien लगाने की माँग है।\n\nआगे क्या: यह पत्र अपनी ब्रांच में जमा करें और रसीद लें। ज़रूरत हो तो वकील से सलाह लें। यह कानूनी सलाह नहीं है।`
      : `Your case: {{meta:caseId}}\n\nWhat happened: account {{meta:account}} is frozen. The transaction in question is ${fid('disputed_credit') ? F(fid('disputed_credit')) : '[missing]'}, while the frozen balance is ${fid('frozen_balance') ? F(fid('frozen_balance')) : '[missing]'}.\n\nWhat we prepared: a letter asking the bank to limit the freeze to the disputed amount.\n\nNext: submit it at your branch and keep the acknowledgement. Consult an advocate if needed. This is not legal advice.`;
    return T;
  }
  T.complaint_1930 = `NCRP / 1930 COMPLAINT DRAFT\nCase: {{meta:caseId}} · Prepared {{meta:generated}}\n\nComplainant: {{meta:name}}, age {{meta:age}}, {{meta:city}}. Phone {{meta:phone}}. Account {{meta:account}}.\nCategory: Online financial fraud, impersonation of officials ("digital arrest").\n\nIncident summary:\n${story}\n\nTransactions:\n${txnTable(c)}\n\nSuspect identifiers:\n${claimList(c)}\n\nTotal lost: {{meta:lost}}. Evidence: ${c.evidence.length} file(s) attached as exhibits.`;
  T.bank_dispute = `To: The Grievance Redressal Officer, Bharat Bank\nFrom: {{meta:name}}, A/c {{meta:account}}\nDate: {{meta:generated}} · Case {{meta:caseId}}\n\nSubject: Fraudulent transfers under coercion — request to coordinate lien and recovery\n\nI was coerced by persons impersonating officials into making the following transfers:\n${txnTable(c)}\n\nI reported this to the bank on {{meta:reportDate}}. I request that the bank (a) notify the receiving banks to mark a lien on the amounts above, (b) record this as a fraud report under its customer-protection policy, and (c) share the status and the officer handling the case.\n\nTotal lost: {{meta:lost}}; traced with complete details: {{meta:traced}}.\n\n{{meta:name}}`;
  T.cyber_cell_annexure = `EVIDENCE ANNEXURE · Case {{meta:caseId}}\nPrepared {{meta:generated}}. Every fact below was confirmed by the complainant against the source region shown.\n\n${exhibits(c)}\n\nMoney trail:\n${txnTable(c)}`;
  T.release_application = `DRAFT · FOR ADVOCATE REVIEW · NOT LEGAL ADVICE\n\nBefore the Court of the Judicial Magistrate, {{meta:city}}\n\nApplication for release of frozen amounts to the victim\n(release provision under the BNSS to be verified by counsel)\n\nApplicant: {{meta:name}}, age {{meta:age}}\n\n1. The applicant was defrauded through impersonation of officials and transferred the amounts listed below.\n${txnTable(c)}\n2. The amounts are reported to be under lien in the receiving accounts following the complaint to 1930 / NCRP.\n3. The applicant prays that the amounts under lien be released to the applicant's account {{meta:account}}, on such terms as the Court deems fit.\n\nPlace: {{meta:city}} · Date: {{meta:generated}}`;
  T.plain_summary = c.language === 'hi'
    ? `आपका केस: {{meta:caseId}}\n\nक्या हुआ: खुद को अधिकारी बताने वाले लोगों ने डराकर आपसे पैसे ट्रांसफ़र करवाए। कुल रकम {{meta:lost}} है।\n\nहमने क्या तैयार किया: 1930 शिकायत का ड्राफ़्ट, बैंक को पत्र, साइबर सेल के लिए सबूतों की सूची, और वकील के लिए एक ड्राफ़्ट।\n\nअभी क्या करें: अगर अभी तक नहीं किया है तो तुरंत 1930 पर कॉल करें या cybercrime.gov.in पर शिकायत करें। बैंक को पत्र दें। किसी को भी OTP या PIN न बताएँ।\n\nयाद रखें: पैसा वापस आने की कोई गारंटी नहीं है, लेकिन जितनी जल्दी रिपोर्ट करेंगे, उतना अच्छा। यह कानूनी सलाह नहीं है।`
    : `Your case: {{meta:caseId}}\n\nWhat happened: people pretending to be officials frightened you into transferring money. Total: {{meta:lost}}.\n\nWhat we prepared: a 1930 complaint draft, a letter to your bank, an evidence list for the cyber cell, and a draft for an advocate.\n\nWhat to do now: if you have not already, call 1930 or file at cybercrime.gov.in. Give the letter to your bank. Never share an OTP or PIN.\n\nThere is no guarantee the money comes back, but reporting fast helps. This is not legal advice.`;
  return T;
}

const STATIC_ALLOWED = ['1930', '2017', '2023', '2025', '2026'];

export function render(body, c) {
  const m = meta(c);
  const used = new Set();
  const out = body.replace(/\{\{fact:(F\d+)\}\}/g, (_, id) => {
    const f = c.facts.find((x) => x.id === id && x.state === 'confirmed');
    if (!f) return '[untraced]';
    used.add(id);
    return ['amount', 'disputed_credit', 'frozen_balance'].includes(f.type) ? inr(f.value) : f.value;
  }).replace(/\{\{meta:(\w+)\}\}/g, (_, k) => m[k] ?? '[missing]');
  return { text: out, factIdsUsed: [...used] };
}

// Release gate: every number-like token in a rendered document must trace to a
// confirmed fact, to case metadata, or to a small static whitelist.
export function validate(text, c) {
  const m = meta(c);
  const allowed = new Set(STATIC_ALLOWED);
  // A traced value also allows its parts: "RK-2026-000101" allows "000101", "+91 98110 41230" allows "98110".
  const add = (v) => {
    if (!v) return;
    const str = String(v);
    allowed.add(str.replace(/[₹,\s]|Rs\.?/g, '').replace(/\.0+$/, ''));
    for (const part of str.split(/[^A-Za-z0-9]+/)) if (part) allowed.add(part);
  };
  confirmed(c).forEach((f) => add(f.value));
  Object.values(m).forEach(add);
  (c.clocks?.list || []).forEach((k) => add(k.date));
  const problems = [];
  text = text.replace(/<<USER>>[\s\S]*?<<\/USER>>/g, '');
  const rx = /₹\s?[\d,]+(?:\.\d+)?|Rs\.?\s?[\d,]+(?:\.\d+)?|\b[A-Z]{4}0[A-Z0-9]{6}\b|\b[A-Z]{3,6}R?\d{8,}\b|\b\d{2}-\d{2}-\d{4}\b|\b\d{5,18}\b|\b[A-Z]{2,5}\/[A-Z]{2,5}\/\d{4}\/\d+\b/g;
  for (const tok of text.match(rx) || []) {
    const n = tok.replace(/[₹,\s]|Rs\.?/g, '').replace(/\.0+$/, '');
    if (!allowed.has(n) && !allowed.has(tok)) problems.push(tok);
  }
  if (/\[untraced\]/.test(text)) problems.push('[untraced placeholder]');
  return { ok: problems.length === 0, problems: [...new Set(problems)] };
}

const NARRATIVE_SCHEMA = { type: 'OBJECT', properties: { narrative: { type: 'STRING' } }, required: ['narrative'] };

async function geminiNarrative(c) {
  const facts = confirmed(c).map((f) => `${f.id} | ${f.type} | ${f.value}`).join('\n');
  const r = await callGemini({
    name: 'drafter', model: 'pro', schema: NARRATIVE_SCHEMA, timeoutMs: 30000,
    system: 'You write the incident summary paragraph for an Indian cyber-fraud complaint, in plain formal English, 4 to 6 sentences. You receive the victim\'s own account and a list of CONFIRMED facts with ids. Rules: never write any amount, date, account number, UTR, IFSC, phone number or case number yourself. Wherever you need one, write the placeholder {{fact:ID}} using the id from the list. Mention every transaction (every amount fact) in date order. When you cite an instruction or demand fact, put the placeholder inside double quotation marks. Do not invent facts that are not in the list or the account. Do not give legal conclusions.',
    parts: [{ text: `Victim account of events:\n${c.story || ''}\n\nConfirmed facts:\n${facts}` }],
  });
  return r.ok ? r.json.narrative : null;
}

export async function draftArtefacts(c) {
  if (c.door === 'frozen_holder') frozenAnalysis(c); else buildTrail(c);
  computeClocks(c);
  let narrative = null, narrativeNote = null;
  if (aiMode() === 'gemini' && c.door !== 'frozen_holder') {
    narrative = await geminiNarrative(c);
    if (narrative) {
      const test = render(narrative, c);
      const v = validate(test.text, c);
      if (!v.ok) { narrativeNote = `Gemini narrative blocked: untraced ${v.problems.join(', ')}. Used the victim's own words instead.`; narrative = null; }
    } else narrativeNote = 'Gemini unavailable; used the victim\'s own words.';
  }
  const T = templates(c, narrative);
  const prev = Object.fromEntries((c.artefacts || []).map((a) => [a.kind, a]));
  c.artefacts = Object.entries(T).map(([kind, tpl]) => {
    const r = render(tpl, c);
    const v = validate(r.text, c);
    const body = r.text.replace(/<<USER>>([\s\S]*?)<<\/USER>>/g, 'In the complainant\'s own words: "$1"');
    return { kind, body, factIdsUsed: r.factIdsUsed, validation: v, status: v.ok ? (prev[kind]?.status === 'approved' ? 'approved' : 'draft') : 'blocked', engine: kind === 'complaint_1930' && narrative ? 'gemini+template' : 'template' };
  });
  c.narrativeNote = narrativeNote;
  return c.artefacts;
}

export function statusLine(c) {
  const facts = c.facts || [];
  const total = facts.length || 1;
  const done = facts.filter((f) => f.state === 'confirmed' || f.state === 'rejected').length;
  const completeness = Math.round((done / total) * 100);
  let owner = 'You', text = 'Upload what you have';
  if (facts.length && facts.some((f) => f.state === 'needs_check')) { owner = 'You'; text = 'Check the highlighted facts'; }
  else if (c.artefacts?.length && c.artefacts.some((a) => a.status === 'draft')) { owner = 'Reviewer'; text = 'Approve the drafted documents'; }
  else if (c.artefacts?.length) { owner = c.door === 'frozen_holder' ? 'Your bank branch' : 'Bharat Bank fraud desk and the cyber cell'; text = c.door === 'frozen_holder' ? 'Respond to the request to limit the freeze' : 'Mark lien with receiving banks and acknowledge the complaint'; }
  const by = c.clocks?.list?.find((k) => k.key === 'shadow')?.date;
  return { completeness, owner, text, by };
}
