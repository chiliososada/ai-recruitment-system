#!/usr/bin/env bash
# recruit.toyousoft.co.jp — build + start the full stack on the HPE host.
# Additive: only touches the `recruit` compose project (127.0.0.1:56300/56301/56310).
# Public exposure is done separately via kong-setup.sh / kong-cert.sh.
set -euo pipefail
cd "$(dirname "$0")"

COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env"

[ -f .env ] || {
  echo "ERROR: .env missing. Run: python3 gen-keys.py > .env && cat .env.example  (then append the non-secret vars)"
  exit 1
}
grep -q '^JWT_SECRET=CHANGE_ME' .env && { echo "ERROR: .env still has CHANGE_ME placeholders"; exit 1; }

# Record the deployed commit into the env (shown at /health).
GIT_COMMIT="$(git -C ../../.. rev-parse --short HEAD 2>/dev/null || echo unknown)"
sed -i "s/^GIT_COMMIT=.*/GIT_COMMIT=${GIT_COMMIT}/" .env

echo "== 1/6 start db =="
$COMPOSE up -d db
# The supabase image restarts postgres during first-boot init; tolerate exec drops.
for i in $(seq 1 90); do
  if $COMPOSE exec -T db pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1; then break; fi
  [ "$i" = "90" ] && { echo "FAIL: db never became ready"; exit 1; }
  sleep 2
done

echo "== 2/6 start supabase services + clamav =="
$COMPOSE up -d auth rest storage sbgw clamav

echo "== 3/6 apply app migrations =="
./migrate.sh

echo "== 4/6 build api + web images =="
$COMPOSE build api web

echo "== 5/6 start api + web =="
$COMPOSE up -d api web

echo "== 6/6 smoke =="
ok=0
for i in $(seq 1 45); do
  if curl -fsS --max-time 3 http://127.0.0.1:56301/health >/dev/null 2>&1; then ok=1; break; fi
  sleep 2
done
[ "$ok" = "1" ] || { echo "FAIL: api /health not responding"; $COMPOSE logs --tail 40 api; exit 1; }
curl -fsS http://127.0.0.1:56301/health; echo
for i in $(seq 1 30); do
  curl -fsS --max-time 3 http://127.0.0.1:56301/ready >/dev/null 2>&1 && { echo "ready: OK"; break; }
  [ "$i" = "30" ] && echo "WARN: /ready not OK yet (check db wiring)"
  sleep 2
done
curl -fsS -o /dev/null -w "web: HTTP %{http_code}\n" http://127.0.0.1:56300/

echo
echo "DEPLOY OK — next (first time only): sudo-less ./kong-setup.sh then cert steps (see README_JA.md)"
$COMPOSE ps --format 'table {{.Name}}\t{{.Status}}\t{{.Ports}}' | sed -n '1,12p'
