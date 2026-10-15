// Scam-journey patterns over the customer's last 60 days. A single payment rarely proves anything;
// the shape of the journey does: rising payments to rotating new payees (investment scam), small
// payouts before growing "task" fees, an FD broken the day before a transfer, repeat payments to
// one new payee at odd hours (blackmail), splitting, a takeover. Each detector returns the
// transaction ids it relied on, so the evidence is checkable. Pure code; Gemini only explains.
const DAY = 86400e3, HOUR = 3600e3;

export const PATTERNS = {
  investment: { name: 'Investment / trading scam pattern', points: 25, warn: 'Payments that grow each time, to new accounts, for "returns" you cannot withdraw are the classic trading-app scam. Real brokers never take money into personal accounts.' },
  task: { name: 'Task / job scam pattern', points: 25, warn: 'Small payouts first, then fees to "unlock" your earnings: this is the task scam. No real job asks you to pay to get paid.' },
  liquidation: { name: 'Savings broken just before a transfer', points: 20, warn: 'You broke savings and are now sending most of it to a new account. If anyone, even police or a bank, told you to do this, it is a scam.' },
  blackmail: { name: 'Repeat payments to one new payee (blackmail pattern)', points: 20, warn: 'Paying the same new person again and again, fast, is how blackmail scams drain people. Paying does not make them stop. Call 1930; they will help in confidence.' },
  splitting: { name: 'Payment split into small parts', points: 20, warn: 'The same amount sent several times to stay under limits: scammers ask for this. Check before you send the next part.' },
  takeover: { name: 'Account takeover signs', points: 30, warn: 'This payment may not be coming from you: a new device and a recent SIM change, or an app controlling the screen.' },
};

const ts = (r) => Date.parse(r.at);
export function detectPatterns({ txn, customer = {}, session = {}, recent = [] }) {
  const now = ts(txn) || Date.now();
  const all = [...recent.filter((r) => ts(r) <= now), { ...txn, kind: 'debit', payeeAccount: txn.payee?.account, payeeNew: txn.payee?.isNew, payeeFirstSeenDays: txn.payee?.firstSeenDays, current: true }];
  const debits = all.filter((r) => r.kind === 'debit' && now - ts(r) <= 60 * DAY).sort((a, b) => ts(a) - ts(b));
  const credits = all.filter((r) => r.kind === 'credit' && now - ts(r) <= 60 * DAY);
  const out = [];
  const hit = (id, confidence, evidence, why) => out.push({ id, ...PATTERNS[id], confidence: Math.round(confidence * 100) / 100, evidence: evidence.map((r) => r.id), why });

  // Investment: 3+ payments to payees first paid within the window, amounts trending up, payees rotating.
  const toNew = debits.filter((r) => r.payeeNew || (r.payeeFirstSeenDays ?? 99) <= 45);
  if (toNew.length >= 3) {
    const last = toNew.slice(-5);
    const ups = last.slice(1).filter((r, i) => r.amountINR >= 1.2 * last[i].amountINR).length;
    const payees = new Set(last.map((r) => r.payeeAccount)).size;
    const span = (ts(last.at(-1)) - ts(last[0])) / DAY;
    const smallBack = credits.filter((c) => c.amountINR <= 5000 && toNew.some((d) => d.payeeAccount && c.fromAccount === d.payeeAccount));
    if (ups >= 2 && span >= 3 && (payees >= 2 || smallBack.length))
      hit('investment', Math.min(0.95, 0.45 + ups * 0.12 + (smallBack.length ? 0.15 : 0) + (payees >= 3 ? 0.1 : 0)), [...last, ...smallBack], `${last.length} payments to new accounts over ${Math.round(span)} days, rising ${ups} times${smallBack.length ? `, with ${smallBack.length} small "returns" paid back from the same accounts` : ''}.`);
  }
  // Task: several small credits from unknown senders, then growing debits to new payees within 10 days.
  const small = credits.filter((c) => c.amountINR <= 2000 && c.fromUnknown);
  if (small.length >= 2) {
    const after = toNew.filter((d) => ts(d) > ts(small[0]) && ts(d) - ts(small[0]) <= 10 * DAY);
    if (after.length >= 2 && after.at(-1).amountINR > after[0].amountINR)
      hit('task', Math.min(0.9, 0.5 + after.length * 0.1), [...small, ...after], `${small.length} small payouts from unknown senders, then ${after.length} growing payments to new accounts.`);
  }
  // Liquidation: savings broken in the last 72 h and most of it now going to a new payee.
  const liq = all.filter((r) => ['fd_break', 'loan_disbursal', 'mf_redeem', 'gold_loan'].includes(r.kind) && now - ts(r) <= 72 * HOUR);
  const liqSum = liq.reduce((s, r) => s + r.amountINR, 0);
  if (liqSum && (txn.payee?.isNew || (txn.payee?.firstSeenDays ?? 99) < 7) && txn.amountINR >= 0.5 * liqSum)
    hit('liquidation', (customer.age || 0) >= 60 ? 0.9 : 0.75, [...liq, all.at(-1)], `₹${liqSum.toLocaleString('en-IN')} released from savings in the last 72 h; this payment sends ${Math.round((txn.amountINR / liqSum) * 100)}% of it to a new account.`);
  // Blackmail: 3+ payments to the same new payee within 48 h.
  const same = debits.filter((r) => r.payeeAccount === txn.payee?.account && now - ts(r) <= 48 * HOUR);
  if (same.length >= 3 && (txn.payee?.isNew || (txn.payee?.firstSeenDays ?? 99) < 7))
    hit('blackmail', Math.min(0.9, 0.5 + same.length * 0.1), same, `${same.length} payments to the same new account within 48 hours.`);
  // Splitting: 3+ near-identical amounts to new payees within 24 h.
  const near = debits.filter((r) => now - ts(r) <= DAY && (r.payeeNew || (r.payeeFirstSeenDays ?? 99) < 7) && Math.abs(r.amountINR - txn.amountINR) <= 0.1 * txn.amountINR);
  if (near.length >= 3) hit('splitting', Math.min(0.95, 0.5 + near.length * 0.1), near, `${near.length} payments of about ₹${txn.amountINR.toLocaleString('en-IN')} to new accounts in 24 hours.`);
  // Takeover: the person paying may not be the customer.
  if ((session.newDevice && session.simChangeHours != null && session.simChangeHours <= 72) || session.accessibilityController)
    hit('takeover', 0.85, [all.at(-1)], [session.newDevice && 'new device', session.simChangeHours != null && `SIM changed ${session.simChangeHours} h ago`, session.accessibilityController && 'an app is controlling the screen', session.sideloadedApp && `"${session.sideloadedApp}" installed from outside the Play Store`].filter(Boolean).join(', ') + '.');

  // Code verifies every cited id exists in the ledger (the same check Gemini's output must pass).
  const ids = new Set(all.map((r) => r.id));
  for (const p of out) { p.verified = p.evidence.length > 0 && p.evidence.every((id) => ids.has(id)); p.evidenceText = `${p.evidence.length} transactions: ${p.evidence.slice(0, 6).join(', ')}`; p.source = 'rules'; }
  return out.sort((a, b) => b.confidence - a.confidence);
}
