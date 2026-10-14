// Ruko application-layer IDS/IPS. Every API request is inspected before it reaches a route.
// Detect mode (IDS) records events; prevent mode (IPS) also blocks, rate-limits and bans.
// Production equivalent: Cloud Armor (WAF + rate limits) in front of Cloud Run, Cloud IDS on
// the VPC, events into Security Command Center. This module is the in-app layer.
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export const RULES = [
  { id: 'RK-IDS-001', name: 'Path traversal', sev: 'critical', action: 'block', map: 'OWASP A01 · MITRE T1083' },
  { id: 'RK-IDS-002', name: 'SQL injection pattern', sev: 'high', action: 'block', map: 'OWASP A03 · MITRE T1190' },
  { id: 'RK-IDS-003', name: 'Script injection (XSS)', sev: 'high', action: 'block', map: 'OWASP A03 · MITRE T1059.007' },
  { id: 'RK-IDS-004', name: 'Prompt injection aimed at the AI', sev: 'medium', action: 'alert', map: 'OWASP LLM01' },
  { id: 'RK-IDS-005', name: 'Request flood', sev: 'high', action: 'ban', map: 'OWASP API4 · MITRE T1498' },
  { id: 'RK-IDS-006', name: 'AI endpoint abuse (cost)', sev: 'medium', action: 'ratelimit', map: 'OWASP API4 · LLM10' },
  { id: 'RK-IDS-007', name: 'Recon / scanner probe', sev: 'critical', action: 'ban', map: 'MITRE T1595' },
  { id: 'RK-IDS-008', name: 'Attack tool user-agent', sev: 'high', action: 'block', map: 'MITRE T1595.002' },
  { id: 'RK-IDS-009', name: 'Forged evidence file (type mismatch)', sev: 'high', action: 'block', map: 'OWASP A04 · MITRE T1036' },
  { id: 'RK-IDS-010', name: 'State-change burst on one case', sev: 'medium', action: 'alert', map: 'OWASP API6' },
  { id: 'RK-IDS-011', name: 'Repeated 404s (enumeration)', sev: 'medium', action: 'ban', map: 'MITRE T1595.003' },
  { id: 'RK-IDS-012', name: 'Malformed request body', sev: 'low', action: 'alert', map: 'OWASP A05' },
];
const RULE = Object.fromEntries(RULES.map((r) => [r.id, r]));

const RX = {
  traversal: /(\.\.[/\\])|(%2e%2e[%2f5c/\\])|(%252e%252e)/i,
  sqli: /(\bunion\b[\s\S]{0,40}\bselect\b)|('\s*or\s*'?\d'?\s*=\s*'?\d)|(;\s*--)|(\bdrop\s+table\b)|(\bsleep\s*\(\s*\d+\s*\))|(\bor\s+1\s*=\s*1\b)/i,
  xss: /<\s*script\b|javascript\s*:|\bon(error|load|mouseover)\s*=|<\s*iframe\b|<\s*svg[^>]*\bon\w+\s*=/i,
  prompt: /ignore (all |the )?(previous|prior|above) (instructions|rules)|disregard (the|all) (above|previous)|you are now (a|an|in)|reveal (your|the) (system )?prompt|system prompt|mark all facts confirmed|act as (an? )?(admin|developer)/i,
  scanner: /\/(\.env|\.git|\.aws|wp-admin|wp-login|phpmyadmin|admin\.php|server-status|actuator|\.DS_Store|config\.json|id_rsa)/i,
  badUA: /(sqlmap|nikto|nmap|masscan|acunetix|nessus|dirbuster|gobuster|wpscan|zgrab|hydra)/i,
};
const AI_PATHS = /^\/api\/(cases\/[^/]+\/(turn|extract\/[^/]+|artefacts)|scamcheck|transcribe|tts|eval\/)/;
const STATE_PATHS = /^\/api\/cases\/([^/]+)\/(override|cancel|trusted|desk|pay)$/;
const MAGIC = { 'image/png': [0x89, 0x50, 0x4e, 0x47], 'image/jpeg': [0xff, 0xd8, 0xff], 'application/pdf': [0x25, 0x50, 0x44, 0x46], 'image/webp': [0x52, 0x49, 0x46, 0x46], 'audio/wav': [0x52, 0x49, 0x46, 0x46], 'audio/webm': [0x1a, 0x45, 0xdf, 0xa3] };

