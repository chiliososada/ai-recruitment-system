#!/usr/bin/env bash
# Auto-renew the recruit.toyousoft.co.jp certificate and refresh it in Kong.
# Runs from root's cron (/etc/cron.d/certbot-renew-recruit), twice daily.
# Scope-limited: --cert-name touches ONLY our lineage; other domains on this
# host keep their own workflows. kong-cert.sh PATCH is idempotent, so we
# refresh Kong unconditionally (no-op when the cert on disk is unchanged).
set -uo pipefail
LOG=/var/log/certbot-renew-recruit.log
DIR="$(cd "$(dirname "$0")" && pwd)"
{
  echo "=== $(date -Is) renew check ==="
  docker run --rm \
    -v /etc/letsencrypt:/etc/letsencrypt \
    -v /var/certbot/web:/var/certbot/web \
    certbot/certbot renew --cert-name recruit.toyousoft.co.jp \
    --webroot -w /var/certbot/web --quiet || echo "certbot exit=$?"
  bash "$DIR/kong-cert.sh"
} >>"$LOG" 2>&1
