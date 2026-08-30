#!/usr/bin/env bash
# Upload/refresh the recruit.toyousoft.co.jp Let's Encrypt cert into Kong and
# bind both SNIs to it. Idempotent: PATCHes the existing certificate if the
# SNI is already registered. Run with sudo (reads /etc/letsencrypt/live).
set -euo pipefail
ADMIN="http://127.0.0.1:8001"
LIVE="/etc/letsencrypt/live/recruit.toyousoft.co.jp"
[ -r "$LIVE/fullchain.pem" ] || { echo "ERROR: $LIVE not readable (run with sudo, after certbot)"; exit 1; }

CERT_ID="$(curl -fsS "$ADMIN/snis/recruit.toyousoft.co.jp" 2>/dev/null \
  | python3 -c "import json,sys;print(json.load(sys.stdin)['certificate']['id'])" 2>/dev/null || true)"

if [ -n "$CERT_ID" ]; then
  curl -fsS -X PATCH "$ADMIN/certificates/$CERT_ID" \
    --data-urlencode "cert@$LIVE/fullchain.pem" \
    --data-urlencode "key@$LIVE/privkey.pem" >/dev/null
  echo "certificate refreshed (id ${CERT_ID:0:8})"
else
  curl -fsS -X POST "$ADMIN/certificates" \
    --data-urlencode "cert@$LIVE/fullchain.pem" \
    --data-urlencode "key@$LIVE/privkey.pem" \
    --data 'snis[]=recruit.toyousoft.co.jp' \
    --data 'snis[]=www.recruit.toyousoft.co.jp' >/dev/null
  echo "certificate uploaded + SNIs registered"
fi
echo "verify: curl -sI https://recruit.toyousoft.co.jp | head -3"
