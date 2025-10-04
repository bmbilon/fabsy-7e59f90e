#!/usr/bin/env bash
set -euo pipefail

# Deploy Twilio Serverless Functions for SMS→Email and set the phone number webhook
# Requirements:
#  - twilio CLI logged in (twilio login or API key profile)
#  - Resend API key ready
#  - Run from repo root
#
# Usage:
#  export TWILIO_PHONE_E164="+18252532279"  # your Twilio number
#  export TWILIO_ACCOUNT_SID="AC..."         # optional if not using default profile
#  export RESEND_API_KEY="re_..."
#  export EMAIL_TO="brett@execom.ca,hello@fabsy.ca"
#  export EMAIL_FROM="no-reply@fabsy.ca"
#  scripts/deploy-twilio-sms-forward.sh

DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/.." && pwd)"
SRV_DIR="$ROOT/twilio-serverless"

if [[ -z "${TWILIO_PHONE_E164:-}" ]]; then
  echo "TWILIO_PHONE_E164 not set (e.g., +18252532279)" >&2
  exit 1
fi

# Prepare env for serverless deploy
cp -n "$SRV_DIR/.env.example" "$SRV_DIR/.env" || true
awk -v rk="${RESEND_API_KEY:-}" -v to="${EMAIL_TO:-brett@execom.ca,hello@fabsy.ca}" -v from="${EMAIL_FROM:-no-reply@fabsy.ca}" '
  BEGIN { FS=OFS="=" }
  $1=="RESEND_API_KEY" { $2=rk; print; next }
  $1=="EMAIL_TO" { $2=to; print; next }
  $1=="EMAIL_FROM" { $2=from; print; next }
  { print }
' "$SRV_DIR/.env" > "$SRV_DIR/.env.tmp" && mv "$SRV_DIR/.env.tmp" "$SRV_DIR/.env"

# Deploy service
cd "$SRV_DIR"
TWILIO_LOG_LEVEL=debug twilio serverless:deploy --force > deploy.log 2>&1 || (echo "Twilio deploy failed; see $SRV_DIR/deploy.log" >&2; exit 1)

# Extract domain and function path
DOMAIN=$(grep -Eo 'https://[a-z0-9\-]+\.twil\.io' deploy.log | head -n1)
if [[ -z "$DOMAIN" ]]; then
  echo "Could not detect Twilio Functions domain from deploy.log" >&2
  exit 1
fi
WEBHOOK_URL="$DOMAIN/sms-to-email"

# Find PhoneNumber SID for the given E.164 number
PNSID=$(twilio api:core:incoming-phone-numbers:list --phone-number "$TWILIO_PHONE_E164" --limit 1 --output json | jq -r '.[0].sid')
if [[ -z "$PNSID" || "$PNSID" == "null" ]]; then
  echo "Could not resolve PhoneNumber SID for $TWILIO_PHONE_E164" >&2
  exit 1
fi

# Update messaging webhook
TWILIO_LOG_LEVEL=debug twilio api:core:incoming-phone-numbers:update \
  --sid "$PNSID" \
  --sms-url "$WEBHOOK_URL" \
  --sms-method POST

echo "✅ Inbound SMS will be forwarded to: ${EMAIL_TO:-brett@execom.ca,hello@fabsy.ca}"
echo "Webhook set to: $WEBHOOK_URL (PN SID: $PNSID)"
