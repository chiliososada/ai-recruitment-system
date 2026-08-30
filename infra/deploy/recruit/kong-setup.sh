#!/usr/bin/env bash
# Wire recruit.toyousoft.co.jp into the host Kong gateway (admin: 127.0.0.1:8001).
# Purely ADDITIVE + idempotent: creates recruit-* services/routes only; never
# modifies existing services, routes, or certificates.
#
#   recruit-api : hosts recruit/www.recruit paths /api/  (strip_path=false) -> 127.0.0.1:56301
#   recruit-web : hosts recruit/www.recruit paths /      (strip_path=true)  -> 127.0.0.1:56300
#   acme-recruit: /.well-known/acme-challenge for both hosts -> same backend
#                 the other domains use (resolved from the existing acme route)
set -euo pipefail
ADMIN="http://127.0.0.1:8001"
HOSTS='["recruit.toyousoft.co.jp","www.recruit.toyousoft.co.jp"]'

j() { python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('id') or d.get('message') or d)"; }

ensure_service() { # name url
  if curl -fsS "$ADMIN/services/$1" >/dev/null 2>&1; then
    echo "service $1: exists"
  else
    curl -fsS -X POST "$ADMIN/services" -H 'Content-Type: application/json' \
      -d "{\"name\":\"$1\",\"url\":\"$2\"}" | j
    echo "service $1: created -> $2"
  fi
}

ensure_route() { # name service json-body
  if curl -fsS "$ADMIN/routes/$1" >/dev/null 2>&1; then
    echo "route $1: exists"
  else
    curl -fsS -X POST "$ADMIN/services/$2/routes" -H 'Content-Type: application/json' -d "$3" | j
    echo "route $1: created"
  fi
}

ensure_service recruit-api 'http://127.0.0.1:56301'
ensure_service recruit-web 'http://127.0.0.1:56300'

ensure_route recruit-api recruit-api \
  "{\"name\":\"recruit-api\",\"hosts\":$HOSTS,\"paths\":[\"/api/\"],\"strip_path\":false,\"preserve_host\":true}"
ensure_route recruit-web recruit-web \
  "{\"name\":\"recruit-web\",\"hosts\":$HOSTS,\"paths\":[\"/\"],\"strip_path\":true,\"preserve_host\":true}"

# ACME challenge route: reuse the same backend service the existing challenge
# route points at (house pattern), via a NEW additive route for our hosts.
ACME_SVC="$(curl -fsS "$ADMIN/routes?size=200" | python3 -c "
import json,sys
for r in json.load(sys.stdin).get('data',[]):
    ps = r.get('paths') or []
    if any('acme-challenge' in p for p in ps):
        print(r['service']['id']); break
")"
if [ -n "$ACME_SVC" ]; then
  ensure_route acme-recruit "$ACME_SVC" \
    "{\"name\":\"acme-recruit\",\"hosts\":$HOSTS,\"paths\":[\"~/\\\\.well-known/acme-challenge\"],\"strip_path\":true}"
else
  echo "WARN: no existing acme-challenge route found; issue the cert another way"
fi

echo
echo "Kong routes ready. Next:"
echo "  1) sudo certbot certonly --webroot -w /var/certbot/web -n \\"
echo "       -d recruit.toyousoft.co.jp -d www.recruit.toyousoft.co.jp --cert-name recruit.toyousoft.co.jp"
echo "  2) sudo ./kong-cert.sh   (uploads the cert to Kong + registers both SNIs)"
