import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trigger, decide, emptySignals, verifyQuotes } from '../lib/policy.js';
import { validate, addWorkingDays, isWorkingDay, fmt } from '../lib/casefile.js';
import { startInterview, customerTurn, finalize } from '../lib/interviewer.js';
import { EVAL_CASES, RED_TEAM } from '../data/evalset.js';
import { settings } from '../lib/gemini.js';

// Unit tests are deterministic: never call the network, even if .env has a key.
settings.forceOffline = true;

const sig = (on = {}, extra = {}) => { const s = emptySignals(); for (const k of Object.keys(on)) s[k] = { value: true, quote: on[k] }; return { ...s, ...extra }; };
const pay = { amountINR: 900000, payeeName: 'Shree Traders', payeeAccount: '1', payeeIsNew: true, payeeAccountAgeDays: 400, amountVs90DayMax: 2, sessionSignals: {} };

test('trigger: small known payee does not fire', () => {
  assert.equal(trigger({ ...pay, amountINR: 5000, payeeIsNew: false, amountVs90DayMax: 1 }).triggered, false);
});
test('trigger: official-sounding payee name fires', () => {
  assert.ok(trigger({ ...pay, amountINR: 30000, payeeIsNew: false, payeeName: 'RBI Verification Cell' }).reasons.some((r) => r.code === 'payee_name_words'));
});
test('decider: pure legit with documents proceeds', () => {
  const d = decide({ signals: sig({}, { legitimacyIndicators: [{ indicator: 'Supporting document described', quote: 'agreement' }, { indicator: 'In-person contact', quote: 'visited' }], purposeConsistentWithPayee: 'yes' }), payment: pay, evidenceDocs: 1 });
  assert.equal(d.outcome, 'proceed');
});
test('decider: authority + safe account always escalates', () => {
  assert.equal(decide({ signals: sig({ authorityClaimed: 'CBI officer', safeAccountLanguage: 'RBI verification' }), payment: pay }).outcome, 'escalate');
});
test('decider: coached + dictated means hold even with a low score', () => {
  const s = sig({}, { coachedAnswerLikely: { value: true, reason: 'x' }, repliesDictated: { value: true, reason: 'y' } });
  assert.equal(decide({ signals: s, payment: pay }).outcome, 'hold_trusted_contact');
});
test('decider: video call alone only warns', () => {
  assert.equal(decide({ signals: sig({ videoCallOngoing: 'on video' }), payment: pay }).outcome, 'proceed_with_warning');
});
test('decider: reported payee + evidence refused + young account warns, does not hold', () => {
  const d = decide({ signals: sig({}, { evidenceRefused: true }), payment: { ...pay, payeeAccountAgeDays: 5 }, verifierFlags: [{ code: 'reported_payee' }] });
  assert.equal(d.score, 4); assert.equal(d.outcome, 'proceed_with_warning');
});
test('decider: every positive contribution carries a quote or reason when it comes from a signal', () => {
  const d = decide({ signals: sig({ authorityClaimed: 'ED officer said', secrecyDemanded: 'tell no one' }), payment: pay });
  for (const c of d.contributions.filter((x) => ['authorityClaimed', 'secrecyDemanded'].includes(x.key))) assert.ok(c.quote);
});

test('eval set: all 44 cases classified as expected (regression)', async () => {
  for (const ec of [...EVAL_CASES, ...RED_TEAM]) {
    const c = { language: ec.lang, payment: ec.payment, customer: { name: 'T', age: 60 }, trustedContacts: [] };
    let outcome = 'proceed';
    if (trigger(ec.payment).triggered) {
      c.interview = startInterview(c);
      for (const r of ec.replies) { if (c.interview.done) break; await customerTurn(c, { text: r, latencyMs: ec.fastReplies ? 600 : 4000 }); }
      finalize(c); outcome = c.interview.outcome;
    }
    const cls = ['hold_trusted_contact', 'escalate'].includes(outcome) ? 'stop' : 'allow';
    assert.equal(cls, ec.expect, `${ec.id} expected ${ec.expect}, got ${outcome}`);
  }
});

const caseWith = (facts) => ({ id: 'RK-2026-000101', createdAt: '2026-10-14T10:00:00Z', customer: { name: 'A', age: 60, city: 'X', accountMasked: 'XX4402', phoneMasked: '+91 9XXXX X2210' }, facts, evidence: [] });
test('validator: traced values pass', () => {
  const c = caseWith([{ id: 'F1', type: 'amount', value: '450000', state: 'confirmed', group: 'e:txn1', source: {} }]);
  assert.equal(validate('Amount ₹4,50,000 for case RK-2026-000101', c).ok, true);
});
test('validator: a fabricated amount is blocked', () => {
  const c = caseWith([{ id: 'F1', type: 'amount', value: '450000', state: 'confirmed', group: 'e:txn1', source: {} }]);
  const v = validate('Amount ₹4,50,000 and also ₹5,00,000', c);
  assert.equal(v.ok, false); assert.ok(v.problems.includes('₹5,00,000'));
});
test('validator: an unconfirmed fact does not count as traced', () => {
  const c = caseWith([{ id: 'F1', type: 'utr', value: '641209883311', state: 'needs_check', group: 'e:txn1', source: {} }]);
  assert.equal(validate('UTR 641209883311', c).ok, false);
});
test('validator: the victim\'s own words are not validated', () => {
  assert.equal(validate('<<USER>>I lost ₹6.4 lakh<</USER>>', caseWith([])).ok, true);
});

