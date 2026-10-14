// Ruko local server: Node's http module around lib/app.js. Zero dependencies.
// Run: node server.js  → http://localhost:8790   (Cloud Run sets HOST=0.0.0.0 and PORT)
import './lib/env.js'; // first: loads .env before anything reads it
import http from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { settings, aiMode } from './lib/gemini.js';
import { synth, prewarm, VOICES } from './lib/tts.js';
import { inspect, noteMalformed, clientIp, setPersistence } from './lib/ids.js';
import { createApp } from './lib/app.js';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PUB = join(ROOT, 'public');
const STORE = join(ROOT, 'store');
const EVID = join(STORE, 'evidence');
mkdirSync(EVID, { recursive: true });
const DB = join(STORE, 'cases.json');
const IDS_FILE = join(STORE, 'ids-events.json');
const PORT = Number(process.env.PORT || 8790);
// Localhost only by default; containers (Cloud Run) set HOST=0.0.0.0.
const HOST = process.env.HOST || '127.0.0.1';

setPersistence({
  load: () => (existsSync(IDS_FILE) ? JSON.parse(readFileSync(IDS_FILE, 'utf8')) : []),
  save: (events) => writeFileSync(IDS_FILE, JSON.stringify(events)),
});

const app = createApp({
  loadDb: () => (existsSync(DB) ? JSON.parse(readFileSync(DB, 'utf8')) : null),
  saveDb: (db) => writeFileSync(DB, JSON.stringify(db, null, 1)),
  putEvidence: (file, mime, b64) => writeFileSync(join(EVID, file), Buffer.from(b64, 'base64')),
  getEvidenceDataUrl: (ev) => `data:${ev.mimeType};base64,${readFileSync(join(EVID, ev.file)).toString('base64')}`,
  getEvidenceBytes: (ev) => readFileSync(join(EVID, ev.file)),
  evidenceUrl: (ev) => `/api/evidence/${ev.id}`,
  deleteEvidence: (file) => unlinkSync(join(EVID, file)),
  synth, prewarm, voices: VOICES,
});

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.ico': 'image/x-icon', '.webp': 'image/webp', '.pdf': 'application/pdf', '.wav': 'audio/wav' };
const send = (res, code, data) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(data)); };
const readBody = (req) => new Promise((ok, bad) => { let b = ''; req.on('data', (d) => { b += d; if (b.length > 25e6) { bad(new Error('Body too large')); req.destroy(); } }); req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch (e) { bad(e); } }); });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const meta = { ip: clientIp(req), method: req.method, path: url.pathname, rawUrl: req.url, headers: req.headers };
  try {
    if (url.pathname.startsWith('/api/')) {
      let body = {};
      if (!['GET', 'DELETE', 'HEAD'].includes(req.method)) {
        try { body = await readBody(req); } catch (e) { noteMalformed(meta, e.message); return send(res, 400, { error: 'Malformed request body' }); }
      }
      const r = await app.handle(meta, body);
      if (r.binary) { res.writeHead(r.status, { 'content-type': r.type, 'content-length': r.binary.length, 'cache-control': 'no-store' }); return res.end(r.binary); }
      if (!r.json) { res.writeHead(r.status, { 'cache-control': 'no-store' }); return res.end(); }
      return send(res, r.status, r.json);
    }
    // Static files: still inspected (traversal, scanner probes) before serving.
    const verdict = inspect({ ...meta, body: {} });
    if (!verdict.allow) return send(res, verdict.status, { error: verdict.error });
    let file = normalize(join(PUB, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname)));
    if (!file.startsWith(PUB) || !existsSync(file) || statSync(file).isDirectory()) file = join(PUB, 'index.html');
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' });
    res.end(readFileSync(file));
  } catch (e) {
    send(res, e.code === 404 ? 404 : 400, { error: e.message });
  }
});

// Fill the voice cache for the demo scenario in the background whenever quota allows.
if (aiMode() === 'gemini') setTimeout(() => { try { app.prewarmScenario('A'); } catch {} }, 1500);
server.listen(PORT, HOST, () => console.log(`Ruko running on http://${HOST === '127.0.0.1' ? 'localhost' : HOST}:${PORT}  ·  AI mode: ${aiMode()}${aiMode() === 'offline' ? ' (add GEMINI_API_KEY to .env for live Gemini)' : ` (${settings.fast} / ${settings.pro})`}`));
