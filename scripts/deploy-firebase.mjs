// Deploys dist-web/ to Firebase Hosting (free Spark plan) through the Hosting REST API, using
// the gcloud login (no Firebase CLI needed). Build first: node scripts/build-static.mjs web
// Usage: node scripts/deploy-firebase.mjs [site-id]   (default: ruko-ai)
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync as gz } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIR = join(ROOT, 'dist-web');
const SITE = process.argv[2] || 'ruko-ai';
const PROJECT = process.env.FIREBASE_PROJECT || SITE;
const GCLOUD = process.env.GCLOUD || `${process.env.HOME}/.local/bin/gcloud`;
const token = execSync(`"${GCLOUD}" auth print-access-token`, { encoding: 'utf8' }).trim();
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

// 1. New version with caching headers; every path not found falls back to the app shell.
const version = await call('POST', `${API}/sites/${SITE}/versions`, {
  config: {
    headers: [
      { glob: '**/*.@(js|css)', headers: { 'Cache-Control': 'no-cache' } },
      { glob: '/tts/**', headers: { 'Cache-Control': 'public, max-age=604800' } },
      { glob: '**', headers: { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' } },
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
