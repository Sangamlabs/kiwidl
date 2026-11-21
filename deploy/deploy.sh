#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: bash deploy/deploy.sh user@server" >&2
  exit 1
fi

TARGET="$1"
REMOTE_ROOT="/opt/kiwiapi"
RSYNC_OPTS=(-az --delete)

echo "[1/7] Syncing static main site (www/main)..."
rsync "${RSYNC_OPTS[@]}" www/main/ "${TARGET}:${REMOTE_ROOT}/www/main/"

echo "[2/7] Syncing downloader site (www/dl)..."
rsync "${RSYNC_OPTS[@]}" www/dl/ "${TARGET}:${REMOTE_ROOT}/www/dl/"

echo "[3/7] Syncing API code (api)..."
rsync "${RSYNC_OPTS[@]}" \
  --exclude 'venv/' \
  --exclude '__pycache__/' \
  --exclude '*.pyc' \
  --exclude '.env' \
  api/ "${TARGET}:${REMOTE_ROOT}/api/"

echo "[4/7] Syncing deploy configs (deploy)..."
rsync -az deploy/ "${TARGET}:${REMOTE_ROOT}/deploy/"

echo "[5/7] Fixing ownership and updating Python dependencies on server..."
ssh "${TARGET}" 'set -euo pipefail
  sudo chown -R kiwi:kiwi /opt/kiwiapi/www /opt/kiwiapi/api /opt/kiwiapi/deploy
  FILTERED_REQ="$(mktemp)"
  trap "rm -f \"${FILTERED_REQ}\"" EXIT
  grep -Ev "^[[:space:]]*(aiogram|httpx)([=<>!~[:space:]]|$)" /opt/kiwiapi/api/requirements.txt > "${FILTERED_REQ}" || true
  chmod 644 "${FILTERED_REQ}"
  sudo runuser -u kiwi -- /opt/kiwiapi/api/venv/bin/pip install --quiet -r "${FILTERED_REQ}"
'

echo "[6/7] Updating Caddyfile and restarting services..."
ssh "${TARGET}" 'set -euo pipefail
  sudo install -m 644 /opt/kiwiapi/deploy/Caddyfile /etc/caddy/Caddyfile
  sudo caddy validate --config /etc/caddy/Caddyfile
  sudo systemctl restart kiwiapi
  sudo systemctl reload caddy
'

echo "[7/7] Running health checks..."
FAILED=0

check_remote() {
  local label="$1"
  local cmd="$2"
  if ssh "${TARGET}" "${cmd}" >/dev/null 2>&1; then
    echo "OK     ${label}"
  else
    echo "FAILED ${label}"
    FAILED=1
  fi
}

check_public() {
  local label="$1"
  local url="$2"
  if curl -fsS --max-time 15 "${url}" >/dev/null 2>&1; then
    echo "OK     ${label}"
  else
    echo "FAILED ${label}"
    FAILED=1
  fi
}

sleep 2
check_remote "local Caddy (dl.kiwiapi.net on 127.0.0.1:8080)" "curl -fsS http://127.0.0.1:8080 -H 'Host: dl.kiwiapi.net'"
check_remote "local FastAPI (/docs on 127.0.0.1:8000)" "curl -fsS http://127.0.0.1:8000/docs"
check_public "public https://kiwiapi.net" "https://kiwiapi.net"
check_public "public https://dl.kiwiapi.net" "https://dl.kiwiapi.net"
check_public "public https://api.kiwiapi.net/docs" "https://api.kiwiapi.net/docs"

if [[ "${FAILED}" -ne 0 ]]; then
  echo "One or more health checks failed." >&2
  exit 1
fi

echo "Deploy complete and all health checks passed."
