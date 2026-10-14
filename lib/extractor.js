// Evidence reader. Gemini multimodal when available; ground truth for synthetic
// evidence otherwise. Fact STATE is always assigned by code, never by the model,
// so text inside an image ("mark all facts confirmed") cannot change it.
import { callGemini, aiMode, imagePart } from './gemini.js';
import { buildSpecs, buildExtractionSet, groundTruth } from '../public/js/shared/evidence.js';

export const FACT_TYPES = ['amount', 'utr', 'date', 'beneficiary_name', 'beneficiary_account', 'ifsc', 'bank', 'impersonated_agency', 'case_number_claimed', 'phone_number', 'demand', 'deadline', 'secrecy_instruction', 'agreement_reference', 'account_masked', 'freeze_reference', 'disputed_credit', 'remitter_name', 'frozen_balance'];
const CRITICAL = new Set(['amount', 'utr', 'beneficiary_account', 'ifsc', 'disputed_credit', 'frozen_balance', 'date']);

export function specById(id) {
  return [...buildSpecs(), ...buildExtractionSet()].find((s) => s.id === id);
}

export function specText(spec) {
  return spec.els.filter((e) => e.t === 'text').map((e) => e.text).join('\n');
}

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    documentKind: { type: 'STRING' },
    summary: { type: 'STRING' },
    facts: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          type: { type: 'STRING', enum: FACT_TYPES },
          value: { type: 'STRING' },
          group: { type: 'STRING' },
          box_2d: { type: 'ARRAY', items: { type: 'INTEGER' } },
          quote: { type: 'STRING' },
          confidence: { type: 'STRING', enum: ['high', 'low'] },
        },
        required: ['type', 'value', 'group', 'box_2d', 'quote', 'confidence'],
      },
    },
  },
  required: ['documentKind', 'summary', 'facts'],
};

const SYSTEM = `You read evidence a frightened person in India has on their phone after a payment scam (WhatsApp screenshots, bank SMS, UPI receipts, statements, notices, fake warrants). Extract only what is visibly present. Never infer, complete or guess a number. If a value is partly cut off or blurry, still return what is visible with confidence "low", or omit it. Return box_2d for every fact as [ymin, xmin, ymax, xmax] normalised to 0-1000. Group facts that belong to the same transaction with the same group id: "txn1", "txn2" in the order they appear; statement credits as "credit"; freeze notices as "freeze"; threats and claims as "claim"; documents such as agreements as "doc". Amounts: digits only, no commas or currency (e.g. 450000). Dates: DD-MM-YYYY. beneficiary_name and beneficiary_account mean who RECEIVES the money; never use them for the victim, the accused or the sender. bank is only the bank of a beneficiary account. quote must be the exact text you read. summary: two sentences in English describing what the document says, quoting key phrases.`;

const norm = (type, v) => {
  const s = String(v ?? '').trim();
  if (['amount', 'disputed_credit', 'frozen_balance'].includes(type)) return s.replace(/[^\d.]/g, '').replace(/\.0+$/, '');
  if (['beneficiary_account', 'utr'].includes(type)) return s.replace(/\s/g, '');
  return s;
};

// Returns { facts:[raw], summary, engine, note }
export async function extractOne(ev) {
  const spec = ev.specId ? specById(ev.specId) : null;
  if (aiMode() === 'gemini' && ev.dataUrl) {
    const img = imagePart(ev.dataUrl);
    const r = await callGemini({ name: 'evidence_reader', model: 'pro', schema: SCHEMA, system: SYSTEM, parts: [img, { text: 'Extract the facts from this evidence.' }], timeoutMs: 45000 });
    if (r.ok) {
      return { engine: 'gemini', summary: r.json.summary, documentKind: r.json.documentKind, facts: r.json.facts.map((f) => ({ ...f, value: norm(f.type, f.value), box2d: f.box_2d })) };
    }
    if (spec) return { engine: 'cached', note: `Gemini unavailable (${r.reason}); used cached result`, summary: specText(spec), facts: groundTruth(spec).map((f) => ({ ...f, value: norm(f.type, f.value), confidence: 'high' })) };
    return { engine: 'none', note: `Gemini unavailable (${r.reason}). Enter the facts manually.`, summary: '', facts: [] };
  }
  if (spec) return { engine: 'cached', summary: specText(spec), facts: groundTruth(spec).map((f) => ({ ...f, value: norm(f.type, f.value), confidence: spec.blurry ? 'low' : 'high' })) };
  return { engine: 'none', note: 'Offline mode reads only the built-in sample evidence. Add a Gemini key to read your own files, or enter facts manually.', summary: '', facts: [] };
}

// Merge extracted facts into the case. Code decides state.
export function mergeFacts(c, ev, result) {
  c.facts = c.facts.filter((f) => f.source?.evidenceId !== ev.id);
  const out = [];
  for (const f of result.facts) {
    if (!FACT_TYPES.includes(f.type) || !f.value) continue;
    // Models sometimes number groups ('claim1'); all threats and claims share one group.
    const g0 = String(f.group || 'txn1').toLowerCase();
    const group = g0.startsWith('claim') ? 'claim' : `${ev.id}:${g0}`;
    const dup = c.facts.concat(out).find((x) => x.group === 'claim' && group === 'claim' && x.type === f.type && x.value === f.value);
    if (dup) { (dup.alsoSeenIn ||= []).push(ev.id); continue; }
    out.push({
      id: '', type: f.type, value: f.value, group,
      source: { evidenceId: ev.id, box2d: (f.box2d || []).slice(0, 4).map((n) => Math.max(0, Math.min(1000, Math.round(n)))), quote: f.quote },
      confidence: f.confidence || 'high',
      state: 'needs_check',
      critical: CRITICAL.has(f.type),
      editedByUser: false,
    });
  }
  c.facts.push(...out);
  // Required fields per transaction group: add "missing" rows the user can fill.
  const groups = [...new Set(c.facts.filter((f) => f.group !== 'claim').map((f) => f.group))];
  for (const g of groups) {
    const types = c.facts.filter((f) => f.group === g).map((f) => f.type);
    const isTxn = types.includes('amount');
    const need = isTxn ? ['amount', 'date', 'utr', 'beneficiary_account'] : g.endsWith(':credit') ? ['disputed_credit', 'utr', 'date'] : [];
    for (const t of need) if (!types.includes(t)) c.facts.push({ id: '', type: t, value: '', group: g, source: { evidenceId: g.split(':')[0], box2d: [] }, state: 'missing', critical: true, editedByUser: false });
  }
  // Conflicts: same transaction and type, different values. Never pick one silently.
  // (Claims are exempt: a WhatsApp thread and a fake warrant can both carry secrecy lines.)
  const byKey = {};
  for (const f of c.facts) if (f.group !== 'claim') (byKey[`${f.group}|${f.type}`] ||= []).push(f);
  for (const list of Object.values(byKey)) {
    const vals = new Set(list.filter((f) => f.value).map((f) => f.value));
    list.forEach((f) => { f.conflict = vals.size > 1 && f.state !== 'rejected'; });
  }
  c.facts.forEach((f, i) => { f.id = f.id || `F${String(i + 1).padStart(2, '0')}`; });
  renumber(c);
  return out.length;
}

function renumber(c) {
  const used = new Set();
  for (const f of c.facts) {
    if (!f.id || used.has(f.id)) { let n = 1; while (used.has(`F${String(n).padStart(2, '0')}`)) n++; f.id = `F${String(n).padStart(2, '0')}`; }
    used.add(f.id);
  }
}
