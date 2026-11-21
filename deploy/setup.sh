#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run setup.sh as root (for example: sudo bash /opt/kiwiapi/deploy/setup.sh)." >&2
  exit 1
fi

APP_ROOT="/opt/kiwiapi"
TMP_ROOT="/var/lib/kiwiapi"
DEPLOY_DIR="${APP_ROOT}/deploy"
VENV_DIR="${APP_ROOT}/api/venv"
SERVICE_USER="kiwi"

echo "[1/9] Installing base packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ffmpeg python3-venv python3-pip curl rsync ufw debian-keyring debian-archive-keyring apt-transport-https gnupg

echo "[2/9] Installing Caddy from the official repository..."
if [[ ! -f /usr/share/keyrings/caddy-stable-archive-keyring.gpg ]]; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
fi
if [[ ! -f /etc/apt/sources.list.d/caddy-stable.list ]]; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' -o /etc/apt/sources.list.d/caddy-stable.list
fi
apt-get update -qq
apt-get install -y -qq caddy
if [[ -f "${DEPLOY_DIR}/Caddyfile" ]]; then
  install -m 644 "${DEPLOY_DIR}/Caddyfile" /etc/caddy/Caddyfile
  caddy validate --config /etc/caddy/Caddyfile
fi

echo "[3/9] Installing cloudflared from Cloudflare's official repository..."
mkdir -p --mode=0755 /usr/share/keyrings
if [[ ! -f /usr/share/keyrings/cloudflare-main.gpg ]]; then
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg -o /usr/share/keyrings/cloudflare-main.gpg
fi
echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' > /etc/apt/sources.list.d/cloudflared.list
apt-get update -qq
apt-get install -y -qq cloudflared

echo "[4/9] Creating service user and directories..."
if ! id -u "${SERVICE_USER}" >/dev/null 2>&1; then
  useradd --system --no-create-home --shell /usr/sbin/nologin "${SERVICE_USER}"
fi
mkdir -p "${APP_ROOT}/api" "${APP_ROOT}/www/main" "${APP_ROOT}/www/dl" "${DEPLOY_DIR}" "${TMP_ROOT}/tmp"
chown -R "${SERVICE_USER}:${SERVICE_USER}" "${APP_ROOT}" "${TMP_ROOT}"

echo "[5/9] Setting up Python virtualenv and installing API dependencies..."
if [[ ! -d "${VENV_DIR}" ]]; then
  runuser -u "${SERVICE_USER}" -- python3 -m venv "${VENV_DIR}"
fi
runuser -u "${SERVICE_USER}" -- "${VENV_DIR}/bin/pip" install --quiet --upgrade pip
if [[ -f "${APP_ROOT}/api/requirements.txt" ]]; then
  FILTERED_REQ="$(mktemp)"
  trap 'rm -f "${FILTERED_REQ}"' EXIT
  grep -Ev '^[[:space:]]*(aiogram|httpx)([=<>!~[:space:]]|$)' "${APP_ROOT}/api/requirements.txt" > "${FILTERED_REQ}" || true
  chmod 644 "${FILTERED_REQ}"
  runuser -u "${SERVICE_USER}" -- "${VENV_DIR}/bin/pip" install --quiet -r "${FILTERED_REQ}"
else
  echo "Note: ${APP_ROOT}/api/requirements.txt not found yet; deploy.sh will install dependencies once uploaded."
fi

echo "[6/9] Preparing /opt/kiwiapi/.env..."
if [[ ! -f "${APP_ROOT}/.env" ]]; then
  if [[ -f "${DEPLOY_DIR}/.env.example" ]]; then
    cp "${DEPLOY_DIR}/.env.example" "${APP_ROOT}/.env"
  else
    touch "${APP_ROOT}/.env"
  fi
  chown "${SERVICE_USER}:${SERVICE_USER}" "${APP_ROOT}/.env"
  chmod 600 "${APP_ROOT}/.env"
  echo "Reminder: edit ${APP_ROOT}/.env and fill in real API_KEYS and WEB_KEY before starting kiwiapi."
else
  chown "${SERVICE_USER}:${SERVICE_USER}" "${APP_ROOT}/.env"
  chmod 600 "${APP_ROOT}/.env"
fi

echo "[7/9] Installing systemd services and timers..."
for unit in kiwiapi.service update-ytdlp.service update-ytdlp.timer cleanup-tmp.service cleanup-tmp.timer; do
  install -m 644 "${DEPLOY_DIR}/${unit}" "/etc/systemd/system/${unit}"
done
systemctl daemon-reload
systemctl enable kiwiapi.service update-ytdlp.timer cleanup-tmp.timer caddy.service

echo "[8/9] Configuring UFW firewall (SSH port 22 only)..."
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw --force enable

echo "[9/9] Setup complete. Next steps:"
echo "  1. Generate keys with: openssl rand -hex 24"
echo "  2. Fill in /opt/kiwiapi/.env (API_KEYS, WEB_KEY, ALLOWED_ORIGINS, TMP_DIR, MAX_SECONDS)."
echo "  3. Run: cloudflared tunnel login && cloudflared tunnel create kiwiapi"
echo "  4. Route DNS for kiwiapi.net, dl.kiwiapi.net, and api.kiwiapi.net, then copy deploy/cloudflared-config.yml to /etc/cloudflared/config.yml."
echo "  5. Start services: systemctl enable --now cloudflared kiwiapi caddy update-ytdlp.timer cleanup-tmp.timer"
