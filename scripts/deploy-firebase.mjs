// Deploys dist-web/ to Firebase Hosting (free Spark plan) through the Hosting REST API, using
// the gcloud login (no Firebase CLI needed). Build first: node scripts/build-static.mjs web
// Usage: node scripts/deploy-firebase.mjs [site-id]   (default: ruko-ai)
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync as gz } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIR = join(ROOT, 'dist-web');
const SITE = process.argv[2] || 'ruko-ai';
const PROJECT = process.env.FIREBASE_PROJECT || SITE;
// Token: GOOGLE_ACCESS_TOKEN in CI (GitHub Actions, keyless Workload Identity), else the local gcloud login.
const LOCAL_GCLOUD = `${process.env.HOME}/.local/bin/gcloud`;
const GCLOUD = process.env.GCLOUD || (existsSync(LOCAL_GCLOUD) ? LOCAL_GCLOUD : 'gcloud');
const token = process.env.GOOGLE_ACCESS_TOKEN || execSync(`"${GCLOUD}" auth print-access-token`, { encoding: 'utf8' }).trim();
const H = { authorization: `Bearer ${token}`, 'x-goog-user-project': PROJECT, 'content-type': 'application/json' };
const API = 'https://firebasehosting.googleapis.com/v1beta1';

async function call(method, url, body) {
  const r = await fetch(url, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${url}: ${d?.error?.message || r.status}`);
  return d;
}

const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const files = {};
const blobs = {};
for (const f of walk(DIR)) {
  const z = gz(readFileSync(f), { level: 9 });
  const hash = createHash('sha256').update(z).digest('hex');
  files['/' + relative(DIR, f).split('\\').join('/')] = hash;
  blobs[hash] = z;
}

// Content-Security-Policy: only this site, Google Fonts and the Gemini API. The two inline
// scripts in index.html (theme, runtime config) are allowed by hash, so no 'unsafe-inline' script.
const html = readFileSync(join(DIR, 'index.html'), 'utf8');
const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`);
const CSP = [
  "default-src 'self'", `script-src 'self' ${hashes.join(' ')}`, "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com", "img-src 'self' data: blob:", "media-src 'self' data: blob:",
  "connect-src 'self' https://generativelanguage.googleapis.com", "object-src 'none'", "base-uri 'none'", "form-action 'none'",
  "frame-ancestors 'none'", 'upgrade-insecure-requests',
].join('; ');
const SECURITY = {
  'Content-Security-Policy': CSP, 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin', 'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'microphone=(self), camera=(), geolocation=(), payment=(), usb=()',
};
if (process.argv.includes('--print-headers')) { console.log(JSON.stringify(SECURITY, null, 1)); process.exit(0); }

// 1. New version with caching and security headers; unknown paths fall back to the app shell.
const version = await call('POST', `${API}/sites/${SITE}/versions`, {
  config: {
    headers: [
      { glob: '**/*.@(js|css)', headers: { 'Cache-Control': 'no-cache' } },
      // The page itself must never be cached for an hour (Firebase's default), or visitors keep an
      // old index.html that no longer matches the newly deployed modules.
      { glob: '/', headers: { 'Cache-Control': 'no-cache' } },
      { glob: '**/*.html', headers: { 'Cache-Control': 'no-cache' } },
      { glob: '/tts/**', headers: { 'Cache-Control': 'public, max-age=604800' } },
      { glob: '**', headers: SECURITY },
    ],
    rewrites: [{ glob: '**', path: '/index.html' }],
  },
});
// 2. Tell Hosting which files we have; upload only the ones it does not already store.
const pop = await call('POST', `${API}/${version.name}:populateFiles`, { files });
const need = pop.uploadRequiredHashes || [];
for (const h of need) {
  const r = await fetch(`${pop.uploadUrl}/${h}`, { method: 'POST', headers: { authorization: H.authorization, 'x-goog-user-project': PROJECT, 'content-type': 'application/octet-stream' }, body: blobs[h] });
  if (!r.ok) throw new Error(`upload ${h}: ${r.status} ${await r.text()}`);
}
// 3. Finalize and release.
await call('PATCH', `${API}/${version.name}?update_mask=status`, { status: 'FINALIZED' });
const rel = await call('POST', `${API}/sites/${SITE}/releases?versionName=${encodeURIComponent(version.name)}`, { message: `Ruko deploy ${new Date().toISOString()}` });
console.log(`Deployed ${Object.keys(files).length} files (${need.length} uploaded) → https://${SITE}.web.app  (${rel.name.split('/').pop()})`);
