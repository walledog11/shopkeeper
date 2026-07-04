#!/usr/bin/env bash
set -euo pipefail

: "${GCP_PROJECT_ID:?Set GCP_PROJECT_ID}"
: "${GMAIL_PUBSUB_PUSH_ENDPOINT:?Set GMAIL_PUBSUB_PUSH_ENDPOINT to the public gateway /webhooks/gmail/push URL}"
: "${GMAIL_PUBSUB_AUDIENCE:?Set GMAIL_PUBSUB_AUDIENCE}"

case "$GMAIL_PUBSUB_PUSH_ENDPOINT" in
  */webhooks/gmail/push) ;;
  *)
    echo "GMAIL_PUBSUB_PUSH_ENDPOINT must end with /webhooks/gmail/push" >&2
    exit 1
    ;;
esac

TOPIC_ID="${GMAIL_PUBSUB_TOPIC_ID:-gmail-inbound}"
SUBSCRIPTION_ID="${GMAIL_PUBSUB_SUBSCRIPTION_ID:-gmail-inbound-push}"
PUSH_SERVICE_ACCOUNT_NAME="${GMAIL_PUBSUB_PUSH_SERVICE_ACCOUNT_NAME:-shopkeeper-gmail-push}"
PUSH_SERVICE_ACCOUNT="${GMAIL_PUBSUB_PUSH_SERVICE_ACCOUNT:-${PUSH_SERVICE_ACCOUNT_NAME}@${GCP_PROJECT_ID}.iam.gserviceaccount.com}"
if [[ -n "${GMAIL_PUBSUB_PUSH_SERVICE_ACCOUNT:-}" ]]; then
  PUSH_SERVICE_ACCOUNT_NAME="${PUSH_SERVICE_ACCOUNT%%@*}"
fi
TOPIC_NAME="projects/${GCP_PROJECT_ID}/topics/${TOPIC_ID}"

if ! gcloud pubsub topics describe "$TOPIC_ID" --project "$GCP_PROJECT_ID" >/dev/null 2>&1; then
  gcloud pubsub topics create "$TOPIC_ID" --project "$GCP_PROJECT_ID"
fi

gcloud pubsub topics add-iam-policy-binding "$TOPIC_ID" \
  --project "$GCP_PROJECT_ID" \
  --member "serviceAccount:gmail-api-push@system.gserviceaccount.com" \
  --role "roles/pubsub.publisher"

if ! gcloud iam service-accounts describe "$PUSH_SERVICE_ACCOUNT" \
  --project "$GCP_PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$PUSH_SERVICE_ACCOUNT_NAME" \
    --project "$GCP_PROJECT_ID" \
    --display-name "Shopkeeper Gmail Pub/Sub push"
fi

PROJECT_NUMBER="$(gcloud projects describe "$GCP_PROJECT_ID" --format='value(projectNumber)')"
gcloud iam service-accounts add-iam-policy-binding "$PUSH_SERVICE_ACCOUNT" \
  --project "$GCP_PROJECT_ID" \
  --member "serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-pubsub.iam.gserviceaccount.com" \
  --role "roles/iam.serviceAccountTokenCreator"

if gcloud pubsub subscriptions describe "$SUBSCRIPTION_ID" \
  --project "$GCP_PROJECT_ID" >/dev/null 2>&1; then
  gcloud pubsub subscriptions update "$SUBSCRIPTION_ID" \
    --project "$GCP_PROJECT_ID" \
    --push-endpoint "$GMAIL_PUBSUB_PUSH_ENDPOINT" \
    --push-auth-service-account "$PUSH_SERVICE_ACCOUNT" \
    --push-auth-token-audience "$GMAIL_PUBSUB_AUDIENCE"
else
  gcloud pubsub subscriptions create "$SUBSCRIPTION_ID" \
    --project "$GCP_PROJECT_ID" \
    --topic "$TOPIC_ID" \
    --push-endpoint "$GMAIL_PUBSUB_PUSH_ENDPOINT" \
    --push-auth-service-account "$PUSH_SERVICE_ACCOUNT" \
    --push-auth-token-audience "$GMAIL_PUBSUB_AUDIENCE"
fi

echo "GMAIL_PUBSUB_TOPIC=${TOPIC_NAME}"
echo "GMAIL_PUBSUB_AUDIENCE=${GMAIL_PUBSUB_AUDIENCE}"
echo "GMAIL_PUBSUB_PUSH_SERVICE_ACCOUNT=${PUSH_SERVICE_ACCOUNT}"
