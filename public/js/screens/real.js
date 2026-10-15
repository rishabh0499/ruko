import { get } from '../api.js';
import { esc, pageHead } from '../ui.js';
import { app } from '../main.js';

export async function render(el) {
  const u = await get('/usage');
  const gem = app.config.aiMode === 'gemini';
  const row = (what, how, status) => `<tr><td><b>${what}</b></td><td class="small">${how}</td><td>${status}</td></tr>`;
  const R = '<span class="pill ok">Real</span>', G = gem ? '<span class="pill ok">Real (Gemini)</span>' : '<span class="pill warn">Real code · cached AI</span>', M = '<span class="pill warn">Mocked</span>', S = '<span class="pill info">Synthetic</span>';
  el.innerHTML = `
    ${pageHead({ eyebrow: 'For judges', title: 'Real vs Mocked', desc: `Everything in the demo, and what it really is. AI right now: <b>${gem ? `Gemini (${esc(app.config.models.fast)})` : 'offline rules (no API key)'}</b>.` })}
    ${app.config.static ? `<div class="callout warn" style="margin-bottom:14px;max-width:860px"><span><b>You are viewing the shareable offline build.</b> The same application code runs inside your browser instead of on a server. Rows marked "Real (Gemini)" use the offline rules engine and stored sample results here; voices that were generated with Gemini TTS are included as audio files.</span></div>` : ''}
    <div class="tablewrap"><table class="t"><thead><tr><th>Part</th><th>How it works here</th><th>Status</th></tr></thead><tbody>
      ${row('Risk engine (every rail)', 'Deterministic points and floors over the whole journey: rolling totals to new payees (24 h / 7 days), velocity, near-identical amounts, savings broken in the last 72 h, device signals, payee intel, customer memory. Tiers T0 silent to T5 fraud desk. Code decides.', R)}
      ${row('Journey patterns', 'Code detectors (investment trajectory, task scam, liquidation, blackmail, splitting, takeover) plus a Gemini journey analyst that names the pattern with transaction ids; code verifies every id, and a Gemini-only finding needs two or more cited payments to add points and can never force a tier.', G)}
      ${row('Payment streams, device, telecom and registry signals', 'Nothing is typed in by hand: in production device state comes from the Ruko SDK in the bank app, payee account age from the beneficiary bank / NPCI, history from core banking, and payee risk from the Suspect Registry, MuleHunter.AI and DoT FRI. In this demo the customers, ledgers, payee directory, call and screen-share state, SIM changes and registry hits are simulated.', M)}
      ${row('Trigger', 'Deterministic rules: new payee + amount, amount vs 90-day max, payee account age, session signals, payee-name words.', R)}
      ${row('Interview flow', 'Code picks the next question (purpose → coached follow-up → who/how → the one true thing → secrecy → evidence). Gemini phrases it in the customer\'s language when a key is set and sound is off; with sound on, Ruko speaks fixed questions so every line has a cached Gemini voice.', G)}
      ${row('Voices', 'Gemini TTS (gemini-3.8-flash-tts and fallbacks): Ruko, the customer and the trusted contact each have their own voice. Known lines are pre-voiced and cached on disk; anything not ready falls back to browser speech.', G)}
      ${row('Signal extraction', 'Gemini returns each signal with the customer\'s exact quote; any signal whose quote is not in the transcript is dropped. Offline: rules in Hindi and English.', G)}
      ${row('Script matching', 'A 15-entry library paraphrased from I4C, PIB, SPF and AFP material. Exact keywords first; then Gemini embeddings (gemini-embedding-001) catch the same script told in the customer\'s own words, Hindi or English. The quote is always the customer\'s own sentence, and the similarity threshold is set so no legitimate eval sentence matches. Offline: keywords only.', G)}
      ${row('Decider', 'Pure code. Weighted score, fixed thresholds, plus a coercion rule (coached + dictated → hold). Unit-tested.', R)}
      ${row('Evidence reader', 'Gemini multimodal with source boxes. Fact state is always set by code. Offline: stored ground truth for sample files only.', G)}
      ${row('Trail, clocks, validator', 'Deterministic: exact matching for legs, RBI working-day clocks, and a release gate that blocks any untraced number.', R)}
      ${row('Drafting', 'Fixed templates; Gemini may write the incident narrative using {{fact:ID}} placeholders only. Blocked narratives fall back to the victim\'s own words.', G)}
      ${row('Scam Check', 'Gemini (text or image) with quote checks; offline uses the same rules as the interview.', G)}
      ${row('Voice input', 'The customer speaks; Gemini transcribes the recording word for word (Hindi in Devanagari, no translation) and the text lands in the answer box for the customer to check and send. Works in any browser. Offline: browser speech recognition. A two-way Gemini Live conversation is on the roadmap.', G)}
      ${row('IDS / IPS', '12 application-layer rules inspect every API request (traversal, SQLi, XSS, prompt injection, scanners, forged files, floods, enumeration). Detect or prevent mode, temporary IP bans, live console with an attack simulator. Production adds Cloud Armor and Cloud IDS.', R)}
      ${row('Bharat Bank app', 'A fictional bank. Session signals are toggles you set.', M)}
      ${row('Payee-risk lookup', 'A local list standing in for Chakshu / I4C Suspect Registry.', M)}
      ${row('Trusted-contact SMS / call', 'Shown on the simulated second phone. Nothing is sent.', M)}
      ${row('1930 / NCRP / bank submission', 'Documents are drafted and downloadable; nothing is submitted anywhere.', M)}
      ${row('Officer view', 'Read-only page, no police authentication.', M)}
      ${row('People, accounts, documents, eval set', 'Written or generated by the team from public advisories and news reports.', S)}
      ${row('Storage', 'JSON file and local folder on this computer (store/). Production: Firestore + Cloud Storage in asia-south1.', '<span class="pill">Local</span>')}
    </tbody></table></div>
    <div class="grid g4" style="margin-top:18px">
      <div class="card kpi"><div class="num">${u.calls}</div><div class="lbl">Gemini calls this session</div></div>
      <div class="card kpi"><div class="num">${u.failures}</div><div class="lbl">Failed / fell back</div></div>
      <div class="card kpi"><div class="num">${(u.inputTokens + u.outputTokens).toLocaleString('en-IN')}</div><div class="lbl">Tokens</div></div>
      <div class="card kpi"><div class="num">₹${u.costINR.toFixed(2)}</div><div class="lbl">Est. model cost</div></div>
    </div>
    ${u.log.length ? `<div class="card" style="margin-top:16px"><h3>Recent model calls</h3><div class="tablewrap"><table class="t"><tbody>${u.log.slice(0, 15).map((l) => `<tr><td class="mono">${esc(l.name)}</td><td class="small">${esc(l.model)}</td><td>${l.ok ? '<span class="pill ok">ok</span>' : `<span class="pill bad">${esc(l.reason)}</span>`}</td><td class="small">${l.ms} ms</td></tr>`).join('')}</tbody></table></div></div>` : ''}
    <div class="card" style="margin-top:16px"><h3>Production path</h3><ul class="small"><li>Front end on Firebase Hosting; API on Cloud Run (asia-south1, min instances = 1 on the demo path).</li><li>Agents on Agent Development Kit, deployed to Vertex AI Agent Engine; scam-script library on Vertex AI embeddings.</li><li>Firestore for cases and Cloud Storage for evidence with signed, expiring URLs; full audit trail.</li><li>Bank integration as a step-up at authorisation, like 3-D Secure.</li></ul></div>`;
}
