#!/usr/bin/env bash
# One-time setup for .github/workflows/deploy.yml (push to main → live site).
# Creates a deploy-only service account on project ruko-ai and lets ONLY the
# rishabh0499/ruko repo's main branch use it through GitHub OIDC (no key file).
set -euo pipefail
G=${GCLOUD:-$HOME/.local/bin/gcloud}; P=ruko-ai; NUM=866580466351; REPO=rishabh0499/ruko
SA=github-deployer@$P.iam.gserviceaccount.com
$G iam service-accounts describe $SA --project $P >/dev/null 2>&1 || \
  $G iam service-accounts create github-deployer --display-name="GitHub Actions deploy (Firebase Hosting)" --project $P
for R in roles/firebasehosting.admin roles/serviceusage.serviceUsageConsumer; do
  $G projects add-iam-policy-binding $P --member="serviceAccount:$SA" --role=$R --condition=None -q >/dev/null && echo "granted $R"
done
$G iam workload-identity-pools describe github --location=global --project $P >/dev/null 2>&1 || \
  $G iam workload-identity-pools create github --location=global --display-name="GitHub" --project $P
$G iam workload-identity-pools providers describe ruko-repo --location=global --workload-identity-pool=github --project $P >/dev/null 2>&1 || \
  $G iam workload-identity-pools providers create-oidc ruko-repo --location=global --workload-identity-pool=github --project $P \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
    --attribute-condition="assertion.repository=='$REPO' && assertion.ref=='refs/heads/main'"
$G iam service-accounts add-iam-policy-binding $SA --project $P --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$NUM/locations/global/workloadIdentityPools/github/attribute.repository/$REPO" >/dev/null
echo "granted workloadIdentityUser to $REPO"
echo "WIF provider: projects/$NUM/locations/global/workloadIdentityPools/github/providers/ruko-repo"
echo "Service account: $SA"

# GitHub side: the web key as a secret (it ends up in the public site anyway, so restrict it
# to the site's domains in Google Cloud), plus the non-secret deploy settings as variables.
GH=${GH:-$HOME/.local/bin/gh}
ENVF="$(dirname "$0")/../.env"
val() { grep -E "^$1=" "$ENVF" | head -1 | cut -d= -f2- | tr -d '\n'; }
val WEB_GEMINI_API_KEY | $GH secret set WEB_GEMINI_API_KEY -R $REPO
$GH variable set GCP_WIF_PROVIDER -R $REPO -b "projects/$NUM/locations/global/workloadIdentityPools/github/providers/ruko-repo"
$GH variable set GCP_DEPLOY_SA -R $REPO -b "$SA"
$GH variable set GEMINI_MODEL_FAST -R $REPO -b "$(val GEMINI_MODEL_FAST)"
$GH variable set GEMINI_MODEL_PRO -R $REPO -b "$(val GEMINI_MODEL_PRO)"
echo "GitHub secret + variables set on $REPO. Setup done."
