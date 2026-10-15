// Gemini journey analyst. Reads the customer's recent ledger, the payment being made, the device
// signals and what the rule detectors found, and names the most likely scam with the transaction
// ids it relies on. It writes the plain-language warning for this specific scam and the one
// question worth asking. Code then checks every cited id exists and the pattern is allowed;
// anything unverified is dropped. Gemini never sets the tier.
import { callGemini, aiMode } from './gemini.js';
import { PATTERNS } from './patterns.js';

const ALLOWED = ['investment', 'task', 'liquidation', 'blackmail', 'splitting', 'takeover', 'remote_access', 'impersonation', 'romance', 'none'];
const SCHEMA = {
  type: 'OBJECT',
  properties: {
    pattern: { type: 'STRING', enum: ALLOWED },
    confidence: { type: 'NUMBER' },
    evidence: { type: 'ARRAY', items: { type: 'STRING' } },
    story: { type: 'STRING' },
    customerWarning: { type: 'STRING' },
    question: { type: 'STRING' },
  },
  required: ['pattern', 'confidence', 'evidence', 'story', 'customerWarning', 'question'],
};
const inr = (n) => `₹${Number(n).toLocaleString('en-IN')}`;

export function ledgerText({ txn, recent }) {
  const rows = recent.map((r) => `${r.id} | ${r.at.slice(0, 16).replace('T', ' ')} | ${r.kind} | ${inr(r.amountINR)} | ${r.channel || ''} | ${r.payeeName ? `to ${r.payeeName}${r.payeeNew || (r.payeeFirstSeenDays ?? 99) < 7 ? ' (new payee)' : ''}` : r.fromName ? `from ${r.fromName}${r.fromUnknown ? ' (unknown sender)' : ''}` : ''}${r.note ? ` | ${r.note}` : ''}`);
  const p = txn.payee || {};
  rows.push(`${txn.id} | ${txn.at.slice(0, 16).replace('T', ' ')} | PAYMENT NOW | ${inr(txn.amountINR)} | ${txn.channel} | to ${p.name}${p.isNew ? ' (new payee)' : ''}${p.accountAgeDays != null ? `, account ${p.accountAgeDays} days old` : ''}${txn.merchant ? ` | merchant: ${txn.merchant}` : ''}`);
  return rows.join('\n');
}

export async function analyseJourney({ txn, customer = {}, session = {}, recent = [], detected = [], lang = 'en' }) {
  if (aiMode() !== 'gemini') return null;
  const ids = new Set([...recent.map((r) => r.id), txn.id]);
  const sessionText = Object.entries(session).filter(([, v]) => v !== false && v != null).map(([k, v]) => `${k}=${v}`).join(', ') || 'none';
  const r = await callGemini({
    name: 'journey_analyst',
    system: `You are a fraud analyst at an Indian bank. You see one customer's recent transactions (a ledger with ids), the payment they are making now, device signals during this session, and what deterministic detectors already found. Decide which scam pattern, if any, best explains the journey. Allowed patterns: ${ALLOWED.join(', ')}. Use "none" when the journey looks like ordinary life; most journeys are ordinary. Use remote_access when a remote-access or screen-sharing app is running (typically a fake customer-care call), takeover when the payer is probably not the customer (new device, SIM change, malware), impersonation for fake police/CBI/RBI demands. Cite only ids that appear in the ledger, the ones that actually support your conclusion. confidence is 0 to 1. story: two plain sentences for bank staff, quoting amounts and dates from the ledger. customerWarning: one or two short sentences for the customer about this specific scam, kind and not accusing, in ${lang === 'hi' ? 'Hindi (Devanagari)' : 'English'}. question: the single most useful question to ask the customer, in the same language. Never invent amounts, names or dates.`,
    parts: [{ text: `Customer: age ${customer.age ?? 'unknown'}, balance ${customer.balanceINR ? inr(customer.balanceINR) : 'unknown'}.\nDevice/session now: ${sessionText}.\nDetectors found: ${detected.map((d) => `${d.id} (${d.confidence}) ${d.why}`).join(' | ') || 'nothing'}.\n\nLedger (id | time | kind | amount | channel | counterparty | note):\n${ledgerText({ txn, recent })}` }],
    schema: SCHEMA, timeoutMs: 15000, temperature: 0.1,
  });
  if (!r.ok) return { ok: false, reason: r.reason };
  const j = r.json || {};
  const evidence = (j.evidence || []).filter((id) => ids.has(id));
  const dropped = (j.evidence || []).length - evidence.length;
  let pattern = ALLOWED.includes(j.pattern) ? j.pattern : 'none';
  // Claims that depend on device signals must match them: no remote-access or takeover pattern
  // unless the session actually shows remote control, screen sharing, a new device or a SIM change.
  const s = session || {};
  const contradicted = (pattern === 'remote_access' && !(s.remoteAccessApp || s.activeScreenShare || s.accessibilityController))
    || (pattern === 'takeover' && !(s.newDevice || s.simChangeHours != null || s.accessibilityController || s.sideloadedApp));
  if (contradicted) pattern = 'none';
  const confidence = Math.max(0, Math.min(1, Number(j.confidence) || 0));
  return {
    ok: true, model: r.model, pattern, confidence, evidence, droppedEvidence: dropped,
    verified: pattern !== 'none' && evidence.length > 0 && dropped === 0, contradicted,
    story: String(j.story || '').slice(0, 600), customerWarning: String(j.customerWarning || '').slice(0, 400), question: String(j.question || '').slice(0, 300),
    name: PATTERNS[pattern]?.name || ({ impersonation: 'Official impersonation pattern', romance: 'Romance scam pattern', remote_access: 'Remote access / fake helpline pattern' }[pattern] || 'No scam pattern'),
  };
}

// Merge Gemini's finding with the rule detectors: agreement raises confidence; a pattern only Gemini
// sees can add points only when its evidence verified and confidence is high. Never double-counts.
export function mergeFindings(detected, ai) {
  const out = detected.map((d) => ({ ...d }));
  if (!ai?.ok || !ai.verified || ai.pattern === 'none') return out;
  const same = out.find((d) => d.id === ai.pattern);
  if (same) { same.confidence = Math.max(same.confidence, Math.min(0.97, (same.confidence + ai.confidence) / 2 + 0.1)); same.source = 'rules + gemini'; same.aiStory = ai.story; }
  // A pattern is a journey: Gemini alone needs at least two cited transactions to add points.
  else if (ai.confidence >= 0.75 && ai.evidence.length >= 2) out.push({ id: ai.pattern, name: ai.name, points: 15, confidence: ai.confidence, evidence: ai.evidence, verified: true, evidenceText: `${ai.evidence.length} transactions: ${ai.evidence.slice(0, 6).join(', ')}`, why: ai.story, source: 'gemini' });
  return out;
}
