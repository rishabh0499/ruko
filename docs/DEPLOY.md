# Deploy aur submission checklist (Hinglish)

## 1. GitHub repo (public, FAQ ki zaroorat)
```bash
cd ruko-app
git init && git add . && git commit -m "Ruko: AI Builder Cup 2026 BFSI"
# github.com pe naya PUBLIC repo banao (naam: ruko), phir:
git remote add origin https://github.com/<aapka-username>/ruko.git
git branch -M main && git push -u origin main
```
`.env` (API key) `.gitignore` mein hai, isliye commit nahi hoga. Push se pehle `git status` mein check kar lena ki `.env` list mein nahi hai.

## 2. Firebase Hosting (abhi yahi live hai, free Spark plan)
Live: https://ruko-ai.web.app
```bash
node scripts/build-static.mjs web      # dist-web/ banata hai, .env ka WEB_GEMINI_API_KEY andar daalta hai
node scripts/deploy-firebase.mjs       # gcloud login token se Hosting REST API pe deploy
```
- Key public site mein jaati hai, isliye Google Cloud console mein usko restrict karna zaroori hai: website `https://ruko-ai.web.app/*` aur `https://ruko-ai.firebaseapp.com/*`, API sirf Generative Language API.
- `dist-web/` gitignored hai; kabhi commit mat karna.

## 2b. Cloud Run (optional, billing chahiye)
1. gcloud install karo: https://cloud.google.com/sdk/docs/install
2. Login aur project:
   ```bash
   gcloud auth login
   gcloud config set project <PROJECT_ID>        # billing on hona chahiye
   printf '%s' "<GEMINI_KEY>" | gcloud secrets create gemini-api-key --data-file=-
   ```
3. `./deploy.sh` chalao. Last line mein public URL aayega.

Notes:
- `--min-instances 1` demo path ko warm rakhta hai (cold start nahi). Evaluation window (19 Oct – 6 Nov) tak service chalu rakhni hai, isliye thoda billing lagega.
- Cloud Run ka disk temporary hai: cases restart pe mit jaate hain. Demo ke liye theek hai; production mein Firestore + Cloud Storage.
- Free-tier Gemini key pe Pro models ki quota 0 hai aur Flash ki limits kam hain. Judging ke dauran rate-limit se bachne ke liye AI Studio project pe billing on karna best hai. Phir `GEMINI_MODEL_PRO` mein `gemini-pro-latest` daal sakte ho.

## 3. Submission (18 Oct, target 16 Oct)
- [x] Deployed link: https://ruko-ai.web.app
- [x] Public GitHub repo: https://github.com/rishabh0499/ruko
- [ ] 3-minute video (YouTube, unlisted chalega). Script: `docs/VIDEO_SCRIPT.md`
- [ ] Deck PDF
- [ ] Category: BFSI — Intelligent Risk, Fraud & Financial Experiences
