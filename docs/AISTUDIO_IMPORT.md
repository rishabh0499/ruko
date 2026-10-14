# Ruko → Google AI Studio (exact replica)

AI Studio cannot open claude.ai links, and its docs only describe ZIP **export**, not import. The supported path is **Import from GitHub**.

## Steps (Hinglish)

1. Is folder (`ruko-app/`) ko ek **public GitHub repo** mein push karo. `.env` (API key) aur `store/` git mein nahi jaate.
2. **aistudio.google.com** → **Build** → prompt box ke neeche-left **+** → **Import from GitHub** → repo chuno → **Import repository**.
3. Import hote hi neeche wala **prompt** paste karo.
4. AI Studio mein **Secrets** → `GEMINI_API_KEY` set karo (wahi key). Key server pe rehti hai, browser mein kabhi nahi jaati.
5. Preview mein checklist (neeche) chala ke match karo.
6. **Deploy → Cloud Run**. Phir **Settings → GitHub** se changes wapas repo mein push karo.

## Prompt to paste right after import

```
This repository is "Ruko", a complete, working app for the Google Cloud AI Builder Cup 2026 (BFSI track). Make it run in AI Studio as an EXACT replica. Do not redesign, rename, simplify, or "improve" anything.

Architecture you must preserve:
- server.js is a zero-dependency Node.js HTTP server (no Express). It serves public/ as static files and exposes a JSON API under /api/*. Keep it as the server entry point. If your runtime needs a different entry, add a thin wrapper that imports server.js; do not rewrite its routes.
- lib/ holds all logic: policy.js (trigger, signals, decider), interviewer.js, extractor.js, casefile.js (trail, clocks, drafter, validator), gemini.js (Gemini REST client with model fallback chains), tts.js (Gemini TTS + disk cache), ids.js (IDS/IPS that inspects every request). Keep every file and function as is.
- public/ is a vanilla-JS single-page app with ES modules and no build step (index.html, css/app.css, js/main.js, js/screens/*.js, js/voice.js, js/icons.js, js/i18n.js, js/shared/evidence.js). Do NOT convert it to React. Serve it exactly as it is.
- data/ holds scenarios, the evaluation set, scam scripts and a mock registry. test/ holds node:test unit tests (npm test).
- State is a JSON file and folders under store/ (created at runtime). Keep this.

What you may change, and only this:
- Read GEMINI_API_KEY from your secrets (process.env.GEMINI_API_KEY). Model chains come from GEMINI_MODEL_FAST, GEMINI_MODEL_PRO and GEMINI_MODEL_TTS env vars, with the defaults already in lib/gemini.js and lib/tts.js.
- Listen on process.env.PORT and set HOST=0.0.0.0 in your runtime (server.js already reads both).
- If the preview runs behind a proxy, set TRUST_PROXY=1 so the IDS reads the real client IP.
- Add only the config files your runtime needs (for example package.json scripts). Keep "type": "module".

After it runs, confirm all of these still work, and fix only what breaks:
1. Demo Hub with the animated console, three scenario cards, Light/Dark/Auto theme switch, English/हिंदी switch, ⌘K palette.
2. Scenario A in English and Hindi: Pay → interview with the agent-reasoning panel and risk gauge → escalate → trusted contact's phone gets the SMS → call with ringtone, voices and captions → the contact sends advice ("It is a scam") → the customer sees the warning and chooses Cancel or Send anyway → the contact gets a cancelled / sent-anyway message.
3. Scenario B never holds. Scenario C produces the bona fides pack.
4. ReturnPath: consent, evidence with source boxes, three fact states, money trail, five documents with the "all values traced" validator, clocks.
5. Fraud Desk, Officer View, Scam Check, Evaluation, Evidence Studio, Real vs Mocked, and Security · IDS/IPS with the attack simulator.
6. The guided tour and the Judge demo run end to end.
7. npm test passes (24 tests).

If something cannot run in AI Studio, tell me exactly what and why before changing it.
```

## Notes

- Free-tier keys have no Pro model quota and only 10 TTS requests per model per day. Enable billing on the project for a smooth demo.
- AI Studio's own docs say it may modify imported code so it builds there, and its sync tutorial uses a force push afterwards. Keep the original repo (or a branch) as the reference copy.
- The Dockerfile and deploy.sh in this repo deploy the original directly to Cloud Run if you ever need the reference version live.
