// Ruko risk engine: one deterministic score per payment, on every rail (bank app, UPI from any
// app via the bank's UPI switch, card authorisation, net banking, branch). It looks at the whole
// recent journey, not one payment: rolling totals to new payees defeat "₹10,000 × 5" splitting.
// Most payments end at T0 with nothing asked. Questions are the last resort, not the first.
// Pure functions, browser and Node. The decision is always this code; AI only adds verified evidence.
import REPORTED from '../data/reported.js';

export const TIERS = [
  { tier: 0, key: 'silent', name: 'Silent', action: 'Allow. Nothing shown to the customer.' },
  { tier: 1, key: 'nudge', name: 'Nudge', action: 'One warning screen about this scam type, then the customer can continue.' },
  { tier: 2, key: 'cooloff', name: 'Cooling-off', action: 'Payment queued for 30 minutes; the customer can cancel any time and gets a "still want to send?" message.' },
  { tier: 3, key: 'interview', name: 'Conversation', action: 'Ruko asks two to four questions before the money moves.' },
  { tier: 4, key: 'hold', name: 'Hold + trusted contact', action: 'Held for 24 hours; the trusted contact is told and can call.' },
  { tier: 5, key: 'desk', name: 'Fraud desk', action: 'A person at the bank calls the customer on their registered number before anything moves.' },
];
export const CHANNELS = {
  app: { label: 'Bank app', reach: 'in_app' },
  upi_app: { label: 'UPI app (PhonePe / GPay / Paytm)', reach: 'push' },
  card: { label: 'Card (online)', reach: 'push' },
  netbanking: { label: 'Net banking', reach: 'push' },
  branch: { label: 'Branch counter', reach: 'teller' },
};
const DAY = 86400e3, HOUR = 3600e3;
const OFFICIAL = /\b(rbi|safe|verification|supervision|escrow|custody|cbi|court|investigation|clearance|police|customs|narcotics)\b|सुरक्षा|सुरक्षित|वेरिफिकेशन/i;
const RISKY_MCC = /crypto|gift ?card|wallet top-?up|forex|gaming|betting/i;
const tierFor = (score) => (score >= 80 ? 4 : score >= 60 ? 3 : score >= 40 ? 2 : score >= 20 ? 1 : 0);

// Rolling aggregates over the customer's recent ledger. "New payee" = first paid less than 7 days ago.
export function aggregates({ txn, recent = [], now = Date.parse(txn.at) || Date.now() }) {
  const debits = recent.filter((r) => r.kind === 'debit' && Date.parse(r.at) <= now);
  const isNew = (r) => r.payeeNew || (r.payeeFirstSeenDays ?? 99) < 7;
  const within = (ms) => debits.filter((r) => now - Date.parse(r.at) <= ms);
  const sum = (a) => a.reduce((s, r) => s + r.amountINR, 0);
  const curNew = !!(txn.payee?.isNew || (txn.payee?.firstSeenDays ?? 99) < 7);
  const add = curNew ? txn.amountINR : 0;
  const near = (a, b) => Math.abs(a - b) <= 0.1 * Math.max(a, b);
  const d24 = within(DAY);
  const liquid = recent.filter((r) => ['fd_break', 'loan_disbursal', 'mf_redeem', 'gold_loan'].includes(r.kind) && now - Date.parse(r.at) <= 72 * HOUR && Date.parse(r.at) <= now);
  return {
    newPayee24h: sum(d24.filter(isNew)) + add,
    newPayee7d: sum(within(7 * DAY).filter(isNew)) + add,
    samePayee7d: sum(within(7 * DAY).filter((r) => r.payeeAccount && r.payeeAccount === txn.payee?.account)) + txn.amountINR,
    newPayeeCount24h: d24.filter(isNew).length + (curNew ? 1 : 0),
    similarCount24h: d24.filter((r) => near(r.amountINR, txn.amountINR)).length + 1,
    liquidation72h: liquid.reduce((s, r) => s + r.amountINR, 0),
    liquidationKinds: [...new Set(liquid.map((r) => r.kind))],
    max90d: Math.max(0, ...debits.filter((r) => now - Date.parse(r.at) <= 90 * DAY).map((r) => r.amountINR)),
  };
}