export const ids = {
  mode: 'prevent',
  events: [],
  bans: new Map(),          // ip -> { until, rule }
  hits: Object.fromEntries(RULES.map((r) => [r.id, 0])),
  counters: { inspected: 0, blocked: 0, alerted: 0 },
  windows: new Map(),       // `${kind}|${ip}` -> timestamps
};
// Persistence is plugged in by the host (a file in Node, nothing in the browser).
let store = null;
export function setPersistence(p) { store = p; try { const v = p?.load?.(); if (Array.isArray(v)) ids.events = v; } catch {} }
let saveTimer;
const persist = () => { if (!store) return; clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { store.save(ids.events.slice(0, 500)); } catch {} }, 300); };
const b64bytes = (b) => (globalThis.Buffer ? [...globalThis.Buffer.from(b, 'base64')] : [...atob(b)].map((ch) => ch.charCodeAt(0)));

// X-Forwarded-For is trusted only behind a known proxy (TRUST_PROXY=1, e.g. Cloud Run's
// front end) or from loopback (the local attack simulator). Otherwise it could be spoofed.
export function clientIp(req) {
  const sock = req.socket?.remoteAddress || 'unknown';
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xff && (globalThis.process?.env?.TRUST_PROXY === '1' || LOOPBACK.has(sock)) ? xff : sock;
}
export const looksLikeInjection = (t) => RX.prompt.test(String(t || ''));

function windowCount(kind, ip, ms) {
  const k = `${kind}|${ip}`, now = Date.now();
  const arr = (ids.windows.get(k) || []).filter((t) => now - t < ms);
  arr.push(now); ids.windows.set(k, arr);
  return arr.length;
}

