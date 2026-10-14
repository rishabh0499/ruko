// Blocks a commit that would publish a secret: .env, the store/ folder, or anything that looks
// like a Gemini / Google API key. Installed by scripts/install-hooks.sh.
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const staged = execSync('git diff --cached --name-only --diff-filter=ACM', { encoding: 'utf8' }).split('\n').filter(Boolean);
const bad = [];
for (const f of staged) if (f === '.env' || f.startsWith('store/') || f.endsWith('.pem')) bad.push(`${f} (never commit this file)`);

const patterns = [/AQ\.[A-Za-z0-9_-]{40,}/, /AIza[0-9A-Za-z_-]{35}/];
const envKey = existsSync('.env') ? (readFileSync('.env', 'utf8').match(/^GEMINI_API_KEY=(.+)$/m) || [])[1]?.trim() : '';
for (const f of staged) {
  let text;
  try { text = execSync(`git show :${JSON.stringify(f).slice(1, -1)}`, { encoding: 'utf8', maxBuffer: 64e6 }); } catch { continue; }
  if ((envKey && text.includes(envKey)) || patterns.some((p) => p.test(text))) bad.push(`${f} (contains something that looks like an API key)`);
}
if (bad.length) {
  console.error('\n✖ Commit blocked by Ruko secret check:\n  ' + bad.join('\n  ') + '\n  Remove the secret, then commit again.\n');
  process.exit(1);
}
