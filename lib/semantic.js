// Semantic scam-script matching with Gemini embeddings. The keyword matcher in policy.js only
// fires on known words; this catches the same script told in the customer's own words, in Hindi
// or English. The quote is always the customer's own sentence, so the quote rule still holds,
// and the threshold is calibrated so that no sentence in the legitimate eval cases matches.
import SCRIPTS from '../data/scripts.js';
import EMB from '../data/script-embeddings.js';
import { embedTexts, EMBED } from './gemini.js';
import { sentences } from './policy.js';

export const SEMANTIC = { threshold: EMB.threshold, model: EMB.model };
const NEGATED = /^(no|nobody|no one|not|never|nothing|नहीं)\b/i;
const cache = new Map(); // sentence -> vector (embedding quota is per text)

const cos = (a, b) => { let s = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { s += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return s / Math.sqrt(x * y); };

export async function semanticScriptMatches({ turns, evidenceNotes = [] }) {
  if (EMB.model !== EMBED.model || !EMB.scripts.length) return null; // library embedded with another model
  const pool = [...new Set([...turns.filter((t) => t.role === 'customer').flatMap((t) => sentences(t.text)), ...evidenceNotes.flatMap((n) => sentences(n.text))])]
    .filter((s) => s.length > 12 && !NEGATED.test(s));
  const missing = pool.filter((s) => !cache.has(s));
  if (missing.length) {
    const v = await embedTexts(missing);
    if (!v) return null;
    missing.forEach((s, i) => cache.set(s, v[i]));
  }
  const best = new Map();
  for (const s of pool) {
    const v = cache.get(s);
    for (const sc of EMB.scripts) for (const lv of sc.vectors) {
      const sim = cos(v, lv);
      if (sim >= SEMANTIC.threshold && sim > (best.get(sc.id)?.similarity || 0)) best.set(sc.id, { quote: s, similarity: sim });
    }
  }
  return [...best].map(([id, m]) => {
    const sc = SCRIPTS.find((x) => x.id === id);
    return { scriptId: id, name: sc.name, stage: sc.stage, source: sc.source, hits: 1, quote: m.quote, similarity: Math.round(m.similarity * 1000) / 1000, method: 'semantic', similarityReason: `Same meaning as "${sc.lines[0]}" (Gemini embeddings, cosine ${m.similarity.toFixed(2)})` };
  });
}

// Keyword matches first (exact words), then semantic ones for scripts the keywords missed.
export function mergeScriptMatches(keyword, semantic) {
  const out = keyword.map((k) => ({ ...k, method: 'keyword' }));
  for (const s of semantic || []) if (!out.some((k) => k.scriptId === s.scriptId)) out.push(s);
  return out.slice(0, 3);
}
