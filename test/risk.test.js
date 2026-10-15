import { test } from 'node:test';
import assert from 'node:assert/strict';
import { settings } from '../lib/gemini.js';
import { assess } from '../lib/risk.js';
import { detectPatterns } from '../lib/patterns.js';
import { mergeFindings, analyseJourney } from '../lib/journey.js';
import { STREAMS, EXPECT } from '../data/streams.js';

settings.forceOffline = true;

// Score every checked payment of a stream in order, the way the switch sees them.
function run(st) {
  const ledger = [], out = {};
  for (const e of st.events) {
    if (!e.check) { ledger.push(e); continue; }
    const txn = { id: e.id, at: e.at, amountINR: e.amountINR, channel: e.channel, merchant: e.merchant, payee: e.payee };
    const patterns = detectPatterns({ txn, customer: st.customer, session: e.session, recent: ledger });
    out[e.id] = assess({ txn, customer: st.customer, session: e.session, recent: ledger, memory: st.memory, patterns });
    ledger.push({ id: e.id, at: e.at, kind: 'debit', amountINR: e.amountINR, channel: e.channel, payeeName: e.payee.name, payeeAccount: e.payee.account, payeeNew: e.payee.isNew, payeeFirstSeenDays: e.payee.firstSeenDays });
  }
  return out;
}
const all = Object.assign({}, ...STREAMS.map(run));

test('every stream payment lands in its expected tier', () => {
  for (const [id, [lo, hi]] of Object.entries(EXPECT)) assert.ok(all[id].tier >= lo && all[id].tier <= hi, `${id}: T${all[id].tier}, expected T${lo}-T${hi}`);
});

test('splitting ₹10k × 5 is caught by the running total, not the single amount', () => {
  assert.ok(all['D-1'].tier <= 1);
  assert.ok(all['D-3'].tier >= 3);
  assert.ok(all['D-3'].reasons.some((r) => r.id === 'R6'), 'rolling total rule fired');
});

test('an honest month gets no questions and a trusted, already-checked payee costs nothing', () => {
  for (const id of ['N-1', 'N-2', 'N-3', 'N-4', 'N-5', 'N-6', 'N-7']) assert.ok(all[id].tier <= 1, `${id} T${all[id].tier}`);
  assert.equal(all['N-7'].tier, 0);
});

test('investment journey: single payments look ordinary, the pattern stops the 3rd', () => {
  assert.ok(all['E-2'].tier <= 1);
  assert.ok(all['E-3'].reasons.some((r) => r.id === 'P:investment'));
  assert.ok(all['E-4'].tier >= 3, 'strong pattern floors at a conversation');
});

test('account takeover goes to the fraud desk without an interview', () => {
  assert.equal(all['F-1'].tier, 5);
  assert.equal(all['F-1'].interviewable, false);
});

test('a phone call alone does not create friction', () => {
  const r = assess({ txn: { id: 'x', at: '2026-10-15T10:00:00+05:30', amountINR: 800, channel: 'upi_app', payee: { name: 'Fresh Mart', account: 'FM-001', isNew: false, firstSeenDays: 300 } }, session: { activeCall: true }, memory: { trustedPayees: ['FM-001'] } });
  assert.equal(r.tier, 0);
});

test('Gemini findings: one cited payment is not a pattern; unverified evidence never adds points', async () => {
  const one = mergeFindings([], { ok: true, verified: true, pattern: 'investment', confidence: 0.9, evidence: ['E-1'], story: 's', name: 'n' });
  assert.equal(one.length, 0);
  const unverified = mergeFindings([], { ok: true, verified: false, pattern: 'investment', confidence: 0.95, evidence: ['E-1', 'E-2'], story: 's', name: 'n' });
  assert.equal(unverified.length, 0);
  assert.equal(await analyseJourney({ txn: { id: 't', at: '2026-10-15T10:00:00+05:30', amountINR: 1, payee: {} } }), null, 'offline: no AI call');
});

test('amount alone never holds an honest customer: at most a conversation', () => {
  const r = assess({ txn: { id: 'b', at: '2026-10-15T10:00:00+05:30', amountINR: 1500000, channel: 'app', payee: { name: 'Kumar Builders Pvt Ltd', account: 'BUILD-X', isNew: true, firstSeenDays: 0, accountAgeDays: 2000 } }, customer: { age: 41, balanceINR: 2000000 }, recent: [{ id: 'h', at: '2026-09-20T10:00:00+05:30', kind: 'debit', amountINR: 240000, payeeFirstSeenDays: 300 }] });
  assert.ok(r.score >= 80, 'high score from amounts');
  assert.equal(r.tier, 3);
});