test('working days: Sundays and 2nd/4th Saturdays are skipped', () => {
  assert.equal(isWorkingDay(new Date(2026, 9, 11)), false); // Sunday
  assert.equal(isWorkingDay(new Date(2026, 9, 10)), false); // 2nd Saturday
  assert.equal(isWorkingDay(new Date(2026, 9, 3)), true);   // 1st Saturday
  assert.equal(fmt(addWorkingDays(new Date(2026, 9, 9), 1)), '12-10-2026'); // Fri → Mon
});

test('quote check: whitespace/punctuation differences pass, Ruko\'s own words and paraphrases fail', () => {
  const turns = [{ role: 'ruko', text: 'क्या कोई अधिकारी वीडियो कॉल पर है?' }, { role: 'customer', text: 'हाँ, एक अधिकारी वीडियो कॉल पर हैं।\nउन्होंने कहा है कि यह RBI वेरिफिकेशन है' }];
  const s = emptySignals();
  s.authorityClaimed = { value: true, quote: 'एक अधिकारी वीडियो कॉल पर हैं उन्होंने कहा है' };
  s.secrecyDemanded = { value: true, quote: 'उन्होंने किसी को न बताने को कहा' };
  s.videoCallOngoing = { value: true, quote: 'क्या कोई अधिकारी वीडियो कॉल पर है' };
  const { sig } = verifyQuotes(s, { turns });
  assert.equal(sig.authorityClaimed.value, true);
  assert.equal(sig.secrecyDemanded.value, false);
  assert.equal(sig.videoCallOngoing.value, false);
});

test('override is idempotent: a second "send anyway" adds no audit entry or SMS', async () => {
  const { createApp } = await import('../lib/app.js');
  const { SCENARIOS, repliesFor } = await import('../data/scenarios.js');
  let db = null;
  const app = createApp({ loadDb: () => db, saveDb: (d) => { db = d; }, putEvidence() {}, getEvidenceDataUrl: () => '', getEvidenceBytes: () => null, evidenceUrl: () => '', deleteEvidence() {}, synth: async () => null, prewarm: () => 0, voices: {} });
  const call = async (m, p, b) => (await app.handle({ ip: '127.0.0.1', method: m, path: p, rawUrl: p, headers: {} }, b || {})).json;
  let c = await call('POST', '/api/cases', { scenarioId: 'A', language: 'en' });
  c = await call('POST', `/api/cases/${c.id}/pay`, { payment: SCENARIOS.A.payment });
  for (const r of repliesFor(SCENARIOS.A, 'en')) { if (c.interview.done) break; c = await call('POST', `/api/cases/${c.id}/turn`, { text: r.text, latencyMs: 3000 }); }
  assert.ok(c.hold, 'scenario A should be held');
  const once = await call('POST', `/api/cases/${c.id}/override`);
  const twice = await call('POST', `/api/cases/${c.id}/override`);
  assert.equal(twice.audit.length, once.audit.length);
  assert.equal(twice.notifications.length, once.notifications.length);
});

test('semantic script matching: off when offline, keyword matches win on merge', async () => {
  const { semanticScriptMatches, mergeScriptMatches, SEMANTIC } = await import('../lib/semantic.js');
  assert.equal(await semanticScriptMatches({ turns: [{ role: 'customer', text: 'A parcel in my name had drugs in it, the customs officer said.' }] }), null, 'tests run offline');
  assert.ok(SEMANTIC.threshold >= 0.85, 'threshold stays conservative');
  const kw = [{ scriptId: 'S01', name: 'Parcel', quote: 'parcel' }];
  const sem = [{ scriptId: 'S01', quote: 'x', method: 'semantic' }, { scriptId: 'S02', quote: 'y', method: 'semantic' }];
  const m = mergeScriptMatches(kw, sem);
  assert.deepEqual(m.map((x) => `${x.scriptId}:${x.method}`), ['S01:keyword', 'S02:semantic']);
});

test('simulator stories open real cases that the desk and officer view list, with the complaint', async () => {
  const { createApp } = await import('../lib/app.js');
  let db = null;
  const app = createApp({ loadDb: () => db, saveDb: (d) => { db = d; }, putEvidence() {}, getEvidenceDataUrl: () => '', getEvidenceBytes: () => null, evidenceUrl: () => '', deleteEvidence() {}, synth: async () => null, prewarm: () => 0, voices: {} });
  const call = async (m, p, b) => (await app.handle({ ip: '127.0.0.1', method: m, path: p, rawUrl: p, headers: {} }, b || {})).json;
  const c = await call('POST', '/api/switch/case', { streamId: 'D' });
  assert.equal(c.moneyTrail.totals.lost, 19998);
  const f = await call('POST', '/api/switch/case/' + c.id + '/file');
  assert.ok(/^3101\d{9}$/.test(f.complaint.ack));
  const again = await call('POST', '/api/switch/case/' + c.id + '/file');
  assert.equal(again.complaint.ack, f.complaint.ack, 'filing twice keeps one complaint');
  const row = (await call('GET', '/api/cases')).find((r) => r.id === c.id);
  assert.equal(row.complaint, f.complaint.ack);
  assert.equal(row.lostINR, 19998);
});
