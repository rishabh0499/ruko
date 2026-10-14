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
- Key public site mein jaati hai. AI Studio ki key service account se bound hai, isliye Google us pe website restriction lagne nahi deta (sirf API restriction: Gemini API, jo laga hai). Project pe billing nahi hai, toh misuse se paisa nahi jaata; zyada se zyada free quota khatam hoga aur app offline rules pe chala jaayega. Pakka ilaaj: Firebase AI Logic + App Check (key server side).
- `dist-web/` gitignored hai; kabhi commit mat karna.

### Auto-deploy (GitHub Actions)
`main` pe har push ke baad `.github/workflows/deploy.yml` chalta hai: tests, build, phir Firebase pe deploy. 1-2 minute mein live site update.
- Login keyless hai (Workload Identity Federation). GitHub mein koi Google key nahi hai; sirf `rishabh0499/ruko` ki `main` branch deploy kar sakti hai, service account `github-deployer` ke through, jiske paas sirf Firebase Hosting ka role hai.
- GitHub secret: `WEB_GEMINI_API_KEY`. Variables: `GCP_WIF_PROVIDER`, `GCP_DEPLOY_SA`, `GEMINI_MODEL_FAST`, `GEMINI_MODEL_PRO`.
- Ek baar ka setup: `bash scripts/setup-ci.sh` (dobara chalana safe hai).
- Voice files `assets/tts/` mein commit hoti hain taaki CI build mein awaaz rahe. Local build naye `store/tts` recordings wahan copy kar deta hai.

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
