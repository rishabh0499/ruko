#!/bin/bash
# Deploy Ruko to Cloud Run (asia-south1). Prerequisites: gcloud installed and logged in,
# a project with billing, and the Gemini key stored in Secret Manager as "gemini-api-key".
#   gcloud auth login
#   gcloud config set project YOUR_PROJECT_ID
#   printf '%s' "YOUR_KEY" | gcloud secrets create gemini-api-key --data-file=-
set -euo pipefail
cd "$(dirname "$0")"
REGION="${REGION:-asia-south1}"
SERVICE="${SERVICE:-ruko}"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com artifactregistry.googleapis.com
PROJECT_NUMBER=$(gcloud projects describe "$(gcloud config get-value project)" --format='value(projectNumber)')
gcloud secrets add-iam-policy-binding gemini-api-key \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role=roles/secretmanager.secretAccessor >/dev/null
gcloud run deploy "$SERVICE" --source . --region "$REGION" --allow-unauthenticated \
  --min-instances 1 --max-instances 3 --memory 512Mi --timeout 120 \
  --set-secrets GEMINI_API_KEY=gemini-api-key:latest \
  --set-env-vars "^@^GEMINI_MODEL_FAST=gemini-3.5-flash,gemini-3.1-flash-lite,gemini-flash-latest@GEMINI_MODEL_PRO=gemini-3.5-flash,gemini-3.8-flash,gemini-3-flash-preview"
gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)'
