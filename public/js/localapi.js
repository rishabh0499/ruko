// The shareable artifact has no server, so the same application core (lib/app.js) runs here,
// in the browser. Cases live in this viewer's localStorage. The sandbox cannot reach Gemini
// (and an API key must never ship in a public page), so AI runs in offline rules mode here;
// the live Gemini version is the hosted app (Cloud Run).
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
  // Voices: lines that were voiced with Gemini TTS ship with the artifact as WAV files.
  async synth(speaker, text) {
    const f = MANIFEST[`${speaker}|${String(text || '').trim()}`];
    if (!f) return null;
    try { const r = await fetch(`tts/${f}`); return r.ok ? await r.blob() : null; } catch { return null; }
  },
  prewarm: () => 0,
  voices: { ruko: 1, sunita: 1, amit: 1, rakesh: 1, imran: 1 },
};

const app = createApp(platform);
const wire = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v))); // same shape as over HTTP

export async function request(method, path, body) {
  const [p] = path.split('?');
  const r = await app.handle({ ip: '127.0.0.1', method, path: p, rawUrl: path, headers: {} }, wire(body) || {});
  return { status: r.status, json: wire(r.json), binary: r.binary || null };
}
