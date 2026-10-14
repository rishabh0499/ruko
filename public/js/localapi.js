// Server-less builds (the Firebase website and the Claude artifact) run the same application
// core (lib/app.js) here, in the browser. Cases live in this viewer's localStorage. On Firebase
// a Gemini-API-only key (window.RUKO_ENV) gives live Gemini straight from the browser;
// the Claude artifact has no key and runs the offline rules engine.
import { createApp } from '../../lib/app.js';
import MANIFEST from './tts-manifest.js';

const DB_KEY = 'ruko_static_db';
const EV_KEY = (f) => `ruko_ev_${f}`;
const mem = new Map(); // evidence data URLs; mirrored to localStorage when it fits
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

const platform = {
  static: true,
  loadDb() { try { return JSON.parse(ls.get(DB_KEY)); } catch { return null; } },
  saveDb(db) { ls.set(DB_KEY, JSON.stringify(db)); },
  putEvidence(file, mime, b64) { const url = `data:${mime};base64,${b64}`; mem.set(file, url); ls.set(EV_KEY(file), url); },
  getEvidenceDataUrl(ev) { return mem.get(ev.file) || ls.get(EV_KEY(ev.file)) || ''; },
  getEvidenceBytes() { return null; },
  evidenceUrl(ev) { return platform.getEvidenceDataUrl(ev); },
  deleteEvidence(file) { mem.delete(file); ls.del(EV_KEY(file)); },
  // Voices: pre-voiced lines ship as WAV files; other lines use Gemini TTS from the browser.
  async synth(speaker, text) {
    const t = String(text || '').trim();
    const f = MANIFEST[`${speaker}|${t}`];
    if (f) { try { const r = await fetch(`tts/${f}`); if (r.ok) return await r.blob(); } catch {} }
    return browserTts(speaker, t);
  },
  prewarm: () => 0,
  voices: { ruko: 1, sunita: 1, amit: 1, rakesh: 1, imran: 1 },
};

// ---------- Gemini TTS from the browser (website build only) ----------
const KEY = globalThis.RUKO_ENV?.GEMINI_API_KEY || '';
const TTS_MODELS = (globalThis.RUKO_ENV?.GEMINI_MODEL_TTS || 'gemini-3.8-flash-tts,gemini-3.1-flash-tts-preview,gemini-2.5-flash-preview-tts,gemini-3.8-flash-lite-tts').split(',');
const VOICE = { ruko: 'Kore', sunita: 'Gacrux', amit: 'Orus', rakesh: 'Charon', imran: 'Iapetus' };
const ttsCache = new Map();
const cool = new Map();
function wav(pcm, rate) {
  const h = new DataView(new ArrayBuffer(44)); const w = (o, str) => [...str].forEach((c, i) => h.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); h.setUint32(4, 36 + pcm.length, true); w(8, 'WAVE'); w(12, 'fmt '); h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, 1, true);
  h.setUint32(24, rate, true); h.setUint32(28, rate * 2, true); h.setUint16(32, 2, true); h.setUint16(34, 16, true); w(36, 'data'); h.setUint32(40, pcm.length, true);
  return new Blob([h.buffer, pcm], { type: 'audio/wav' });
}
async function browserTts(speaker, text) {
  if (!KEY || !text) return null;
  const k = `${speaker}|${text}`;
  if (ttsCache.has(k)) return ttsCache.get(k);
  const job = (async () => {
    for (const model of TTS_MODELS) {
      if (cool.get(model) > Date.now()) continue;
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': KEY },
          body: JSON.stringify({ contents: [{ parts: [{ text }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE[speaker] || 'Kore' } } } } }),
        });
        const d = await r.json();
        if (!r.ok) { if (/quota|exhausted|high demand|overloaded|rate/i.test(d?.error?.message || '')) cool.set(model, Date.now() + 60000); continue; }
        const part = d?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
        if (!part) continue;
        const bytes = Uint8Array.from(atob(part.inlineData.data), (c) => c.charCodeAt(0));
        const mime = part.inlineData.mimeType || '';
        if (/wav/i.test(mime)) return new Blob([bytes], { type: 'audio/wav' });
        return wav(bytes, Number((/rate=(\d+)/.exec(mime) || [])[1] || 24000));
      } catch { /* try the next model */ }
    }
    return null;
  })();
  ttsCache.set(k, job);
  const out = await job;
  if (!out) ttsCache.delete(k);
  return out;
}

const app = createApp(platform);
const wire = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v))); // same shape as over HTTP

// The in-browser IDS/IPS sees this viewer as one client, not as loopback: loopback is the
// trusted local operator and is never throttled, but on the public site the flood and
// AI-cost rules (RK-IDS-005/006) must apply, because they protect the shared Gemini quota.
const CLIENT = 'browser-client';

export async function request(method, path, body) {
  const [p] = path.split('?');
  const r = await app.handle({ ip: CLIENT, method, path: p, rawUrl: path, headers: { 'user-agent': navigator.userAgent } }, wire(body) || {});
  return { status: r.status, json: wire(r.json), binary: r.binary || null };
}
