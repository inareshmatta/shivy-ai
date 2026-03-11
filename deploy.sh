#!/bin/bash
set -e

# Deployment script for KlassroomAI to Google Cloud Run

echo "========================================"
echo "  Deploying KlassroomAI to Cloud Run"
echo "========================================"
echo ""

# 1. Ensure frontend is built and copied to backend
echo "[1/3] Building frontend..."
cd frontend
if [ ! -d "node_modules" ]; then
    echo "Installing frontend dependencies..."
    npm install
fi
echo "Compiling frontend..."
npm run build

echo ""
echo "Copying frontend build to backend..."
cp -R dist/* ../backend/static/

# 2. Deploy to Google Cloud Run
echo ""
echo "[2/3] Deploying to Google Cloud Run..."
cd ../backend

# Set your GCP Project ID here
GCP_PROJECT_ID="klassroom-ai-backend"
SERVICE_NAME="klassroom-api"
REGION="us-central1"

echo "Project: $GCP_PROJECT_ID"
echo "Service: $SERVICE_NAME"
echo "Region: $REGION"

gcloud run deploy "$SERVICE_NAME" \
    --source . \
    --region "$REGION" \
    --project "$GCP_PROJECT_ID" \
    --allow-unauthenticated

# 3. Done
echo ""
echo "========================================"
echo "  Deployment Complete!"
echo "========================================"