// txn: { id, at, amountINR, channel, merchant?, payee: { name, account, upi, phone, isNew, accountAgeDays, firstSeenDays, fri } }
// customer: { age, balanceINR }  session: device signals  memory: { trustedPayees, cleared }
export function assess({ txn, customer = {}, session = {}, recent = [], memory = {}, patterns = [] }) {
  const reasons = [], floors = [];
  const add = (id, points, label, evidence = '') => reasons.push({ id, points, label, evidence });
  const floor = (tier, id, label) => floors.push({ tier, id, label });
  const ag = aggregates({ txn, recent });
  const p = txn.payee || {};
  const amt = txn.amountINR;
  const curNew = !!(p.isNew || (p.firstSeenDays ?? 99) < 7);
  const trusted = (memory.trustedPayees || []).includes(p.account) && !curNew;
  const reported = REPORTED.accounts.includes(p.account) || (p.upi && REPORTED.upiIds.includes(p.upi)) || (p.phone && REPORTED.phones.includes(p.phone));

  // Device and session: who is actually at the controls right now?
  const coached = session.activeCall || session.activeVideoCall;
  // A call alone proves nothing (people pay the plumber while talking to him). It only matters
  // combined with a new payee and a real amount, and most when the call itself is suspicious.
  const badCall = session.activeVideoCall || session.callFromReported;
  if (coached) add('R1', badCall ? 30 : 15, session.callFromReported ? 'On a call with a reported number' : session.activeVideoCall ? 'A video call is running during the payment' : 'A phone call is running during the payment', session.callFromReported ? 'Telecom risk flag on the caller (FRI)' : '');
  if (coached && curNew && amt >= 10000) floor(badCall ? 4 : 3, 'R1', badCall ? 'Video call or reported caller + new payee + ₹10,000 or more' : 'Call in progress + new payee + ₹10,000 or more');
  if (session.activeScreenShare || session.remoteAccessApp || session.accessibilityController) { add('R2', 45, session.remoteAccessApp ? `Remote-access app running (${session.remoteAccessApp === true ? 'AnyDesk-type' : session.remoteAccessApp})` : session.accessibilityController ? 'An app is controlling the screen (accessibility service)' : 'Screen is being shared'); floor(4, 'R2', 'Someone else can see or control the screen'); }
  const takeover = (session.newDevice && session.simChangeHours != null && session.simChangeHours <= 72) || session.accessibilityController || (session.sideloadedApp && session.newDevice);
  if (session.newDevice) add('R10', 20, 'First payment from a new device');
  if (session.simChangeHours != null && session.simChangeHours <= 72) add('R10b', 25, `SIM changed ${session.simChangeHours} h ago`);
  if (session.sideloadedApp) add('R10c', 20, `App installed from outside the Play Store: "${session.sideloadedApp}"`);
  if (session.pastedAccount) add('R11', 5, 'Account number was pasted, not typed');
  if (session.hour != null && (session.hour >= 23 || session.hour < 6)) add('R11b', 5, 'Late-night payment');

  // Payee intelligence (bank-side feeds: I4C Suspect Registry, MuleHunter.AI, DoT FRI). MOCKED list here.
  if (reported) { add('R3', 50, 'Payee is on the suspect list', 'Suspect Registry / reported accounts (mocked)'); floor(5, 'R3', 'Payee reported as a mule account'); }
  if (p.fri === 'very_high' || p.fri === 'high') { add('R3b', 30, `Payee's mobile has a ${p.fri.replace('_', ' ')} fraud-risk rating`, 'DoT Financial Fraud Risk Indicator (mocked)'); if (p.fri === 'very_high') floor(5, 'R3b', 'Very high FRI on the payee'); }
  if (curNew && !trusted) add('R4', 15, 'New payee');
  if (p.accountAgeDays != null && p.accountAgeDays <= 30) add('R5', 15, `Payee account opened ${p.accountAgeDays} days ago`);
  if (OFFICIAL.test(p.name || '')) add('R13', 25, `Payee name "${p.name}" sounds official`);
  if (txn.merchant && RISKY_MCC.test(txn.merchant)) add('R13b', 20, `Merchant type: ${txn.merchant}`);

  // The journey: rolling totals defeat splitting; liquidation before a transfer is a strong early sign.
  const senior = (customer.age || 0) >= 60;
  const mult = senior ? 1.5 : 1;
  if (ag.newPayee7d >= 100000) add('R6', Math.round(45 * mult), `₹${ag.newPayee7d.toLocaleString('en-IN')} to new payees in 7 days`);
  else if (ag.newPayee7d >= 50000) add('R6', Math.round(30 * mult), `₹${ag.newPayee7d.toLocaleString('en-IN')} to new payees in 7 days`);
  else if (ag.newPayee24h >= 25000) add('R6', Math.round(20 * mult), `₹${ag.newPayee24h.toLocaleString('en-IN')} to new payees in 24 hours`);
  if (ag.newPayeeCount24h >= 3) add('R7', 20, `${ag.newPayeeCount24h} payments to new payees in 24 hours`);
  else if (ag.similarCount24h >= 3) add('R7', 20, `${ag.similarCount24h} near-identical amounts in 24 hours (splitting)`);
  if (amt >= 9999 && (amt + 1) % 5000 === 0) add('R7b', 5, `Amount just under a round limit (₹${amt.toLocaleString('en-IN')})`);
  if (ag.max90d && amt >= 3 * ag.max90d) add('R8', 20, `${(amt / ag.max90d).toFixed(1)}× the largest payment in 90 days`);
  if (customer.balanceINR && amt > 0.5 * customer.balanceINR) add('R8b', 15, `Sends ${Math.round((amt / customer.balanceINR) * 100)}% of the balance`);
  if (ag.liquidation72h) add('R9', 25, `${ag.liquidationKinds.map((k) => ({ fd_break: 'FD broken', loan_disbursal: 'loan taken', mf_redeem: 'mutual funds sold', gold_loan: 'gold loan taken' }[k])).join(', ')} in the last 72 h (₹${ag.liquidation72h.toLocaleString('en-IN')})`);
  if (senior && amt >= 10000 && (curNew || ag.liquidation72h)) add('R12', 10, `Customer is ${customer.age}`);

  // AI pattern engine: only patterns whose evidence was verified by code may add points.
  for (const pt of patterns.filter((x) => x.verified && x.confidence >= 0.6)) {
    add(`P:${pt.id}`, pt.points || 20, pt.name, pt.evidenceText || '');
    // A strong journey pattern always earns at least a conversation, even if this one payment looks small.
    // Only code-detected patterns may set a floor; a Gemini-only finding can add points, never force a tier.
    if (pt.confidence >= 0.85 && pt.id !== 'takeover' && pt.source !== 'gemini') floor(3, `P:${pt.id}`, `${pt.name} (confidence ${pt.confidence})`);
  }

  // Memory: a payee already paid safely, or a purpose already cleared, lowers friction. Never overrides R1–R3.
  if (trusted) add('R14', -30, 'Payee paid safely before (trusted)');
  const cleared = (memory.cleared || []).find((m) => m.payee === p.account && amt <= 2 * m.amountINR);
  if (cleared) add('R14b', -20, `Purpose already checked: "${cleared.purpose}"`);

  const score = Math.max(0, reasons.reduce((s, r) => s + r.points, 0));
  let tier = tierFor(score);
  // Amounts alone never hold an honest customer: a hold needs hard evidence (a floor from device or
  // registry signals) or a journey pattern that code verified. Otherwise the most is a conversation,
  // and the conversation decides whether to hold.
  const hardEvidence = floors.some((f) => f.tier >= 4) || patterns.some((x) => x.verified && x.source !== 'gemini' && x.confidence >= 0.6);
  if (tier >= 4 && !hardEvidence) tier = 3;
  for (const f of floors) tier = Math.max(tier, f.tier);
  const ch = CHANNELS[txn.channel] || CHANNELS.app;
  // If the customer is not the one at the controls (takeover), asking them questions in-session is
  // pointless: hold and reach them on the registered number instead.
  const interviewable = !takeover;
  if (takeover && tier >= 2) { tier = 5; floors.push({ tier: 5, id: 'ATO', label: 'Account takeover suspected: the person paying may not be the customer' }); }
  if (tier === 3 && !interviewable) tier = 5;
  return {
    score, tier, ...TIERS[tier], channel: txn.channel || 'app', channelLabel: ch.label, reach: ch.reach,
    interviewable, takeover: !!takeover,
    reasons: reasons.sort((a, b) => b.points - a.points), floors, aggregates: ag,
  };
}