function record(ruleId, ip, req, detail, outcome, caseId) {
  const r = RULE[ruleId];
  ids.hits[ruleId]++;
  const ev = { id: `EV${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, at: new Date().toISOString(), rule: ruleId, name: r.name, sev: r.sev, map: r.map, ip, method: req.method, path: req.path, detail: String(detail).slice(0, 180), outcome, caseId: caseId || null };
  ids.events.unshift(ev); ids.events.length = Math.min(ids.events.length, 500);
  if (outcome === 'alert') ids.counters.alerted++; else ids.counters.blocked++;
  persist();
  return ev;
}

function ban(ip, ruleId, ms) {
  // Never lock out the local operator: loopback is logged as "would ban" instead.
  if (LOOPBACK.has(ip)) return false;
  ids.bans.set(ip, { until: Date.now() + ms, rule: ruleId, at: new Date().toISOString() });
  return true;
}

// Walk every string in a JSON body (skipping base64 file data) and test it.
function* strings(v, key = '') {
  if (typeof v === 'string') { if (key !== 'dataUrl') yield [key, v]; }
  else if (Array.isArray(v)) for (const x of v) yield* strings(x, key);
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) yield* strings(x, k);
}

// Returns { allow:true } or { allow:false, status, error, event }.
export function inspect(req) {
  ids.counters.inspected++;
  const { ip, path, method, headers = {}, body } = req;
  const prevent = ids.mode === 'prevent';
  const deny = (ruleId, status, detail, extra = {}) => {
    // Volume rules never throttle the local operator (long tours, eval runs); they are logged only.
    if (LOOPBACK.has(ip) && ['RK-IDS-005', 'RK-IDS-006'].includes(ruleId)) { record(ruleId, ip, req, `${detail} (local operator: logged, not throttled)`, 'alert', extra.caseId); return { allow: true }; }
    const outcome = prevent ? (extra.banned ? 'banned' : RULE[ruleId].action === 'ratelimit' ? 'rate-limited' : 'blocked') : 'alert';
    const ev = record(ruleId, ip, req, detail, outcome, extra.caseId);
    return prevent ? { allow: false, status, error: `Blocked by Ruko IPS (${ruleId}: ${RULE[ruleId].name})`, event: ev } : { allow: true, event: ev };
  };

  const b = ids.bans.get(ip);
  if (b && b.until > Date.now() && prevent) { ids.counters.blocked++; return { allow: false, status: 403, error: `IP temporarily banned by Ruko IPS (${b.rule})` }; }
  if (b && b.until <= Date.now()) ids.bans.delete(ip);

  const rawUrl = req.rawUrl || path;
  if (RX.traversal.test(rawUrl)) return deny('RK-IDS-001', 400, rawUrl);
  if (RX.scanner.test(path)) { const banned = prevent && ban(ip, 'RK-IDS-007', 10 * 60e3); return deny('RK-IDS-007', 404, path, { banned }); }
  if (RX.badUA.test(headers['user-agent'] || '')) return deny('RK-IDS-008', 403, headers['user-agent']);

  // Flood: >150 API requests in 10 s from one IP.
  if (path.startsWith('/api/') && windowCount('all', ip, 10e3) > 150) { const banned = prevent && ban(ip, 'RK-IDS-005', 60e3); return deny('RK-IDS-005', 429, '>150 requests in 10 s', { banned }); }
  // AI endpoints cost money: >40 per minute per IP.
  if (method === 'POST' && AI_PATHS.test(path) && windowCount('ai', ip, 60e3) > 40) return deny('RK-IDS-006', 429, '>40 AI calls in 60 s');

  const caseId = (STATE_PATHS.exec(path) || [])[1] || (/^\/api\/cases\/([^/]+)/.exec(path) || [])[1];
  if (body && typeof body === 'object') {
    for (const [k, s] of strings(body)) {
      if (RX.sqli.test(s)) return deny('RK-IDS-002', 400, `${k}: ${s}`, { caseId });
      if (RX.xss.test(s)) return deny('RK-IDS-003', 400, `${k}: ${s}`, { caseId });
    }
    // Prompt injection is alert-only: a scam victim may quote the scammer's own text.
    // The pipeline already treats it as data (fact state is set by code, quotes are verified).
    for (const [k, s] of strings(body)) if (RX.prompt.test(s)) { record('RK-IDS-004', ip, req, `${k}: ${s}`, 'alert', caseId); break; }
    // Evidence: declared type must match the file's magic bytes.
    const files = [body, ...(Array.isArray(body.evidence) ? body.evidence : [])].filter((f) => typeof f?.dataUrl === 'string');
    for (const f of files) {
      const m = /^data:([^;]+);base64,(.{0,24})/.exec(f.dataUrl);
      if (!m) continue;
      const want = MAGIC[m[1]];
      if (!want) continue;
      const head = b64bytes(m[2]);
      if (!want.every((x, i) => head[i] === x)) return deny('RK-IDS-009', 415, `declared ${m[1]} but bytes are ${head.slice(0, 4).map((x) => x.toString(16).padStart(2, '0')).join(' ')}`, { caseId });
    }
  }
  if (method === 'POST' && STATE_PATHS.test(path) && windowCount(`state:${caseId}`, ip, 10e3) > 6) record('RK-IDS-010', ip, req, `>6 state changes on ${caseId} in 10 s`, 'alert', caseId);
  return { allow: true };
}

export function note404(req) {
  if (windowCount('404', req.ip, 60e3) > 15) {
    const banned = ids.mode === 'prevent' && ban(req.ip, 'RK-IDS-011', 5 * 60e3);
    record('RK-IDS-011', req.ip, req, `>15 not-found responses in 60 s (last ${req.path})`, banned ? 'banned' : 'alert');
  }
}
export function noteMalformed(req, err) { record('RK-IDS-012', req.ip, req, err, 'alert'); }
// Prompt injection found by the AI pipeline itself (e.g. text inside an uploaded image).
export function notePipelineInjection(ip, caseId, detail) { record('RK-IDS-004', ip, { method: 'AI', path: 'evidence_reader' }, detail, 'alert', caseId); }

export function snapshot() {
  const now = Date.now();
  for (const [ip, b] of ids.bans) if (b.until <= now) ids.bans.delete(ip);
  return {
    mode: ids.mode, counters: ids.counters,
    rules: RULES.map((r) => ({ ...r, hits: ids.hits[r.id] })),
    bans: [...ids.bans].map(([ip, b]) => ({ ip, ...b, secondsLeft: Math.round((b.until - now) / 1000) })),
    events: ids.events.slice(0, 100),
  };
}
export function resetIds() { ids.events = []; ids.bans.clear(); ids.windows.clear(); for (const k of Object.keys(ids.hits)) ids.hits[k] = 0; ids.counters = { inspected: 0, blocked: 0, alerted: 0 }; persist(); }
